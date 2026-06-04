import type { Instance, WebstudioFragment } from "@webstudio-is/sdk";
import type { TemplateContributions } from "./template-id";
import { computeNodeId } from "./template-meta";

export type PropDiff = {
  propId: string;
  oldValue: unknown;
  newValue: unknown;
};

export type StyleDiff = {
  styleDeclKey: string;
  oldValue: unknown;
  newValue: unknown;
};

export type Change = {
  type: "prop" | "style";
  nodeId: string;
  id: string;
  oldValue: unknown;
  newValue: unknown;
};

export type TemplateDiff = {
  templateId?: string;
  changes: Change[];
  added: Change[];
  removed: Change[];
};

export type Conflict = {
  change: Change;
  userValue: unknown;
  templateValue: unknown;
  keepUserResolution?: boolean;
};

export type ResolvedConflicts = Map<string, boolean>;

export type MergeResult = {
  merged: WebstudioFragment;
  conflicts: Conflict[];
};

export const buildParentMap = (instances: Instance[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const inst of instances) {
    for (const child of inst.children) {
      if (child.type === "id") {
        map.set(child.value, inst.id);
      }
    }
  }
  return map;
};

export const getAncestors = (
  id: string,
  parentMap: Map<string, string>,
  byId: Map<string, Instance>
): Instance[] => {
  const ancestors: Instance[] = [];
  let current = parentMap.get(id);
  while (current) {
    const inst = byId.get(current);
    if (inst) {
      ancestors.unshift(inst);
      current = parentMap.get(current);
    } else {
      break;
    }
  }
  return ancestors;
};

export const copySubtree = (
  source: WebstudioFragment,
  instanceId: string,
  target: WebstudioFragment,
  opts?: { idMap?: Map<string, string> }
): string => {
  const idMap = opts?.idMap ?? new Map();
  const visited = new Set<string>();

  const sourceInstancesById = new Map(
    source.instances.map((inst) => [inst.id, inst])
  );

  const copy = (id: string, newId?: string): string => {
    if (visited.has(id)) {
      return idMap.get(id) ?? id;
    }
    visited.add(id);

    const sourceInst = sourceInstancesById.get(id);
    if (!sourceInst) {
      return id;
    }

    const mappedId = newId ?? id;
    idMap.set(id, mappedId);

    const copiedInst: Instance = {
      ...sourceInst,
      id: mappedId,
      children: sourceInst.children.map((child) => {
        if (child.type === "id") {
          const newChildId = copy(child.value);
          return { type: "id" as const, value: newChildId };
        }
        return child;
      }),
    };

    target.instances.push(copiedInst);

    for (const prop of source.props) {
      if (prop.instanceId === id) {
        target.props.push({
          ...prop,
          instanceId: mappedId,
          id: `${mappedId}:${prop.name}`,
        });
      }
    }

    for (const style of source.styles) {
      target.styles.push(style);
    }

    return mappedId;
  };

  return copy(instanceId);
};

type IndexedInstance = Instance & { nodeId: string };

export const indexByNodeId = (
  frag: WebstudioFragment
): Map<string, IndexedInstance> => {
  const map = new Map<string, IndexedInstance>();
  const instancesById = new Map(frag.instances.map((inst) => [inst.id, inst]));
  const parentMap = buildParentMap(frag.instances);

  for (const inst of frag.instances) {
    const ancestors = getAncestors(inst.id, parentMap, instancesById);
    const nodeId = computeNodeId(inst, ancestors);
    map.set(nodeId, { ...inst, nodeId });
  }

  return map;
};

/**
 * Like indexByNodeId but also tries suffix paths (dropping ancestors from root).
 * When template instances live in a page tree, they have extra ancestors
 * beyond what the template's own tree has. Dropping ancestors one at a time
 * from the root produces shorter paths that may match the template's nodeIds.
 *
 * Also tries leaf-only (no ancestors) as final fallback.
 */
export const indexByNodeIdWithSuffix = (
  frag: WebstudioFragment
): Map<string, IndexedInstance> => {
  const map = indexByNodeId(frag);
  const instancesById = new Map(frag.instances.map((inst) => [inst.id, inst]));
  const parentMap = buildParentMap(frag.instances);

  for (const inst of frag.instances) {
    const ancestors = getAncestors(inst.id, parentMap, instancesById);

    for (let i = 1; i <= ancestors.length; i++) {
      const suffixNodeId = computeNodeId(inst, ancestors.slice(i));
      if (!map.has(suffixNodeId)) {
        map.set(suffixNodeId, { ...inst, nodeId: suffixNodeId });
      }
    }

    const leafNodeId = computeNodeId(inst, []);
    if (!map.has(leafNodeId)) {
      map.set(leafNodeId, { ...inst, nodeId: leafNodeId });
    }
  }

  return map;
};

