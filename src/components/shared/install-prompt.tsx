"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Share, Plus, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "install-prompt-dismissed";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    if (isIOS()) {
      setPlatform("ios");
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("android");
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-2 right-2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-xl border border-indigo-500/30 bg-slate-900/95 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white font-bold text-lg">
            C
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm">
              Installer Challenge App
            </p>
            {platform === "ios" ? (
              <p className="text-xs text-slate-400 mt-1">
                Appuie sur{" "}
                <Share className="inline h-3.5 w-3.5 -mt-0.5 text-indigo-400" />{" "}
                <span className="text-indigo-400 font-medium">Partager</span> puis{" "}
                <Plus className="inline h-3.5 w-3.5 -mt-0.5 text-indigo-400" />{" "}
                <span className="text-indigo-400 font-medium">
                  Sur l&apos;écran d&apos;accueil
                </span>{" "}
                pour recevoir les notifications.
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Installe l&apos;app pour recevoir les notifications push même
                quand ton téléphone est verrouillé.
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {platform === "android" && deferredPrompt && (
          <Button
            onClick={install}
            size="sm"
            className="mt-3 w-full bg-indigo-500 hover:bg-indigo-600"
          >
            <Download className="h-4 w-4 mr-2" />
            Installer
          </Button>
        )}

        {platform === "ios" && (
          <p className="mt-2 text-[10px] text-slate-500 text-center">
            Les notifications push nécessitent iOS 16.4+ et Safari.
          </p>
        )}
      </div>
    </div>
  );
}
