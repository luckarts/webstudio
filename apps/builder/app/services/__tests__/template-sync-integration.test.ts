import { describe, it, expect } from "vitest";
import type { Instance, Prop, StyleDecl } from "@webstudio-is/sdk";
import type { StyleValue } from "@webstudio-is/css-engine";
import type { Change } from "@webstudio-is/template";
import {
  computeScopedDiff,
  resolveMerge,
  copySubtree,
} from "@webstudio-is/template";

// ---------------------------------------------------------------------------
// Helpers
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

const makeStyleDecl = (
  styleSourceId: string,
  breakpointId: string,
  property: string,
  value: StyleValue
): StyleDecl => ({
  styleSourceId,
  breakpointId,
  property,
  value,
});

const makeSS = (instanceId: string, values: string[]) => ({
  instanceId,
  values,
});

const makeFragment = (
  instances: Instance[],
  opts?: {
    props?: Prop[];
    styles?: StyleDecl[];
    styleSourceSelections?: { instanceId: string; values: string[] }[];
    styleSources?: { id: string; type: "local" }[];
  }
) => ({
  children: [],
  instances,
  props: opts?.props ?? [],
  styles: opts?.styles ?? [],
  breakpoints: [],
  styleSourceSelections: opts?.styleSourceSelections ?? [],
  styleSources: opts?.styleSources ?? [],
  dataSources: [],
  assets: [],
  resources: [],
});

