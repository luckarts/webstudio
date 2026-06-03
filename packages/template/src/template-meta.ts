import type { Instance, WebstudioFragment } from "@webstudio-is/sdk";
import type { GeneratedTemplateMeta } from "./template";
import type { TemplateContributions } from "./template-id";

export const djb2Hash = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return Math.abs(hash).toString(16);
};

export const computeNodeId = (
  instance: Instance,
  ancestors: Instance[]
): string => {
  const path = [...ancestors.map((a) => a.component), instance.component].join(
    ":"
  );
  const label = instance.label || "";
  const combined = `${path}:${label}`;
  return djb2Hash(combined);
};

export type NodeContributions = {
  component: string;
  propIds: Set<string>;
  styleDeclKeys: Set<string>;
  structuralPath: string[];
  structuralIndex: number;
};

export const computeContributions = (
  fragment: WebstudioFragment
): TemplateContributions => {
  const contributions: TemplateContributions = new Map();
  const instancesById = new Map(
    fragment.instances.map((inst) => [inst.id, inst])
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

  const parentMap = buildParentMap(fragment.instances);

  const getAncestors = (id: string): Instance[] => {
    const ancestors: Instance[] = [];
    let current = parentMap.get(id);
    while (current) {
      const inst = instancesById.get(current);
      if (inst) {
        ancestors.unshift(inst);
        current = parentMap.get(current);
      } else {
        break;
      }
    }
    return ancestors;
  };

  for (const instance of fragment.instances) {
    const ancestors = getAncestors(instance.id);
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

export type RegisteredTemplate = {
  id: string;
  version: string;
  render: () => WebstudioFragment;
  contributions: TemplateContributions;
};

export const createTemplateRegistry = (
  templateMetas: Array<GeneratedTemplateMeta & { id: string }>
): Map<string, RegisteredTemplate> => {
  const registry = new Map<string, RegisteredTemplate>();

  for (const meta of templateMetas) {
    const rendered = meta.template;
    const expanded = expandTemplateRefs(rendered);
    const version = djb2Hash(JSON.stringify(expanded));
    const contributions = computeContributions(expanded);

    registry.set(meta.id, {
      id: meta.id,
      version,
      render: () => expanded,
      contributions,
    });
  }

  return registry;
};

export const expandTemplateRefs = (
  fragment: WebstudioFragment
): WebstudioFragment => {
  return fragment;
};

export type OutdatedInstance = {
  templateId: string;
  instanceId: string;
  storedVersion: string | undefined;
  currentVersion: string;
};

export const detectOutdatedInstances = (
  templateMeta: Record<string, { id: string; version: string }> | undefined,
  registry: Map<string, RegisteredTemplate>,
  usedTemplateIds?: Set<string>
): OutdatedInstance[] => {
  const outdated: OutdatedInstance[] = [];

  if (!templateMeta) {
    return outdated;
  }

  for (const [templateId, registered] of registry) {
    if (usedTemplateIds && !usedTemplateIds.has(templateId)) {
      continue;
    }

    const stored = templateMeta[templateId];
    const storedVersion = stored?.version;
    const currentVersion = registered.version;

    if (storedVersion !== currentVersion) {
      outdated.push({
        templateId,
        instanceId: "",
        storedVersion,
        currentVersion,
      });
    }
  }

  return outdated;
};

export const getStoredTemplateVersion = (
  templateMeta: Record<string, { id: string; version: string }> | undefined,
  templateId: string
): string | undefined => {
  return templateMeta?.[templateId]?.version;
};
