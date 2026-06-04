import { z } from "zod";
import {
  authorizeProject,
  procedure,
  router,
} from "@webstudio-is/trpc-interface/index.server";
import {
  detectOutdatedInstances,
  computeScopedDiff,
  resolveMerge,
} from "@webstudio-is/template";
import { getTemplateRegistry } from "./template-registry.server";
import { parseInstanceData } from "@webstudio-is/project-build/index.server";
import type {
  Instance,
  Prop,
  StyleDecl,
  WebstudioFragment,
} from "@webstudio-is/sdk";

// Helper: Extract template IDs from instances
const collectUsedTemplateIds = (instances: Instance[]): Set<string> => {
  const ids = new Set<string>();
  for (const instance of instances) {
    if (instance.component === "Box" || instance.component) {
      // Check if instance has ws:templateId attribute (stored in props or metadata)
      // For now, we rely on the template registry to provide what templates are available
    }
  }
  // Alternative: scan all instances for templateId in their structure
  // This is a simplified version - actual implementation depends on schema
  return ids;
};

// Helper: Extract id-based patches from diff
interface PropPatch {
  id: string;
  value: Prop;
}

interface StylePatch {
  id: string;
  value: StyleDecl;
}

const extractPatches = (
  original: WebstudioFragment,
  merged: WebstudioFragment
): {
  propPatches: PropPatch[];
  stylePatches: StylePatch[];
  changedChildren: Map<string, Instance["children"]>;
} => {
  const propPatches: PropPatch[] = [];
  const stylePatches: StylePatch[] = [];
  const changedChildren = new Map<string, Instance["children"]>();

  // Compare props by ID
  const originalPropsMap = new Map(original.props.map((p) => [p.id, p]));
  for (const prop of merged.props) {
    const originalProp = originalPropsMap.get(prop.id);
    if (
      !originalProp ||
      JSON.stringify(originalProp) !== JSON.stringify(prop)
    ) {
      propPatches.push({ id: prop.id, value: prop });
    }
  }

  // Compare styles by composite key
  const originalStylesMap = new Map(
    original.styles.map((s) => [
      `${s.breakpointId}:${s.styleSourceId}:${s.property}`,
      s,
    ])
  );
  for (const style of merged.styles) {
    const key = `${style.breakpointId}:${style.styleSourceId}:${style.property}`;
    const originalStyle = originalStylesMap.get(key);
    if (
      !originalStyle ||
      JSON.stringify(originalStyle) !== JSON.stringify(style)
    ) {
      stylePatches.push({ id: key, value: style });
    }
  }

  // Compare instance children
  const originalInstancesMap = new Map(
    original.instances.map((i) => [i.id, i])
  );
  for (const instance of merged.instances) {
    const originalInstance = originalInstancesMap.get(instance.id);
    if (
      !originalInstance ||
      JSON.stringify(originalInstance.children) !==
        JSON.stringify(instance.children)
    ) {
      changedChildren.set(instance.id, instance.children);
    }
  }

  return { propPatches, stylePatches, changedChildren };
};

