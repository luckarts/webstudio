import { expect, test } from "vitest";
import type { Instance, StyleDecl } from "@webstudio-is/sdk";
import type { StyleValue, StyleProperty } from "@webstudio-is/css-engine";
import {
  buildParentMap,
  getAncestors,
  indexByNodeId,
  indexByNodeIdWithSuffix,
  computeScopedDiff,
  resolveMerge,
} from "../template-merge";
import { computeNodeId } from "../template-meta";
import type { TemplateContributions } from "../template-id";

// ---------------------------------------------------------------------------
// Helpers to build realistic fragments
// ---------------------------------------------------------------------------

const keyword = (value: string): StyleValue => ({
  type: "keyword" as const,
  value,
});

const textChild = (value: string) => ({ type: "text" as const, value });
const idChild = (value: string) => ({ type: "id" as const, value });

const makeInst = (
  id: string,
  component: string,
  children: Instance["children"],
  label?: string
): Instance => ({
  type: "instance",
  id,
  component,
  label,
  children,
});

// ---------------------------------------------------------------------------
// buildParentMap / getAncestors
// ---------------------------------------------------------------------------

test("buildParentMap maps childId → parentId", () => {
  const instances = [
    makeInst("root", "Box", [idChild("a"), idChild("b")]),
    makeInst("a", "Heading", [textChild("hello")]),
    makeInst("b", "Paragraph", [textChild("world")]),
  ];
  const map = buildParentMap(instances);
  expect(map.get("a")).toBe("root");
  expect(map.get("b")).toBe("root");
  expect(map.size).toBe(2);
});

test("getAncestors returns top-down chain", () => {
  const instances = [
    makeInst("root", "Box", [idChild("mid")]),
    makeInst("mid", "Container", [idChild("leaf")]),
    makeInst("leaf", "Heading", [textChild("hi")]),
  ];
  const parentMap = buildParentMap(instances);
  const byId = new Map(instances.map((i) => [i.id, i]));
  const ancestors = getAncestors("leaf", parentMap, byId);
  expect(ancestors.map((a) => a.id)).toEqual(["root", "mid"]);
  expect(ancestors.map((a) => a.component)).toEqual(["Box", "Container"]);
});

test("getAncestors returns empty for root", () => {
  const instances = [makeInst("root", "Box", [])];
  const parentMap = buildParentMap(instances);
  const byId = new Map(instances.map((i) => [i.id, i]));
  expect(getAncestors("root", parentMap, byId)).toEqual([]);
});

// ---------------------------------------------------------------------------
// indexByNodeId / indexByNodeIdWithSuffix — nodeId matching across trees
// ---------------------------------------------------------------------------

test("indexByNodeId creates deterministic nodeIds from component path", () => {
  const instances = [
    makeInst("root", "Body", [idChild("h1")]),
    makeInst("h1", "Heading", [textChild("hello")]),
  ];
  const frag = {
    children: instances[0].children,
    instances,
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };
  const idx = indexByNodeId(frag);
  // Heading inside Body → path "Body:Heading" → deterministic hash
  for (const [nodeId, entry] of idx) {
    expect(typeof nodeId).toBe("string");
    expect(nodeId.length).toBeGreaterThan(0);
    expect(entry.id).toBeTruthy();
  }
  expect(idx.size).toBe(2);
});

