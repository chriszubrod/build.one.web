import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import { clearAllUserScopedStorage } from "../../auth/cacheCleanup";
import { useToast } from "../../components/Toast";

interface StorageInfo {
  usageBytes: number;
  quotaBytes: number;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export default function AppearanceScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [clearing, setClearing] = useState(false);

  async function refreshStorage() {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      return;
    }
    try {
      const est = await navigator.storage.estimate();
      setStorage({
        usageBytes: est.usage ?? 0,
        quotaBytes: est.quota ?? 0,
      });
    } catch {
      // Best effort; some browsers refuse in private mode.
    }
  }

  useEffect(() => {
    void refreshStorage();
  }, []);

  async function handleClearCache() {
    if (clearing) return;
    const ok = window.confirm(
      "Clear cached app data? You'll need to be online for the next load. Your sign-in stays.",
    );
    if (!ok) return;
    setClearing(true);
    try {
      await clearAllUserScopedStorage();
      queryClient.clear();
      toast("Cached data cleared.", "success");
      void refreshStorage();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to clear cache.",
        "error",
      );
    } finally {
      setClearing(false);
    }
  }

  const pctUsed = storage && storage.quotaBytes > 0
    ? (storage.usageBytes / storage.quotaBytes) * 100
    : null;

  return (
    <div className="ios-page">
      <NavHeader title="Appearance" onBack={() => navigate("/profile")} />

      <SectionCard
        header="Theme"
        footer="Dark mode is on the roadmap; web is light-only for now."
      >
        <ListRow title="Light" selected />
      </SectionCard>

      <SectionCard
        header="Storage"
        footer="Cached lists and dropdown data live on this device so the app launches offline. Clearing won't sign you out."
      >
        {storage ? (
          <>
            <ListRow
              title="Used"
              value={fmtBytes(storage.usageBytes)}
            />
            <ListRow
              title="Available"
              value={fmtBytes(storage.quotaBytes)}
            />
            {pctUsed !== null && (
              <ListRow
                title="Usage"
                value={`${pctUsed.toFixed(2)}%`}
              />
            )}
            <ListRow
              title={clearing ? "Clearing…" : "Clear cached data"}
              onClick={clearing ? undefined : handleClearCache}
              destructive
            />
          </>
        ) : (
          <ListRow title="Storage info unavailable" />
        )}
      </SectionCard>
    </div>
  );
}
