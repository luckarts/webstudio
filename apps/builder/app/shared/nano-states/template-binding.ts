import { atom, computed } from "nanostores";
import type {
  WebstudioData,
  Pages,
  Assets,
  Breakpoints,
  StyleSources,
  DataSources,
  Resources,
} from "@webstudio-is/sdk";
import type {
  TemplateRefs,
  RegisteredTemplate,
  ContributionRegistry,
} from "@webstudio-is/template";
import { virtualExpand } from "@webstudio-is/template";
import {
  $instances,
  $props,
  $styles,
  $styleSourceSelections,
} from "../sync/data-stores";

export const $lateBinding = atom<boolean>(true);

export const $templateRefs = atom<TemplateRefs | undefined>(undefined);

export const $templateRegistry = atom<
  Map<string, RegisteredTemplate> | undefined
>(undefined);

export const $contributionRegistry = atom<ContributionRegistry | undefined>(
  undefined
);

const defaultPages = (): Pages => ({
  homePage: {
    id: "",
    name: "",
    title: "",
    path: "",
    meta: {},
    rootInstanceId: "",
  },
  pages: [],
  folders: [],
});

const defaultAssets: Assets = new Map();
const defaultBreakpoints: Breakpoints = new Map();
const defaultDataSources: DataSources = new Map();
const defaultResources: Resources = new Map();
const defaultStyleSources: StyleSources = new Map();

export const $expandedData = computed(
  [
    $lateBinding,
    $templateRefs,
    $templateRegistry,
    $instances,
    $props,
    $styles,
    $styleSourceSelections,
  ],
  (
    lateBinding,
    templateRefs,
    templateRegistry,
    instances,
    props,
    styles,
    styleSourceSelections
  ): WebstudioData => {
    if (!lateBinding || !templateRefs || !templateRegistry) {
      return {
        pages: defaultPages(),
        instances,
        props,
        styles,
        styleSources: defaultStyleSources,
        styleSourceSelections,
        breakpoints: defaultBreakpoints,
        dataSources: defaultDataSources,
        resources: defaultResources,
        assets: defaultAssets,
      };
    }

    const data: WebstudioData = {
      pages: defaultPages(),
      instances,
      props,
      styles,
      styleSources: defaultStyleSources,
      styleSourceSelections,
      breakpoints: defaultBreakpoints,
      dataSources: defaultDataSources,
      resources: defaultResources,
      assets: defaultAssets,
    };

    return virtualExpand(data, templateRegistry, templateRefs);
  }
);

export const $effectiveInstances = computed(
  [$lateBinding, $expandedData, $instances],
  (lateBinding, expandedData, instances) =>
    lateBinding ? expandedData.instances : instances
);

export const $effectiveProps = computed(
  [$lateBinding, $expandedData, $props],
  (lateBinding, expandedData, props) =>
    lateBinding ? expandedData.props : props
);

export const $effectiveStyles = computed(
  [$lateBinding, $expandedData, $styles],
  (lateBinding, expandedData, styles) =>
    lateBinding ? expandedData.styles : styles
);

export const $effectiveStyleSourceSelections = computed(
  [$lateBinding, $expandedData, $styleSourceSelections],
  (lateBinding, expandedData, styleSourceSelections) =>
    lateBinding ? expandedData.styleSourceSelections : styleSourceSelections
);
