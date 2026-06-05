import type { RegisteredTemplate, TemplateMeta } from "@webstudio-is/template";
import { createTemplateRegistry, renderTemplate } from "@webstudio-is/template";
import type { GeneratedTemplateMeta } from "@webstudio-is/template";
import {
  YouTube,
  Vimeo,
  Form,
  MarkdownEmbed,
  ContentEmbed,
  HeadSlot,
  UptownHero,
} from "@webstudio-is/sdk-components-react/templates";

let cachedRegistry: Map<string, RegisteredTemplate> | undefined;

const toGenerated = (
  id: string,
  meta: TemplateMeta
): GeneratedTemplateMeta & { id: string } => ({
  ...meta,
  id,
  template: renderTemplate(meta.template),
});

export const getTemplateRegistry = (): Map<string, RegisteredTemplate> => {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const templateMetas = [
    toGenerated("youtube", YouTube),
    toGenerated("vimeo", Vimeo),
    toGenerated("webhook-form", Form),
    toGenerated("markdown-embed", MarkdownEmbed),
    toGenerated("content-embed", ContentEmbed),
    toGenerated("head-slot", HeadSlot),
    toGenerated("uptown-hero", UptownHero),
  ];

  cachedRegistry = createTemplateRegistry(templateMetas);
  return cachedRegistry;
};
