import { useState } from "react";
import { useStore } from "@nanostores/react";
import { Button, Flex, Text, toast } from "@webstudio-is/design-system";
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

      toast.success(
        `Synced ${outdatedCount} template(s): ${result.appliedProps as number} props + ${result.appliedStyles as number} styles`
      );
    });
  };

  return (
    <Flex direction="column" gap="1" css={{ px: "$2", py: "$1" }}>
      <Flex align="center" justify="between" gap="1">
        <Text>Templates</Text>
        <Flex gap="1">
          {buildId && projectId && (
            <Button
              color="primary"
              onClick={() => handleSync(false)}
              disabled={syncState === "submitting"}
              css={{ fontSize: 11, height: 24 }}
            >
              {syncState === "submitting" ? "Syncing..." : "Sync"}
            </Button>
          )}
          {buildId && projectId && (
            <Button
              color="neutral"
              onClick={() => handleSync(true)}
              disabled={syncState === "submitting"}
              css={{ fontSize: 11, height: 24 }}
            >
              Force
            </Button>
          )}
          {buildId && projectId && (
            <Button
              color="ghost"
              onClick={() => setShowRollback(!showRollback)}
              css={{ fontSize: 11 }}
            >
              History
            </Button>
          )}
        </Flex>
      </Flex>

      {showRollback && buildId && projectId && (
        <RollbackPanel
          buildId={buildId}
          projectId={projectId}
          snapshots={snapshots}
          onRollbackComplete={() => {
            setSnapshots([]);
          }}
          onBack={() => setShowRollback(false)}
        />
      )}
    </Flex>
  );
};