test("indexByNodeIdWithSuffix: template embedded in page tree finds match via suffix", () => {
  // Template tree: Box > Heading
  const templateInstances = [
    makeInst("t-root", "Box", [idChild("t-h1")]),
    makeInst("t-h1", "Heading", [textChild("from template")]),
  ];

  // Page tree: Body > Container > Box > Heading
  // Box + Heading from template but deeper
  const pageInstances = [
    makeInst("body", "Body", [idChild("cont")]),
    makeInst("cont", "Container", [idChild("t-root")]),
    makeInst("t-root", "Box", [idChild("t-h1")]),
    makeInst("t-h1", "Heading", [textChild("from template")]),
  ];

  const pageFrag = {
    children: pageInstances[0].children,
    instances: pageInstances,
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const templateFrag = {
    children: templateInstances[0].children,
    instances: templateInstances,
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const templateIdx = indexByNodeId(templateFrag);
  const pageIdx = indexByNodeIdWithSuffix(pageFrag);

  // Every template nodeId should be findable in the page index via suffix
  for (const [nodeId] of templateIdx) {
    expect(pageIdx.has(nodeId)).toBe(true);
  }
});

test("indexByNodeIdWithSuffix: two distinct template trees in same page", () => {
  // Template A: Card > Heading
  // Template B: HeroBanner > Paragraph
  // Both embedded in same page with distinct component paths
  const pageInstances = [
    makeInst("body", "Body", [idChild("tA-root"), idChild("tB-root")]),
    makeInst("tA-root", "Card", [idChild("tA-h1")]),
    makeInst("tA-h1", "Heading", [textChild("A")]),
    makeInst("tB-root", "HeroBanner", [idChild("tB-p")]),
    makeInst("tB-p", "Paragraph", [textChild("B")]),
  ];

  const frag = {
    children: pageInstances[0].children,
    instances: pageInstances,
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const idx = indexByNodeIdWithSuffix(frag);

  // Both root nodes findable via suffix (dropping Body ancestor)
  // Different components (Card vs HeroBanner) → different nodeIds
  const cardKey = computeNodeId(pageInstances[1], [pageInstances[0]]);
  const heroKey = computeNodeId(pageInstances[3], [pageInstances[0]]);
  expect(cardKey).not.toBe(heroKey);
  expect(idx.get(cardKey)?.id).toBe("tA-root");
  expect(idx.get(heroKey)?.id).toBe("tB-root");
});

test("indexByNodeIdWithSuffix: same-component siblings match via label", () => {
  // Two Box siblings in same parent: one labeled "Header", one "Footer"
  // They share structural path after dropping root → differentiate by label
  const pageInstances = [
    makeInst("body", "Body", [idChild("box1"), idChild("box2")]),
    makeInst("box1", "Box", [], "Header"),
    makeInst("box2", "Box", [], "Footer"),
  ];

  const frag = {
    children: pageInstances[0].children,
    instances: pageInstances,
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const idx = indexByNodeIdWithSuffix(frag);

  // Same component path but different labels → distinct nodeIds
  const key1 = computeNodeId(pageInstances[1], [pageInstances[0]]);
  const key2 = computeNodeId(pageInstances[2], [pageInstances[0]]);
  expect(key1).not.toBe(key2);
  expect(idx.get(key1)?.id).toBe("box1");
  expect(idx.get(key2)?.id).toBe("box2");
});

// ---------------------------------------------------------------------------
// computeScopedDiff — style changes
// ---------------------------------------------------------------------------

const makeStyleDecl = (
  styleSourceId: string,
  breakpointId: string,
  property: StyleProperty,
  value: StyleValue
): StyleDecl => ({
  styleSourceId,
  breakpointId,
  property,
  value,
});

const makeStyleSourceSelection = (instanceId: string, values: string[]) => ({
  instanceId,
  values,
});

test("computeScopedDiff: style change detected", () => {
  const styleSourceId = "src-1";
  const tInst = makeInst("t-box", "Box", [textChild("content")]);
  const tFrag = {
    children: tInst.children,
    instances: [tInst],
    props: [],
    styles: [
      makeStyleDecl(styleSourceId, "base", "backgroundColor", keyword("red")),
    ],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-box", [styleSourceId])],
    styleSources: [{ id: styleSourceId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Box",
        propIds: new Set(),
        styleDeclKeys: new Set([`base:${styleSourceId}:backgroundColor`]),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = {
    contributions,
    render: () => tFrag,
  };

  // Merged state has same tree but different color
  const uInst = makeInst("t-box", "Box", [textChild("content")]);
  const mergedState = {
    children: uInst.children,
    instances: [uInst],
    props: [],
    styles: [
      makeStyleDecl(styleSourceId, "base", "backgroundColor", keyword("blue")),
    ],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-box", [styleSourceId])],
    styleSources: [{ id: styleSourceId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const diff = computeScopedDiff(registered, mergedState);

  expect(diff.changes.length).toBe(1);
  expect(diff.changes[0].type).toBe("style");
  expect(diff.changes[0].newValue).toEqual(keyword("red"));
  expect(diff.added).toEqual([]);
  expect(diff.removed).toEqual([]);
});

test("computeScopedDiff: style match by property across different breakpoints", () => {
  const templateSrcId = "tsrc";
  const buildSrcId = "bsrc";

  const tInst = makeInst("t-box", "Box", [textChild("hi")]);
  const tFrag = {
    children: tInst.children,
    instances: [tInst],
    props: [],
    styles: [
      makeStyleDecl(templateSrcId, "base", "backgroundColor", keyword("red")),
    ],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-box", [templateSrcId])],
    styleSources: [{ id: templateSrcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Box",
        propIds: new Set(),
        styleDeclKeys: new Set([`base:${templateSrcId}:backgroundColor`]),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = { contributions, render: () => tFrag };

  // Build has same style value but on a DIFFERENT styleSourceId + breakpoint
  const uInst = makeInst("t-box", "Box", [textChild("hi")]);
  const mergedState = {
    children: uInst.children,
    instances: [uInst],
    props: [],
    styles: [
      makeStyleDecl(buildSrcId, "bp-custom", "backgroundColor", keyword("red")),
    ],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-box", [buildSrcId])],
    styleSources: [{ id: buildSrcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  // Same value even though different source/breakpoint → no diff
  const diff = computeScopedDiff(registered, mergedState);
  expect(diff.changes.length).toBe(0);
});

test("computeScopedDiff: style change detected when value differs across breakpoints", () => {
  const templateSrcId = "tsrc";
  const buildSrcId = "bsrc";

  const tInst = makeInst("t-box", "Box", [textChild("hi")]);
  const tFrag = {
    children: tInst.children,
    instances: [tInst],
    props: [],
    styles: [
      makeStyleDecl(templateSrcId, "base", "backgroundColor", keyword("red")),
    ],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-box", [templateSrcId])],
    styleSources: [{ id: templateSrcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Box",
        propIds: new Set(),
        styleDeclKeys: new Set([`base:${templateSrcId}:backgroundColor`]),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = { contributions, render: () => tFrag };

  const uInst = makeInst("t-box", "Box", [textChild("hi")]);
  const mergedState = {
    children: uInst.children,
    instances: [uInst],
    props: [],
    styles: [
      makeStyleDecl(buildSrcId, "base", "backgroundColor", keyword("blue")),
    ],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-box", [buildSrcId])],
    styleSources: [{ id: buildSrcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const diff = computeScopedDiff(registered, mergedState);
  expect(diff.changes.length).toBe(1);
  expect(diff.changes[0].type).toBe("style");
  expect(diff.changes[0].newValue).toEqual(keyword("red"));
});

test("computeScopedDiff: no changes when everything matches", () => {
  const srcId = "src-1";
  const tInst = makeInst("t-box", "Box", [textChild("hi")]);
  const tFrag = {
    children: tInst.children,
    instances: [tInst],
    props: [],
    styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-box", [srcId])],
    styleSources: [{ id: srcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Box",
        propIds: new Set(),
        styleDeclKeys: new Set([`base:${srcId}:color`]),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = { contributions, render: () => tFrag };

  const mergedState = structuredClone(tFrag);
  const diff = computeScopedDiff(registered, mergedState);
  expect(diff.changes).toEqual([]);
  expect(diff.added).toEqual([]);
  expect(diff.removed).toEqual([]);
});

// ---------------------------------------------------------------------------
// computeScopedDiff — text children changes (the fix area)
// ---------------------------------------------------------------------------

test("computeScopedDiff: children (text) change detected", () => {
  const tInst = makeInst("t-h1", "Heading", [textChild("Hello World")]);
  const tFrag = {
    children: tInst.children,
    instances: [tInst],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Heading",
        propIds: new Set(),
        styleDeclKeys: new Set(),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = { contributions, render: () => tFrag };

  // User still has old text
  const uInst = makeInst("t-h1", "Heading", [textChild("Old Text")]);
  const mergedState = {
    children: uInst.children,
    instances: [uInst],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const diff = computeScopedDiff(registered, mergedState);

  expect(diff.changes.length).toBe(1);
  expect(diff.changes[0].type).toBe("children");
  expect(diff.changes[0].oldValue).toEqual([textChild("Old Text")]);
  expect(diff.changes[0].newValue).toEqual([textChild("Hello World")]);
});

test("computeScopedDiff: instance with id-children does NOT emit children change", () => {
  // Paragraph containing a span (id child) → not text-only → skip children diff
  const tInst = makeInst("t-p", "Paragraph", [idChild("span-1")]);
  const tFrag = {
    children: tInst.children,
    instances: [tInst, makeInst("span-1", "Span", [textChild("inner")])],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Paragraph",
        propIds: new Set(),
        styleDeclKeys: new Set(),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = { contributions, render: () => tFrag };

  const uInst = makeInst("t-p", "Paragraph", [idChild("span-1")]);
  const mergedState = {
    children: uInst.children,
    instances: [uInst, makeInst("span-1", "Span", [textChild("inner")])],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const diff = computeScopedDiff(registered, mergedState);
  const childrenChanges = diff.changes.filter((c) => c.type === "children");
  expect(childrenChanges).toEqual([]);
});

test("computeScopedDiff: text change + style change emitted together", () => {
  const srcId = "src-1";
  const tInst = makeInst("t-h1", "Heading", [textChild("New Text")]);
  const tFrag = {
    children: tInst.children,
    instances: [tInst],
    props: [],
    styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-h1", [srcId])],
    styleSources: [{ id: srcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Heading",
        propIds: new Set(),
        styleDeclKeys: new Set([`base:${srcId}:color`]),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = { contributions, render: () => tFrag };

  const uInst = makeInst("t-h1", "Heading", [textChild("Old Text")]);
  const mergedState = {
    children: uInst.children,
    instances: [uInst],
    props: [],
    styles: [makeStyleDecl(srcId, "base", "color", keyword("blue"))],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("t-h1", [srcId])],
    styleSources: [{ id: srcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const diff = computeScopedDiff(registered, mergedState);

  const childrenChanges = diff.changes.filter((c) => c.type === "children");
  const styleChanges = diff.changes.filter((c) => c.type === "style");
  expect(childrenChanges.length).toBe(1);
  expect(styleChanges.length).toBe(1);
});

// ---------------------------------------------------------------------------
// computeScopedDiff — prop changes
// ---------------------------------------------------------------------------

test("computeScopedDiff: prop change detected", () => {
  const tInst = makeInst("t-input", "Input", []);
  const tFrag = {
    children: tInst.children,
    instances: [tInst],
    props: [
      {
        id: "t-input:placeholder",
        instanceId: "t-input",
        name: "placeholder",
        type: "string" as const,
        value: "Enter name",
      },
    ],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const contributions: TemplateContributions = new Map([
    [
      computeNodeId(tInst, []),
      {
        component: "Input",
        propIds: new Set(["t-input:placeholder"]),
        styleDeclKeys: new Set(),
        structuralPath: [],
        structuralIndex: 0,
      },
    ],
  ]);

  const registered = { contributions, render: () => tFrag };

  const uInst = makeInst("t-input", "Input", []);
  const mergedState = {
    children: uInst.children,
    instances: [uInst],
    props: [
      {
        id: "t-input:placeholder",
        instanceId: "t-input",
        name: "placeholder",
        type: "string" as const,
        value: "Old placeholder",
      },
    ],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const diff = computeScopedDiff(registered, mergedState);
  expect(diff.changes.length).toBe(1);
  expect(diff.changes[0].type).toBe("prop");
  expect(diff.changes[0].newValue).toBe("Enter name");
});

// ---------------------------------------------------------------------------
// resolveMerge — style changes, keep_user logic
// ---------------------------------------------------------------------------

test("resolveMerge: style change — user untouched → template applied", () => {
  const srcId = "src-1";
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("box", "Box", [textChild("hi")])],
    props: [],
    styles: [makeStyleDecl(srcId, "base", "backgroundColor", keyword("red"))],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("box", [srcId])],
    styleSources: [{ id: srcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const userState = structuredClone(original);

  const diff = {
    changes: [
      {
        type: "style" as const,
        nodeId: "node-1",
        id: `box:base:backgroundColor`,
        oldValue: keyword("red"),
        newValue: keyword("blue"),
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());

  // Should find the merged style and update its value
  const mergedStyle = result.merged.styles[0];
  expect(mergedStyle.value).toEqual(keyword("blue"));
  expect(result.conflicts.length).toBe(0);
});

test("resolveMerge: style change — user overrode → conflict (keep_user)", () => {
  const srcId = "src-1";
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("box", "Box", [textChild("hi")])],
    props: [],
    styles: [makeStyleDecl(srcId, "base", "backgroundColor", keyword("red"))],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("box", [srcId])],
    styleSources: [{ id: srcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };

  // User changed the style themselves
  const userState = structuredClone(original);
  userState.styles[0].value = keyword("green");

  const diff = {
    changes: [
      {
        type: "style" as const,
        nodeId: "node-1",
        id: `box:base:backgroundColor`,
        oldValue: keyword("red"),
        newValue: keyword("blue"),
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());

  expect(result.conflicts.length).toBe(1);
  expect(result.conflicts[0].userValue).toEqual(keyword("green"));
  expect(result.conflicts[0].templateValue).toEqual(keyword("blue"));
  // User value preserved (skipped in merge)
  const mergedStyle = result.merged.styles[0];
  expect(mergedStyle.value).toEqual(keyword("green"));
});

// ---------------------------------------------------------------------------
// resolveMerge — text children changes (the fix area)
// ---------------------------------------------------------------------------

test("resolveMerge: children (text) change — user untouched → template applied", () => {
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("h1", "Heading", [textChild("Hello")])],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const userState = structuredClone(original);

  const diff = {
    changes: [
      {
        type: "children" as const,
        nodeId: "node-1",
        id: "h1",
        oldValue: [textChild("Hello")],
        newValue: [textChild("Hello World")],
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());

  expect(result.conflicts.length).toBe(0);
  const mergedInst = result.merged.instances[0];
  expect(mergedInst.children).toEqual([textChild("Hello World")]);
});

test("resolveMerge: children (text) change — user modified → conflict (keep_user)", () => {
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("h1", "Heading", [textChild("Hello")])],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };

  const userState = structuredClone(original);
  userState.instances[0].children = [textChild("User text")];

  const diff = {
    changes: [
      {
        type: "children" as const,
        nodeId: "node-1",
        id: "h1",
        oldValue: [textChild("Hello")],
        newValue: [textChild("Hello World")],
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());

  expect(result.conflicts.length).toBe(1);
  expect(result.conflicts[0].change.type).toBe("children");
  expect(result.conflicts[0].userValue).toEqual([textChild("User text")]);
  // User text preserved
  const mergedInst = result.merged.instances[0];
  expect(mergedInst.children).toEqual([textChild("User text")]);
});

// ---------------------------------------------------------------------------
// resolveMerge — prop changes
// ---------------------------------------------------------------------------

test("resolveMerge: prop change — user untouched → template applied", () => {
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("input", "Input", [])],
    props: [
      {
        id: "input:placeholder",
        instanceId: "input",
        name: "placeholder",
        type: "string" as const,
        value: "old",
      },
    ],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };
  const userState = structuredClone(original);

  const diff = {
    changes: [
      {
        type: "prop" as const,
        nodeId: "node-1",
        id: "input:placeholder",
        oldValue: "old",
        newValue: "new",
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());
  expect(result.conflicts.length).toBe(0);
  expect(result.merged.props[0].value).toBe("new");
});

test("resolveMerge: prop change — user overrode → conflict (keep_user)", () => {
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("input", "Input", [])],
    props: [
      {
        id: "input:placeholder",
        instanceId: "input",
        name: "placeholder",
        type: "string" as const,
        value: "old",
      },
    ],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };
  const userState = structuredClone(original);
  userState.props[0].value = "user value";

  const diff = {
    changes: [
      {
        type: "prop" as const,
        nodeId: "node-1",
        id: "input:placeholder",
        oldValue: "old",
        newValue: "new",
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());
  expect(result.conflicts.length).toBe(1);
  expect(result.merged.props[0].value).toBe("user value");
});

// ---------------------------------------------------------------------------
// resolveMerge — mixed changes (realistic scenario)
// ---------------------------------------------------------------------------

test("resolveMerge: mixed style + text + prop changes", () => {
  const srcId = "src-1";
  const original = {
    children: [] as Instance["children"],
    instances: [
      makeInst("box", "Box", [idChild("h1")]),
      makeInst("h1", "Heading", [textChild("Title")]),
    ],
    props: [
      {
        id: "h1:id",
        instanceId: "h1",
        name: "id",
        type: "string" as const,
        value: "old-id",
      },
    ],
    styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("box", [srcId])],
    styleSources: [{ id: srcId, type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };
  const userState = structuredClone(original);

  // User overrides text but not style or prop
  userState.instances[1].children = [textChild("User Title")];

  const diff = {
    changes: [
      // Style: user didn't touch → safe to apply
      {
        type: "style" as const,
        nodeId: "box-node",
        id: `box:base:color`,
        oldValue: keyword("red"),
        newValue: keyword("blue"),
      },
      // Text: user DID touch → conflict
      {
        type: "children" as const,
        nodeId: "h1-node",
        id: "h1",
        oldValue: [textChild("Title")],
        newValue: [textChild("New Template Title")],
      },
      // Prop: user didn't touch → safe to apply
      {
        type: "prop" as const,
        nodeId: "h1-node",
        id: "h1:id",
        oldValue: "old-id",
        newValue: "new-id",
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());

  // Style changed: no conflict
  expect(result.merged.styles[0].value).toEqual(keyword("blue"));

  // Text conflict
  expect(result.conflicts.length).toBe(1);
  expect(result.conflicts[0].change.type).toBe("children");
  expect(result.merged.instances[1].children).toEqual([
    textChild("User Title"),
  ]);

  // Prop changed: no conflict
  expect(result.merged.props[0].value).toBe("new-id");
});

test("resolveMerge: resolvedConflicts Map can force template value for conflicts", () => {
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("h1", "Heading", [textChild("Hello")])],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };
  const userState = structuredClone(original);
  userState.instances[0].children = [textChild("User text")];

  // resolvedConflicts allows force-applying template value
  const resolved = new Map<string, boolean>();
  resolved.set("h1", true);

  const diff = {
    changes: [
      {
        type: "children" as const,
        nodeId: "node-1",
        id: "h1",
        oldValue: [textChild("Hello")],
        newValue: [textChild("Template")],
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, resolved);

  // No conflict — resolvedConflicts forced template value
  expect(result.conflicts.length).toBe(0);
  expect(result.merged.instances[0].children).toEqual([textChild("Template")]);
});

// ---------------------------------------------------------------------------
// Edge: instance not found in merged state skip gracefully
// ---------------------------------------------------------------------------

test("resolveMerge: style change for missing instance does not crash", () => {
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("box", "Box", [])],
    props: [],
    styles: [makeStyleDecl("s1", "base", "color", keyword("red"))],
    breakpoints: [],
    styleSourceSelections: [makeStyleSourceSelection("box", ["s1"])],
    styleSources: [{ id: "s1", type: "local" as const }],
    dataSources: [],
    assets: [],
    resources: [],
  };
  const userState = structuredClone(original);
  // Instance removed from userState (e.g., user deleted it)
  userState.instances = [];
  userState.styleSourceSelections = [];

  const diff = {
    changes: [
      {
        type: "style" as const,
        nodeId: "node-1",
        id: `missing:base:color`,
        oldValue: keyword("red"),
        newValue: keyword("blue"),
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());
  // Should not crash. The change's instanceId doesn't exist in merged → skipped.
  expect(result.conflicts.length).toBe(0);
});

test("resolveMerge: children change — user removed instance → conflict", () => {
  // If user deleted the instance entirely, it diverges from original → conflict
  const original = {
    children: [] as Instance["children"],
    instances: [makeInst("h1", "Heading", [textChild("Hello")])],
    props: [],
    styles: [],
    breakpoints: [],
    styleSourceSelections: [],
    styleSources: [],
    dataSources: [],
    assets: [],
    resources: [],
  };
  const userState = structuredClone(original);
  userState.instances = []; // user removed the instance

  const diff = {
    changes: [
      {
        type: "children" as const,
        nodeId: "node-1",
        id: "h1",
        oldValue: [textChild("Hello")],
        newValue: [textChild("World")],
      },
    ],
    added: [],
    removed: [],
  };

  const result = resolveMerge(original, userState, userState, diff, new Map());
  // user deleted instance → original.children ≠ user.children → conflict
  expect(result.conflicts.length).toBe(1);
  expect(result.conflicts[0].change.type).toBe("children");
});

// ---------------------------------------------------------------------------
// Edge: template-instance with label affects nodeId
// ---------------------------------------------------------------------------

test("indexByNodeId: identical tree with different labels produce different nodeIds", () => {
  const instA = makeInst("a", "Box", [], "Header");
  const instB = makeInst("b", "Box", [], "Footer");

  const nodeIdA = computeNodeId(instA, []);
  const nodeIdB = computeNodeId(instB, []);

  expect(nodeIdA).not.toBe(nodeIdB);
});

test("indexByNodeId: same component + same label → same nodeId", () => {
  const instA = makeInst("a", "Box", [], "Section");
  const instB = makeInst("b", "Box", [], "Section");

  const nodeIdA = computeNodeId(instA, []);
  const nodeIdB = computeNodeId(instB, []);

  expect(nodeIdA).toBe(nodeIdB);
});