/**
 * Compare styles for an instance by breakpointId + property.
 * styleSourceIds differ between template render and build, so matching
 * by styleSourceId is unreliable — match by (breakpointId + property) instead.
 */
const getInstanceStyles = (
  frag: WebstudioFragment,
  instanceId: string
): Map<string, (typeof frag.styles)[number]> => {
  const selection = frag.styleSourceSelections.find(
    (s) => s.instanceId === instanceId
  );
  if (!selection) return new Map();
  const srcIds = new Set(selection.values);
  const map = new Map<string, (typeof frag.styles)[number]>();
  for (const style of frag.styles) {
    if (srcIds.has(style.styleSourceId)) {
      map.set(`${style.breakpointId}:${style.property}`, style);
    }
  }
  return map;
};

export const computeScopedDiff = (
  registered: {
    contributions: TemplateContributions;
    render: () => WebstudioFragment;
  },
  mergedState: WebstudioFragment
): TemplateDiff => {
  const template = registered.render();
  const templateIdx = indexByNodeId(template);
  // Use suffix index for merged state: template instances embedded in a page
  // tree have extra ancestors, so full-path nodeId won't match. Suffix paths
  // (dropping ancestors from root) bridge the gap.
  const userIdx = indexByNodeIdWithSuffix(mergedState);

  const changes: Change[] = [];
  const added: Change[] = [];
  const removed: Change[] = [];

  const seenNodes = new Set<string>();
  let foundCount = 0;
  let missCount = 0;

  for (const [nodeId, contribution] of registered.contributions) {
    if (seenNodes.has(nodeId)) continue;
    seenNodes.add(nodeId);

    const templateInst = templateIdx.get(nodeId);
    if (!templateInst) continue;

    const userEntry = userIdx.get(nodeId);

    if (!userEntry) {
      missCount++;
      added.push({
        type: "prop",
        nodeId,
        id: templateInst.id,
        oldValue: null,
        newValue: null,
      });
      continue;
    }

    foundCount++;

    // Compare props
    for (const propId of contribution.propIds) {
      const templateProp = template.props.find((p) => p.id === propId);
      const mergedProp = mergedState.props.find((p) => p.id === propId);

      if (
        JSON.stringify(templateProp?.value) !==
        JSON.stringify(mergedProp?.value)
      ) {
        changes.push({
          type: "prop",
          nodeId,
          id: propId,
          oldValue: mergedProp?.value,
          newValue: templateProp?.value,
        });
      }
    }

    // Compare styles by property, matching across potential breakpoint differences.
    // Template uses "base" breakpoint but build may use a custom breakpoint ID.
    // Match by property first, then compare values using the build's breakpoint.
    const templateStyles = getInstanceStyles(template, templateInst.id);
    const mergedStyles = getInstanceStyles(mergedState, userEntry.id);

    // Index merged styles by property alone (ignoring breakpoint)
    const mergedByProperty = new Map<
      string,
      (typeof mergedState.styles)[number]
    >();
    for (const [, style] of mergedStyles) {
      // Take first style per property (prefer "base" breakpoint or first encountered)
      if (!mergedByProperty.has(style.property)) {
        mergedByProperty.set(style.property, style);
      }
    }

    for (const [, templateStyle] of templateStyles) {
      const templateProp = templateStyle.property;
      const mergedStyle = mergedByProperty.get(templateProp);

      // Use the build's actual breakpoint for the change id so resolveMerge
      // can find the style to update.
      const effectiveBp =
        mergedStyle?.breakpointId ?? templateStyle.breakpointId;

      if (
        JSON.stringify(templateStyle.value) !==
        JSON.stringify(mergedStyle?.value)
      ) {
        changes.push({
          type: "style",
          nodeId,
          id: `${userEntry.id}:${effectiveBp}:${templateProp}`,
          oldValue: mergedStyle?.value,
          newValue: templateStyle.value,
        });
      }
    }
  }

  return { changes, added, removed };
};

