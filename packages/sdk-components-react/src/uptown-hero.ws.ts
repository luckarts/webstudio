import type { WsComponentMeta } from "@webstudio-is/sdk";
import { section } from "@webstudio-is/sdk/normalize.css";

export const meta: WsComponentMeta = {
  presetStyle: {
    section: [
      ...section,
      {
        property: "padding-top",
        value: { type: "unparsed", value: "clamp(4rem, 38vh, 38rem)" },
      },
      {
        property: "padding-bottom",
        value: { type: "unparsed", value: "clamp(4rem, 38vh, 38rem)" },
      },
      {
        property: "width",
        value: { type: "unit", unit: "%", value: 100 },
      },
      {
        property: "min-height",
        value: { type: "unit", unit: "px", value: 400 },
      },
      {
        property: "display",
        value: { type: "keyword", value: "flex" },
      },
      {
        property: "flex-direction",
        value: { type: "keyword", value: "row" },
      },
      {
        property: "justify-content",
        value: { type: "keyword", value: "center" },
      },
      {
        property: "align-items",
        value: { type: "keyword", value: "center" },
      },
      {
        property: "position",
        value: { type: "keyword", value: "relative" },
      },
    ],
  },
  initialProps: ["id", "class"],
  props: {},
};