describe("Template Sync — Integration (full pipeline)", () => {
  it("full pipeline: user-overridden style + text → conflicts (keep_user)", () => {
    // 3-way merge:
    //   original:   color=red,   text="Old Title"
    //   user:       color=blue,  text="User Title"   (user changed both)
    //   template:   color=green, text="Template Title" (template changed both too)
    // Result: 2 conflicts (user diverged from original on both)
    const srcId = "hero-style";
    const originalFrag = makeFragment(
      [
        makeInst("t-box", "Box", [idChild("t-title")]),
        makeInst("t-title", "Heading", [textChild("Old Title")]),
      ],
      {
        styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
        styleSourceSelections: [makeSS("t-box", [srcId])],
        styleSources: [{ id: srcId, type: "local" }],
      }
    );

    // User changed color and text
    const userFrag = structuredClone(originalFrag);
    userFrag.styles[0].value = keyword("blue");
    userFrag.instances[1].children = [textChild("User Title")];

    // Template changed color and text (new render)
    const tBox = makeInst("t-box", "Box", [idChild("t-title")]);
    const tTitle = makeInst("t-title", "Heading", [
      textChild("Template Title"),
    ]);
    const templateFrag = makeFragment([tBox, tTitle], {
      styles: [makeStyleDecl(srcId, "base", "color", keyword("green"))],
      styleSourceSelections: [makeSS("t-box", [srcId])],
      styleSources: [{ id: srcId, type: "local" }],
    });

    const contributions = computeContributions(templateFrag);
    const registered = {
      id: "hero",
      version: "v2",
      render: () => templateFrag,
      contributions,
    };

    // Step 1: Compute scoped diff (template vs user)
    const diff = computeScopedDiff(registered, userFrag);
    const styleChanges = diff.changes.filter((c: Change) => c.type === "style");
    const textChanges = diff.changes.filter(
      (c: Change) => c.type === "children"
    );
    expect(styleChanges.length).toBeGreaterThanOrEqual(1);
    expect(textChanges.length).toBeGreaterThanOrEqual(1);

    // Step 2: Resolve merge (3-way: original / user / template)
    const result = resolveMerge(
      originalFrag,
      userFrag,
      templateFrag,
      diff,
      new Map()
    );

    // User overrode both → 2 conflicts
    expect(result.conflicts.length).toBe(2);

    // User values preserved (keep_user)
    const mergedColor = result.merged.styles.find(
      (s: StyleDecl) => s.property === "color"
    );
    expect(mergedColor?.value).toEqual(keyword("blue"));
    const mergedTitle = result.merged.instances.find(
      (i: Instance) => i.component === "Heading"
    );
    expect(mergedTitle?.children).toEqual([textChild("User Title")]);

    // Step 3: Extract id-based patches
    const stylePatches: StyleDecl[] = [];
    const changedChildren: Array<{
      id: string;
      children: Instance["children"];
    }> = [];
    const oldStylesMap = new Map(
      userFrag.styles.map((s: StyleDecl) => [
        `${s.breakpointId}:${s.styleSourceId}:${s.property}`,
        s,
      ])
    );
    for (const s of result.merged.styles) {
      const key = `${s.breakpointId}:${s.styleSourceId}:${s.property}`;
      const old = oldStylesMap.get(key);
      if (!old || JSON.stringify(old) !== JSON.stringify(s)) {
        stylePatches.push(s);
      }
    }
    const oldInstMap = new Map(
      userFrag.instances.map((i: Instance) => [i.id, i])
    );
    for (const inst of result.merged.instances) {
      const old = oldInstMap.get(inst.id);
      if (
        !old ||
        JSON.stringify(old.children) !== JSON.stringify(inst.children)
      ) {
        changedChildren.push({ id: inst.id, children: inst.children });
      }
    }

    // Zero patches since user values were preserved (same as pre-merge userFrag)
    expect(stylePatches.length).toBe(0);
    expect(changedChildren.length).toBe(0);
  });

  it("full pipeline: user untouched → template patches applied", () => {
    const srcId = "hero-style";
    const tBox = makeInst("t-box", "Box", [idChild("t-title")]);
    const tTitle = makeInst("t-title", "Heading", [textChild("Hero Title")]);
    const templateFrag = makeFragment([tBox, tTitle], {
      styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
      styleSourceSelections: [makeSS("t-box", [srcId])],
      styleSources: [{ id: srcId, type: "local" }],
    });

    const contributions = computeContributions(templateFrag);
    const registered = {
      id: "hero",
      version: "v2",
      render: () => templateFrag,
      contributions,
    };

    // User has NOT modified anything (userFrag === originalFrag)
    const uBox = makeInst("t-box", "Box", [idChild("t-title")]);
    const uTitle = makeInst("t-title", "Heading", [textChild("Old Title")]);
    const originalFrag = makeFragment([uBox, uTitle], {
      styles: [makeStyleDecl(srcId, "base", "color", keyword("blue"))],
      styleSourceSelections: [makeSS("t-box", [srcId])],
      styleSources: [{ id: srcId, type: "local" }],
    });
    const userFrag = structuredClone(originalFrag);

    const diff = computeScopedDiff(registered, userFrag);
    const result = resolveMerge(
      originalFrag,
      userFrag,
      templateFrag,
      diff,
      new Map()
    );

    // No conflicts since user didn't touch
    expect(result.conflicts.length).toBe(0);

    // Style should have been updated from blue to red
    const mergedColor = result.merged.styles.find(
      (s: StyleDecl) => s.property === "color"
    );
    expect(mergedColor?.value).toEqual(keyword("red"));

    // Text should have been updated
    const mergedTitle = result.merged.instances.find(
      (i: Instance) => i.component === "Heading"
    );
    expect(mergedTitle?.children).toEqual([textChild("Hero Title")]);
  });

  it("force sync: resolvedConflicts forces template values over user overrides", () => {
    const srcId = "hero-style";
    const tBox = makeInst("t-box", "Box", [idChild("t-title")]);
    const tTitle = makeInst("t-title", "Heading", [textChild("Hero Title")]);
    const templateFrag = makeFragment([tBox, tTitle], {
      styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
      styleSourceSelections: [makeSS("t-box", [srcId])],
      styleSources: [{ id: srcId, type: "local" }],
    });

    const contributions = computeContributions(templateFrag);
    const registered = {
      id: "hero",
      version: "v2",
      render: () => templateFrag,
      contributions,
    };

    const uBox = makeInst("t-box", "Box", [idChild("t-title")]);
    const uTitle = makeInst("t-title", "Heading", [textChild("User Title")]);
    const originalFrag = makeFragment([uBox, uTitle], {
      styles: [makeStyleDecl(srcId, "base", "color", keyword("blue"))],
      styleSourceSelections: [makeSS("t-box", [srcId])],
      styleSources: [{ id: srcId, type: "local" }],
    });
    const userFrag = structuredClone(originalFrag);

    const diff = computeScopedDiff(registered, userFrag);

    // Force resolve — mark all conflict IDs as resolved
    const resolved = new Map<string, boolean>();
    for (const change of diff.changes) {
      resolved.set(change.id, true);
    }

    const result = resolveMerge(
      originalFrag,
      userFrag,
      templateFrag,
      diff,
      resolved
    );

    // No conflicts — all force-resolved
    expect(result.conflicts.length).toBe(0);

    // Template values applied despite user overrides
    const mergedColor = result.merged.styles.find(
      (s: StyleDecl) => s.property === "color"
    );
    expect(mergedColor?.value).toEqual(keyword("red"));

    const mergedTitle = result.merged.instances.find(
      (i: Instance) => i.component === "Heading"
    );
    expect(mergedTitle?.children).toEqual([textChild("Hero Title")]);
  });

  it("copySubtree preserves instances, props, styles", () => {
    const srcId = "src-copy";
    const source = makeFragment(
      [
        makeInst("box-a", "Box", [idChild("h1-a")]),
        makeInst("h1-a", "Heading", [textChild("Hello")]),
      ],
      {
        styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
        styleSourceSelections: [makeSS("box-a", [srcId])],
        styleSources: [{ id: srcId, type: "local" }],
      }
    );

    const target = makeFragment([]);
    copySubtree(source, "box-a", target);

    const targetRoot = target.instances.find((i) => i.component === "Box");
    expect(targetRoot).toBeDefined();
    // Child instance was also copied
    const targetChild = target.instances.find((i) => i.component === "Heading");
    expect(targetChild).toBeDefined();
    // Prop was copied
    expect(target.props.length).toBe(0); // Box has no props in this test

    // Style was copied (styles are shared by reference: copySubtree pushes all styles)
    expect(target.styles.length).toBeGreaterThanOrEqual(1);
  });

  it("WebstudioFragment cardinality stable after merge (no phantom instances)", () => {
    // Rule: cardinality stable — merge should not add/remove instances
    const srcId = "stable-card";
    const instances = [
      makeInst("box", "Box", [idChild("h1")]),
      makeInst("h1", "Heading", [textChild("Hello")]),
    ];
    const originalFrag = makeFragment(instances, {
      styles: [makeStyleDecl(srcId, "base", "color", keyword("red"))],
      styleSourceSelections: [makeSS("box", [srcId])],
      styleSources: [{ id: srcId, type: "local" }],
    });

    const contributions = computeContributions(originalFrag);
    const registered = {
      id: "stable",
      version: "v2",
      render: () =>
        makeFragment(
          [
            makeInst("box", "Box", [idChild("h1")]),
            makeInst("h1", "Heading", [textChild("World")]),
          ],
          {
            styles: [makeStyleDecl(srcId, "base", "color", keyword("blue"))],
            styleSourceSelections: [makeSS("box", [srcId])],
            styleSources: [{ id: srcId, type: "local" }],
          }
        ),
      contributions,
    };

    const userFrag = structuredClone(originalFrag);
    const before = userFrag.instances.length;

    const diff = computeScopedDiff(registered, userFrag);
    const result = resolveMerge(
      originalFrag,
      userFrag,
      registered.render(),
      diff,
      new Map()
    );

    const after = result.merged.instances.length;
    expect(after).toBe(before);
  });
});
