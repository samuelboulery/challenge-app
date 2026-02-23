"use client";

import { useState, useEffect } from "react";
import { saveSubscription, removeSubscription } from "./push-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BellRing, BellOff, Bell, Smartphone } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as unknown as { standalone?: boolean }).standalone === true)
  );
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export function PushToggle() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [iosNeedInstall, setIosNeedInstall] = useState(false);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setReady(true);
      return;
    }

    const isIOS = detectIOS();
    const isStandalone = detectStandalone();

    if (isIOS && !isStandalone) {
      setIosNeedInstall(true);
      setIsSupported(true);
      setReady(true);
      return;
    }

    setIsSupported(true);

    getPushRegistration()
      .then((reg) => {
        if (!reg) {
          setReady(true);
          return;
        }
        return reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
          setReady(true);
        });
      })
      .catch(() => setReady(true));
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isSubscribed) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await removeSubscription();
        setIsSubscribed(false);
        toast.success("Notifications push désactivées");
      } else {
        if (!window.isSecureContext) {
          toast.error("Les notifications push nécessitent une connexion sécurisée.");
          return;
        }

        const permission =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error(
            "Permission refusée. Active les notifications dans les réglages.",
          );
          return;
        }

        const reg = await getPushRegistration();
        if (!reg) {
          toast.error("Service worker indisponible. Réessaie dans quelques secondes.");
          return;
        }

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          toast.error("Configuration push manquante");
          return;
        }

        const keyArray = urlBase64ToUint8Array(vapidKey);
        const applicationServerKey = keyArray.buffer as ArrayBuffer;
        const existingSub = await reg.pushManager.getSubscription();
        const sub =
          existingSub ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          }));

        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          toast.error("Erreur lors de l'inscription push");
          return;
        }

        const result = await saveSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
        if (result?.error) {
          toast.error("Impossible d'enregistrer l'abonnement push.");
          return;
        }

        setIsSubscribed(true);
        toast.success("Notifications push activées !");
      }
    } catch {
      toast.error("Erreur. Vérifie que les notifications sont autorisées.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <Bell className="size-5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Notifications push</p>
            <p className="text-xs text-muted-foreground">Chargement...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isSupported) {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <BellOff className="size-5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Notifications push</p>
            <p className="text-xs text-muted-foreground">
              Ton navigateur ne supporte pas les notifications push.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (iosNeedInstall) {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <Smartphone className="size-5 text-indigo-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Notifications push</p>
            <p className="text-xs text-muted-foreground">
              Installe l&apos;app sur ton écran d&apos;accueil pour activer les
              notifications push (iOS 16.4+).
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        {isSubscribed ? (
          <BellRing className="size-5 text-green-500 shrink-0" />
        ) : (
          <BellOff className="size-5 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Notifications push</p>
          <p className="text-xs text-muted-foreground">
            {isSubscribed
              ? "Tu recevras les notifications même quand l'app est fermée."
              : "Reçois les notifications même quand l'app est fermée."}
          </p>
        </div>
        <Button
          variant={isSubscribed ? "outline" : "default"}
          size="sm"
          onClick={handleToggle}
          disabled={loading}
          className="shrink-0"
        >
          {loading
            ? "..."
            : isSubscribed
              ? "Désactiver"
              : "Activer"}
        </Button>
      </CardContent>
    </Card>
  );
}
