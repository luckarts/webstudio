import type { Prop, StyleDecl, StyleSources } from "@webstudio-is/sdk";
import { $instances, $props, $styles, $styleSources } from "./data-stores";

export type TemplatePatchSetV2 = {
  props?: Array<{ id: string; value: Prop }>;
  styles?: Array<{ key: string; value: StyleDecl }>;
  styleSources?: StyleSources;
  changedChildren?: Map<string, any>;
};

export const applyTemplatePatches = (patches: TemplatePatchSetV2) => {
  // Upsert styleSources
  if (patches.styleSources) {
    const styleSources = $styleSources.get();
    const updated = new Map(styleSources);
    for (const [id, source] of patches.styleSources) {
      updated.set(id, source);
    }
    $styleSources.set(updated);
  }

  // Update changedChildren in instances
  if (patches.changedChildren) {
    const instances = $instances.get();
    const updated = new Map(instances);
    for (const [instanceId, children] of patches.changedChildren) {
      const instance = updated.get(instanceId);
      if (instance) {
        updated.set(instanceId, {
          ...instance,
          children,
        });
      }
    }
    $instances.set(updated);
  }

  // Upsert props
  if (patches.props) {
    const props = $props.get();
    const updated = new Map(props);
    for (const { id, value } of patches.props) {
      updated.set(id, value);
    }
    $props.set(updated);
  }

  // Upsert styles
  if (patches.styles) {
    const styles = $styles.get();
    const updated = new Map(styles);
    for (const { key, value } of patches.styles) {
      updated.set(key, value);
    }
    $styles.set(updated);
  }
};
