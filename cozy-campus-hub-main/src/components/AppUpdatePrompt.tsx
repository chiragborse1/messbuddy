import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Download, X, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP_VERSION_CODE, RELEASE_MANIFEST_URL } from "@/lib/appVersion";
import { cn } from "@/lib/utils";

type ReleaseManifest = {
  versionName: string;
  versionCode: number;
  minimumSupportedVersionCode?: number;
  downloadUrl: string;
  sha256?: string;
  sizeBytes?: number | null;
  releaseNotes?: string[];
};

const getDismissKey = (versionCode: number) => `kanhaiya-mess-update-dismissed-${versionCode}`;

const formatBytes = (bytes?: number | null) => {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

export const AppUpdatePrompt = () => {
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseManifest | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

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
    setIsDownloading(true);
    try {
      await Browser.open({ url: availableUpdate.downloadUrl });
    } catch {
      window.location.href = availableUpdate.downloadUrl;
    } finally {
      // Keep the spinner briefly so the user sees feedback before the browser takes over.
      setTimeout(() => setIsDownloading(false), 1500);
    }
  };

  const copyChecksum = async () => {
    if (!availableUpdate.sha256) return;
    try {
      await navigator.clipboard.writeText(availableUpdate.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  };

  const renderNotes = (className: string) =>
    availableUpdate.releaseNotes && availableUpdate.releaseNotes.length > 0 ? (
      <ul className={className}>
        {availableUpdate.releaseNotes.map((note, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    ) : null;

  const sizeLabel = formatBytes(availableUpdate.sizeBytes);

  if (updateRequired) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur">
        <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-background p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Download className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">Update required</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {availableUpdate.versionName} is required to continue. Please update now.
              </p>
              {sizeLabel && (
                <p className="mt-1 text-xs text-muted-foreground">Download size: {sizeLabel}</p>
              )}
              {renderNotes("mt-3 space-y-1 text-xs text-muted-foreground")}
              {availableUpdate.sha256 && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-[10px] text-muted-foreground">
                  <span className="font-mono truncate">{availableUpdate.sha256}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"
                    aria-label="Copy checksum"
                    onClick={copyChecksum}
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" size="sm" onClick={openDownload} disabled={isDownloading}>
              {isDownloading ? "Opening download..." : "Download update"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[95] mx-auto max-w-md">
      <div className="rounded-xl border bg-background/95 p-3 shadow-2xl backdrop-blur border-border">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Download className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">APK update available</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Version {availableUpdate.versionName} is ready to download and install.
            </p>
            {sizeLabel && (
              <p className="mt-1 text-xs text-muted-foreground">Size: {sizeLabel}</p>
            )}
            {renderNotes("mt-2 space-y-1 text-xs text-muted-foreground")}
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss update"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={dismiss}>
            Later
          </Button>
          <Button type="button" size="sm" onClick={openDownload} disabled={isDownloading}>
            {isDownloading ? "Opening..." : "Download"}
          </Button>
        </div>
      </div>
    </div>
  );
};