"use client";

import { useState, useEffect } from "react";
import { saveSubscription, removeSubscription } from "./push-actions";
import { Button } from "@/components/ui/button";
import { BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushToggle() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setIsSupported(true);

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (isSubscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await removeSubscription();
        setIsSubscribed(false);
        toast.success("Notifications push désactivées");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error("Permission refusée. Active les notifications dans les réglages.");
          return;
        }

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          toast.error("Configuration push manquante");
          return;
        }

        const keyArray = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyArray.buffer as ArrayBuffer,
        });

        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          toast.error("Erreur lors de l'inscription push");
          return;
        }

        await saveSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });

        setIsSubscribed(true);
        toast.success("Notifications push activées !");
      }
    } catch {
      toast.error("Erreur. Vérifie que les notifications sont autorisées.");
    } finally {
      setLoading(false);
    }
  };

  if (!isSupported) return null;

  return (
    <Button
      variant={isSubscribed ? "outline" : "default"}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      {isSubscribed ? (
        <>
          <BellOff className="mr-1 size-4" />
          {loading ? "..." : "Désactiver les push"}
        </>
      ) : (
        <>
          <BellRing className="mr-1 size-4" />
          {loading ? "..." : "Activer les push"}
        </>
      )}
    </Button>
  );
}
