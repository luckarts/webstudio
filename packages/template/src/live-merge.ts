import type { Instance, WebstudioFragment } from "@webstudio-is/sdk";

export type LiveMergeOptions = {
  tombstones?: Set<string>;
  lockOverrides?: Set<string>;
};

export const liveMerge = (
  templateFragment: WebstudioFragment,
  userFragment: WebstudioFragment,
  options?: LiveMergeOptions
): WebstudioFragment => {
  const result: WebstudioFragment = {
    children: [],
    instances: [],
    props: [],
    breakpoints: [...templateFragment.breakpoints],
    styleSources: [...templateFragment.styleSources],
    styleSourceSelections: [...templateFragment.styleSourceSelections],
    styles: [...templateFragment.styles],
    dataSources: [...templateFragment.dataSources],
    resources: [...templateFragment.resources],
    assets: [...templateFragment.assets],
  };

  const tombstones = options?.tombstones ?? new Set();

  const templateInstancesById = new Map(
    templateFragment.instances.map((inst) => [inst.id, inst])
  );

  const buildParentMap = (instances: Instance[]): Map<string, string> => {
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

  const userParentMap = buildParentMap(userFragment.instances);

  const getDescendants = (
    id: string,
    parentMap: Map<string, string>
  ): Set<string> => {
    const descendants = new Set<string>();
    for (const [childId, parentId] of parentMap) {
      if (parentId === id || descendants.has(parentId)) {
        descendants.add(childId);
      }
    }
    return descendants;
  };

  const phase1Tombstones = new Set(tombstones);

  for (const tombstoneId of phase1Tombstones) {
    const descendants = getDescendants(tombstoneId, userParentMap);
    for (const descendant of descendants) {
      phase1Tombstones.add(descendant);
    }
  }

  for (const inst of templateFragment.instances) {
    if (!phase1Tombstones.has(inst.id)) {
      result.instances.push(inst);
    }
  }

  for (const prop of templateFragment.props) {
    if (!phase1Tombstones.has(prop.instanceId)) {
      result.props.push(prop);
    }
  }

  for (const inst of userFragment.instances) {
    if (!templateInstancesById.has(inst.id) && !phase1Tombstones.has(inst.id)) {
      result.instances.push(inst);
    }
  }

  for (const prop of userFragment.props) {
    if (!phase1Tombstones.has(prop.instanceId)) {
      const existing = result.props.find((p) => p.id === prop.id);
      if (!existing) {
        result.props.push(prop);
      }
    }
  }

  return result;
};
