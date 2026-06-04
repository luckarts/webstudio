import { useState } from "react";
import { useStore } from "@nanostores/react";
import {
  Button,
  Flex,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  rawTheme,
  theme,
  toast,
} from "@webstudio-is/design-system";
import { $project, $buildId } from "~/shared/sync/data-stores";
import { trpcClient } from "~/shared/trpc/trpc-client";
import { applyTemplatePatches } from "~/shared/sync/template-patch-client";
import { RollbackPanel } from "./rollback-panel";

export const TemplateSyncPanel = () => {
  const project = useStore($project);
  const buildId = useStore($buildId);
  const projectId = project?.id;

  const { send: doSync, state: syncState } =
    trpcClient.templateSync.syncTemplates.useMutation();

  const [showRollback, setShowRollback] = useState(false);
  const [snapshots, setSnapshots] = useState<
    Array<{ id: string; createdAt: string; reason: string }>
  >([]);

  const handleSync = (force = false) => {
    if (!buildId || !projectId) return;

    doSync({ buildId, projectId, force }, (result) => {
      const outdatedCount = (result.outdatedCount as number) ?? 0;
      if (outdatedCount === 0) {
        toast.info("All templates up to date");
        return;
      }

      const propPatches =
        (result.propPatches as Parameters<
          typeof applyTemplatePatches
        >[0]["props"]) ?? [];
      const stylePatches =
        (result.stylePatches as Parameters<
          typeof applyTemplatePatches
        >[0]["styles"]) ?? [];
      const changedChildrenArray = result.changedChildren as
        | Array<{ id: string; children: unknown }>
        | undefined;
      const changedChildren =
        changedChildrenArray && changedChildrenArray.length > 0
          ? new Map(changedChildrenArray.map((c) => [c.id, c.children]))
          : undefined;

      if (
        propPatches.length > 0 ||
        stylePatches.length > 0 ||
        changedChildren
      ) {
        applyTemplatePatches({
          props: propPatches,
          styles: stylePatches,
          changedChildren,
        });
      }

      const snapshotId = result.snapshotId as string | null;
      if (snapshotId) {
        setSnapshots((prev) => [
          {
            id: snapshotId,
            createdAt:
              (result.snapshotCreatedAt as string) ?? new Date().toISOString(),
            reason: "pre-sync-v2",
          },
          ...prev,
        ]);
      }

      const appliedInstances = changedChildrenArray?.length ?? 0;
      const parts = [];
      if ((result.appliedProps as number) > 0)
        parts.push(`${result.appliedProps as number} props`);
      if ((result.appliedStyles as number) > 0)
        parts.push(`${result.appliedStyles as number} styles`);
      if (appliedInstances > 0) parts.push(`${appliedInstances} text nodes`);
      toast.success(
        `Synced ${outdatedCount} template(s)${parts.length > 0 ? `: ${parts.join(" + ")}` : ""}`
      );
    });
  };

  const isSubmitting = syncState === "submitting";
  const hasData = Boolean(buildId && projectId);

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button color="neutral" css={{ fontSize: 11, height: 24 }}>
          Templates
        </Button>
      </PopoverTrigger>
      <PopoverContent
        sideOffset={Number.parseFloat(rawTheme.spacing[8])}
        css={{ marginRight: theme.spacing[3], width: 280 }}
      >
        <PopoverTitle>Sync</PopoverTitle>
        <Flex direction="column" gap="2" css={{ p: theme.spacing[5] }}>
          <Flex gap="2">
            <Button
              color="primary"
              onClick={() => handleSync(false)}
              disabled={!hasData || isSubmitting}
              css={{ flex: 1 }}
            >
              {isSubmitting ? "Syncing…" : "Sync"}
            </Button>
            <Button
              color="neutral"
              onClick={() => handleSync(true)}
              disabled={!hasData || isSubmitting}
              css={{ flex: 1 }}
            >
              Force sync
            </Button>
          </Flex>

          {snapshots.length > 0 && (
            <Button
              color="ghost"
              onClick={() => setShowRollback(!showRollback)}
              css={{ alignSelf: "flex-start" }}
            >
              {showRollback ? "Hide history" : `History (${snapshots.length})`}
            </Button>
          )}

          {showRollback && buildId && projectId && (
            <RollbackPanel
              buildId={buildId}
              projectId={projectId}
              snapshots={snapshots}
              onRollbackComplete={() => setSnapshots([])}
              onBack={() => setShowRollback(false)}
            />
          )}
        </Flex>
      </PopoverContent>
    </Popover>
  );
};
