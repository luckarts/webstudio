import { useState } from "react";
import { Button, toast } from "@webstudio-is/design-system";
import { nativeClient } from "~/shared/trpc/trpc-client";

interface Snapshot {
  id: string;
  createdAt: string;
  reason: string;
}

interface RollbackPanelProps {
  projectId: string;
  buildId: string;
  snapshots: Snapshot[];
  onRollbackComplete: () => void;
  onBack: () => void;
}

export const RollbackPanel = ({
  projectId,
  buildId,
  snapshots,
  onRollbackComplete,
  onBack,
}: RollbackPanelProps) => {
  const [isPending, setIsPending] = useState(false);

  const handleRollback = async (snapshot: Snapshot) => {
    if (
      !confirm(
        `Restore build to snapshot from ${new Date(snapshot.createdAt).toLocaleString()}?`
      )
    ) {
      return;
    }

    setIsPending(true);
    try {
      await nativeClient.templateSync.rollbackSnapshot.mutate({
        projectId,
        buildId,
        snapshotId: snapshot.id,
      });
      toast.success("Build restored to snapshot");
      onRollbackComplete();
    } catch (error: any) {
      toast.error(`Rollback failed: ${error.message}`);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div style={{ padding: "16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <span style={{ fontWeight: "bold" }}>Sync History</span>
        <Button onClick={onBack} color="neutral">
          Back
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <span>No snapshots available</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              style={{
                padding: "12px",
                border: "1px solid var(--border-subtle)",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ fontSize: "12px" }}>
                  {new Date(snapshot.createdAt).toLocaleString()}
                </span>
              </div>
              <Button
                onClick={() => handleRollback(snapshot)}
                disabled={isPending}
                color="destructive"
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
