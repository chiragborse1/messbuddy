import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP_VERSION_CODE, RELEASE_MANIFEST_URL } from "@/lib/appVersion";
import { cn } from "@/lib/utils";

type ReleaseManifest = {
  versionName: string;
  versionCode: number;
  minimumSupportedVersionCode?: number;
  downloadUrl: string;
  sha256?: string;
  releaseNotes?: string[];
};

const getDismissKey = (versionCode: number) => `kanhaiya-mess-update-dismissed-${versionCode}`;

export const AppUpdatePrompt = () => {
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseManifest | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const controller = new AbortController();
    let active = true;

    const checkForUpdate = async () => {
      try {
        const response = await fetch(`${RELEASE_MANIFEST_URL}?t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) return;

        const manifest = (await response.json()) as ReleaseManifest;
        const nextVersionCode = Number(manifest.versionCode);

        if (
          !Number.isFinite(nextVersionCode) ||
          nextVersionCode <= APP_VERSION_CODE ||
          !manifest.downloadUrl ||
          !manifest.sha256
        ) {
          return;
        }

        const isRequired = Number(manifest.minimumSupportedVersionCode ?? 0) > APP_VERSION_CODE;
        const wasDismissed = localStorage.getItem(getDismissKey(nextVersionCode)) === "true";

        if (active && (isRequired || !wasDismissed)) {
          setAvailableUpdate({ ...manifest, versionCode: nextVersionCode });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.info("APK update check skipped:", error);
        }
      }
    };

    void checkForUpdate();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (!availableUpdate) return null;

  const updateRequired = Number(availableUpdate.minimumSupportedVersionCode ?? 0) > APP_VERSION_CODE;

  const dismiss = () => {
    localStorage.setItem(getDismissKey(availableUpdate.versionCode), "true");
    setAvailableUpdate(null);
  };

  const openDownload = async () => {
    try {
      await Browser.open({ url: availableUpdate.downloadUrl });
    } catch {
      window.location.href = availableUpdate.downloadUrl;
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[95] mx-auto max-w-md">
      <div
        className={cn(
          "rounded-xl border bg-background/95 p-3 shadow-2xl backdrop-blur",
          updateRequired ? "border-destructive/40" : "border-border",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Download className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              {updateRequired ? "Update required" : "APK update available"}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Version {availableUpdate.versionName} is ready to download and install.
            </p>
          </div>
          {!updateRequired && (
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss update"
              onClick={dismiss}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {!updateRequired && (
            <Button type="button" variant="outline" size="sm" onClick={dismiss}>
              Later
            </Button>
          )}
          <Button type="button" size="sm" onClick={openDownload}>
            Download
          </Button>
        </div>
      </div>
    </div>
  );
};
