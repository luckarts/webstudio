import type {
  Instance,
  Prop,
  StyleDecl,
  StyleSources,
} from "@webstudio-is/sdk";
import { $instances, $props, $styles, $styleSources } from "./data-stores";
import { serverSyncStore } from "./sync-stores";

export type TemplatePatchSetV2 = {
  props?: Array<{ id: string; value: Prop }>;
  styles?: Array<{ key: string; value: StyleDecl }>;
  styleSources?: StyleSources;
  changedChildren?: Map<string, Instance["children"]>;
};

export const applyTemplatePatches = (patches: TemplatePatchSetV2) => {
  serverSyncStore.createTransaction(
    [$styleSources, $instances, $props, $styles],
    (styleSources, instances, props, styles) => {
      if (patches.styleSources) {
        for (const [id, source] of patches.styleSources) {
          styleSources.set(id, source);
        }
      }

      if (patches.changedChildren) {
        for (const [instanceId, children] of patches.changedChildren) {
          const instance = instances.get(instanceId);
          if (instance) {
            instance.children = children;
          }
        }
      }

      if (patches.props) {
        for (const { id, value } of patches.props) {
          props.set(id, value);
        }
      }

      if (patches.styles) {
        for (const { key, value } of patches.styles) {
          styles.set(key, value);
        }
      }
    }
  );
};
