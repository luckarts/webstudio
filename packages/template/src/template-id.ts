import type { Prop, StyleDecl } from "@webstudio-is/sdk";

export type OverrideKey = string & { readonly __brand: "OverrideKey" };

export const expandId = (
  rootRefId: string,
  templateInstanceId: string
): OverrideKey => `${rootRefId}:${templateInstanceId}` as OverrideKey;

export const makeOverrideKey: typeof expandId = expandId;

export type TemplateContributions = Map<
  string,
  {
    component: string;
    propIds: Set<string>;
    styleDeclKeys: Set<string>;
    structuralPath: string[];
    structuralIndex: number;
  }
>;

export type ContributionRegistry = Map<string, TemplateContributions>;

export type OverrideLayer = Map<
  OverrideKey,
  {
    props: Map<string, Prop>;
    styles: Map<string, StyleDecl>;
  }
>;