export const templateSyncRouter = router({
  syncTemplates: procedure
    .input(
      z.object({
        buildId: z.string(),
        projectId: z.string(),
        force: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const client = ctx.postgrest.client;

      // Authorize
      const isAuthorized = await authorizeProject.checkProjectPermit(
        input.projectId,
        "edit",
        ctx.authorization as any,
        client
      );
      if (!isAuthorized) {
        throw new Error("Not authorized to edit this project");
      }

      // Load Build
      const buildResult = await client
        .from("Build")
        .select("*")
        .eq("id", input.buildId)
        .eq("projectId", input.projectId)
        .single();

      if (buildResult.error || !buildResult.data) {
        throw new Error(`Build not found: ${buildResult.error?.message}`);
      }

      const build = buildResult.data as any;
      const parsedInstancesMap = parseInstanceData(build.instances);
      const parsedInstances = Array.from(parsedInstancesMap.values());
      const templateMeta = build.templateMeta
        ? JSON.parse(build.templateMeta)
        : {};

      // Guard: Legacy builds without templateId
      const usedTemplateIds = collectUsedTemplateIds(parsedInstances);
      if (
        usedTemplateIds.size === 0 &&
        Object.keys(templateMeta).length === 0
      ) {
        console.warn(
          `[template-sync] Build ${input.buildId} has no templated instances. Skipping sync.`
        );
        return {
          outdatedCount: 0,
          appliedProps: 0,
          appliedStyles: 0,
          propPatches: [],
          stylePatches: [],
          changedChildren: [],
          snapshotId: "",
          snapshotCreatedAt: new Date().toISOString(),
          updatedVersions: [],
        };
      }

      // Get template registry
      const registry = getTemplateRegistry();

      // Detect outdated — force=true bypasses version check, treats all registry entries as outdated
      const outdated = input.force
        ? Array.from(registry.entries()).map(([id, reg]) => ({
            templateId: id,
            instanceId: id,
            storedVersion: templateMeta[id]?.version ?? "",
            currentVersion: reg.version,
          }))
        : detectOutdatedInstances(
            templateMeta,
            registry,
            usedTemplateIds.size > 0 ? usedTemplateIds : undefined
          );

      if (outdated.length === 0) {
        return {
          outdatedCount: 0,
          appliedProps: 0,
          appliedStyles: 0,
          propPatches: [],
          stylePatches: [],
          changedChildren: [],
          snapshotId: "",
          snapshotCreatedAt: new Date().toISOString(),
          updatedVersions: [],
        };
      }

      // Save BuildSnapshot
      const snapshotData = {
        pages: build.pages,
        instances: build.instances,
        props: build.props,
        styles: build.styles,
        breakpoints: build.breakpoints,
        styleSources: build.styleSources,
        styleSourceSelections: build.styleSourceSelections,
        dataSources: build.dataSources,
        resources: build.resources,
        templateMeta: build.templateMeta,
        globalStyles: build.globalStyles,
        customCss: build.customCss,
        marketplaceProduct: build.marketplaceProduct,
      };

      // Generate snapshot ID (or use the one returned from DB)
      // For now, use a simple approach: fetch after insert
      const snapshotId = crypto.randomUUID();
      const snapshotInsertResult = await (client as any)
        .from("BuildSnapshot")
        .insert({
          id: snapshotId,
          buildId: input.buildId,
          projectId: input.projectId,
          reason: "pre-sync-v2",
          data: JSON.stringify(snapshotData),
        });

      if (snapshotInsertResult.error) {
        throw new Error(
          `Failed to create snapshot: ${snapshotInsertResult.error.message}`
        );
      }

      const snapshotCreatedAt = new Date().toISOString();

      // Parse build fragment
      const buildFragment: WebstudioFragment = {
        children: JSON.parse(build.pages || "[]"),
        instances: parsedInstances,
        props: JSON.parse(build.props || "[]"),
        styles: JSON.parse(build.styles || "[]"),
        styleSources: JSON.parse(build.styleSources || "[]"),
        styleSourceSelections: JSON.parse(build.styleSourceSelections || "[]"),
        breakpoints: JSON.parse(build.breakpoints || "[]"),
        dataSources: JSON.parse(build.dataSources || "[]"),
        resources: JSON.parse(build.resources || "[]"),
        assets: [],
      };

      let mergedState = structuredClone(buildFragment);
      const updatedVersions: Array<{
        templateId: string;
        oldVersion: string;
        newVersion: string;
      }> = [];

      // Process each outdated template
      for (const outdatedTpl of outdated) {
        const registered = registry.get(outdatedTpl.templateId);
        if (!registered) {
          console.warn(
            `[template-sync] Template ${outdatedTpl.templateId} not found in registry`
          );
          continue;
        }

        const newSnapshot = registered.render();
        const diff = computeScopedDiff(registered, mergedState);

        if (
          diff.changes.length === 0 &&
          diff.added.length === 0 &&
          diff.removed.length === 0
        ) {
          // No changes, just update version
          updatedVersions.push({
            templateId: outdatedTpl.templateId,
            oldVersion: outdatedTpl.storedVersion || "",
            newVersion: outdatedTpl.currentVersion,
          });
          continue;
        }

        // Merge
        console.log(
          `[sync] Merging ${outdatedTpl.templateId}: ${diff.changes.length} changes, ${diff.added.length} added`
        );
        const result = resolveMerge(
          buildFragment,
          mergedState,
          newSnapshot,
          diff,
          new Map()
        );
        mergedState = result.merged;
        console.log(
          `[sync] Merged ${outdatedTpl.templateId}: ${result.conflicts.length} conflicts`
        );

        // Count what changed between pre-merge and post-merge
        const preInst = buildFragment.instances.length;
        const postInst = mergedState.instances.length;
        const preStyles = buildFragment.styles.length;
        const postStyles = mergedState.styles.length;
        console.log(
          `[sync] Stats ${outdatedTpl.templateId}: instances ${preInst}→${postInst}, styles ${preStyles}→${postStyles}`
        );

        if (result.conflicts.length > 0) {
          console.warn(
            `[template-sync] Conflicts detected for template ${outdatedTpl.templateId}:`,
            result.conflicts
          );
        }

        updatedVersions.push({
          templateId: outdatedTpl.templateId,
          oldVersion: outdatedTpl.storedVersion || "",
          newVersion: outdatedTpl.currentVersion,
        });
      }

      // Extract patches
      const { propPatches, stylePatches, changedChildren } = extractPatches(
        buildFragment,
        mergedState
      );

      // Prepare new templateMeta
      const newTemplateMeta: Record<string, { id: string; version: string }> =
        structuredClone(templateMeta);
      for (const update of updatedVersions) {
        newTemplateMeta[update.templateId] = {
          id: update.templateId,
          version: update.newVersion,
        };
      }

      // Update Build in DB with all fields
      const dbUpdateData: Record<string, string> = {
        instances: JSON.stringify(mergedState.instances),
        props: JSON.stringify(mergedState.props),
        styles: JSON.stringify(mergedState.styles),
        styleSources: JSON.stringify(mergedState.styleSources),
        styleSourceSelections: JSON.stringify(
          mergedState.styleSourceSelections
        ),
        templateMeta: JSON.stringify(newTemplateMeta),
      };

      const updateResult = await client
        .from("Build")
        .update(dbUpdateData)
        .match({
          id: input.buildId,
          projectId: input.projectId,
        });

      if (updateResult.error) {
        throw new Error(
          `Failed to update build: ${updateResult.error.message}`
        );
      }

      return {
        outdatedCount: outdated.length,
        appliedProps: propPatches.length,
        appliedStyles: stylePatches.length,
        propPatches,
        stylePatches,
        changedChildren: Array.from(changedChildren.entries()).map(
          ([id, children]) => ({ id, children })
        ),
        snapshotId,
        snapshotCreatedAt,
        updatedVersions,
      };
    }),

  rollbackSnapshot: procedure
    .input(
      z.object({
        buildId: z.string(),
        projectId: z.string(),
        snapshotId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const client = ctx.postgrest.client;

      // Authorize
      const isAuthorized = await authorizeProject.checkProjectPermit(
        input.projectId,
        "edit",
        ctx.authorization as any,
        client
      );
      if (!isAuthorized) {
        throw new Error("Not authorized to edit this project");
      }

      // Load snapshot
      const snapshotResult = await (client as any)
        .from("BuildSnapshot")
        .select("data")
        .eq("id", input.snapshotId)
        .eq("projectId", input.projectId)
        .single();

      if (snapshotResult.error || !snapshotResult.data) {
        throw new Error(`Snapshot not found: ${snapshotResult.error?.message}`);
      }

      const snapshotData = JSON.parse((snapshotResult.data as any).data);

      // Restore all 14 fields
      const restoreData = {
        pages: snapshotData.pages,
        instances: snapshotData.instances,
        props: snapshotData.props,
        styles: snapshotData.styles,
        breakpoints: snapshotData.breakpoints,
        styleSources: snapshotData.styleSources,
        styleSourceSelections: snapshotData.styleSourceSelections,
        dataSources: snapshotData.dataSources,
        resources: snapshotData.resources,
        templateMeta: snapshotData.templateMeta,
        globalStyles: snapshotData.globalStyles,
        customCss: snapshotData.customCss,
        marketplaceProduct: snapshotData.marketplaceProduct,
      };

      const updateResult = await client
        .from("Build")
        .update(restoreData)
        .match({
          id: input.buildId,
          projectId: input.projectId,
        });

      if (updateResult.error) {
        throw new Error(
          `Failed to restore build: ${updateResult.error.message}`
        );
      }

      return {
        success: true,
        message: "Build restored to snapshot",
      };
    }),
});
