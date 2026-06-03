import type { WebstudioData } from "@webstudio-is/sdk";
import type { OverrideLayer } from "./template-id";
import type { RegisteredTemplate } from "./template-meta";

export type TemplateRefs = Record<
  string,
  {
    templateId: string;
    rootInstanceId: string;
  }
>;

export const virtualExpand = (
  data: WebstudioData,
  registry: Map<string, RegisteredTemplate>,
  templateRefs?: TemplateRefs,
  overrides?: OverrideLayer
): WebstudioData => {
  const expanded: WebstudioData = {
    pages: data.pages,
    instances: new Map(data.instances),
    props: new Map(data.props),
    styles: new Map(data.styles),
    styleSources: new Map(data.styleSources),
    styleSourceSelections: new Map(data.styleSourceSelections),
    breakpoints: new Map(data.breakpoints),
    dataSources: new Map(data.dataSources),
    resources: new Map(data.resources),
    assets: new Map(data.assets),
  };

  if (!templateRefs) {
    return expanded;
  }

  for (const [rootRefId, ref] of Object.entries(templateRefs)) {
    const registered = registry.get(ref.templateId);
    if (!registered) {
      continue;
    }

    const templateFragment = registered.render();

    for (const inst of templateFragment.instances) {
      const expandedId = `${rootRefId}:${inst.id}`;
      if (!expanded.instances.has(expandedId)) {
        expanded.instances.set(expandedId, {
          ...inst,
          id: expandedId,
          children: inst.children.map((child) => {
            if (child.type === "id") {
              return {
                type: "id" as const,
                value: `${rootRefId}:${child.value}`,
              };
            }
            return child;
          }),
        });
      }
    }

    for (const prop of templateFragment.props) {
      const expandedId = `${rootRefId}:${prop.id}`;
      if (!expanded.props.has(expandedId)) {
        expanded.props.set(expandedId, {
          ...prop,
          id: expandedId,
          instanceId: `${rootRefId}:${prop.instanceId}`,
        });
      }
    }

    for (const style of templateFragment.styles) {
      const styleKey = `${style.breakpointId}:${style.styleSourceId}:${style.property}`;
      if (!expanded.styles.has(styleKey)) {
        expanded.styles.set(styleKey, style);
      }
    }
  }

  if (overrides) {
    for (const override of overrides.values()) {
      for (const [propId, prop] of override.props) {
        expanded.props.set(propId, prop);
      }
      for (const [styleKey, style] of override.styles) {
        expanded.styles.set(styleKey, style);
      }
    }
  }

  return expanded;
};