export const detectScopedConflicts = (
  userState: WebstudioFragment,
  templateDiff: TemplateDiff
): Conflict[] => {
  const conflicts: Conflict[] = [];

  for (const change of templateDiff.changes) {
    const userProp = userState.props.find((p) => p.id === change.id);
    if (userProp && userProp.value !== change.oldValue) {
      conflicts.push({
        change,
        userValue: userProp.value,
        templateValue: change.newValue,
      });
    }
  }

  return conflicts;
};

export const resolveMerge = (
  original: WebstudioFragment,
  userState: WebstudioFragment,
  _newSnapshot: WebstudioFragment,
  diff: TemplateDiff,
  resolvedConflicts: ResolvedConflicts
): MergeResult => {
  const merged = structuredClone(userState);
  const conflicts: Conflict[] = [];

  const getStyleForInstance = (
    frag: WebstudioFragment,
    instanceId: string,
    breakpointId: string,
    property: string
  ) => {
    const sel = frag.styleSourceSelections.find(
      (s) => s.instanceId === instanceId
    );
    if (!sel) return undefined;
    const srcIds = new Set(sel.values);
    return frag.styles.find(
      (s) =>
        srcIds.has(s.styleSourceId) &&
        s.breakpointId === breakpointId &&
        s.property === property
    );
  };

  for (const change of diff.changes) {
    if (change.type === "style") {
      // id format: instanceId:breakpointId:property
      const firstColon = change.id.indexOf(":");
      const instanceId = change.id.slice(0, firstColon);
      const rest = change.id.slice(firstColon + 1);
      const secondColon = rest.indexOf(":");
      const breakpointId = rest.slice(0, secondColon);
      const property = rest.slice(secondColon + 1);

      const originalStyle = getStyleForInstance(
        original,
        instanceId,
        breakpointId,
        property
      );
      const userStyle = getStyleForInstance(
        userState,
        instanceId,
        breakpointId,
        property
      );
      const hasConflict =
        JSON.stringify(originalStyle?.value) !==
        JSON.stringify(userStyle?.value);

      if (hasConflict && resolvedConflicts.get(change.id) !== true) {
        conflicts.push({
          change,
          userValue: userStyle?.value,
          templateValue: change.newValue,
        });
        continue;
      }

      const mergedStyle = getStyleForInstance(
        merged,
        instanceId,
        breakpointId,
        property
      );
      if (mergedStyle) {
        (mergedStyle as { value: unknown }).value = change.newValue;
      }

      continue;
    }

    // Prop change
    const originalProp = original.props.find((p) => p.id === change.id);
    const userProp = userState.props.find((p) => p.id === change.id);
    const hasConflict =
      JSON.stringify(originalProp?.value) !== JSON.stringify(userProp?.value);
    const resolution = resolvedConflicts.get(change.id);

    if (hasConflict && resolution !== true) {
      conflicts.push({
        change,
        userValue: userState.props.find((p) => p.id === change.id)?.value,
        templateValue: change.newValue,
      });
      continue;
    }

    const prop = merged.props.find((p) => p.id === change.id);
    if (prop) {
      prop.value = change.newValue;
    }
  }

  return { merged, conflicts };
};

export const extractContributions = (
  fragment: WebstudioFragment
): TemplateContributions => {
  const contributions: TemplateContributions = new Map();
  const instancesById = new Map(
    fragment.instances.map((inst) => [inst.id, inst])
  );
  const parentMap = buildParentMap(fragment.instances);

  for (const instance of fragment.instances) {
    const ancestors = getAncestors(instance.id, parentMap, instancesById);
    const nodeId = computeNodeId(instance, ancestors);

    const propIds = new Set<string>();
    for (const prop of fragment.props) {
      if (prop.instanceId === instance.id) {
        propIds.add(prop.id);
      }
    }

    const styleDeclKeys = new Set<string>();
    for (const style of fragment.styles) {
      for (const selection of fragment.styleSourceSelections) {
        if (selection.instanceId === instance.id) {
          for (const styleSourceId of selection.values) {
            styleDeclKeys.add(
              `${style.breakpointId}:${styleSourceId}:${style.property}`
            );
          }
        }
      }
    }

    contributions.set(nodeId, {
      component: instance.component,
      propIds,
      styleDeclKeys,
      structuralPath: ancestors.map((a) => a.component),
      structuralIndex: ancestors.length,
    });
  }

  return contributions;
};
