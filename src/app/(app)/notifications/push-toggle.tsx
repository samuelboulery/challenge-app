"use client";

import { useState, useEffect, useTransition } from "react";
import { saveSubscription, removeSubscription } from "./push-actions";
import { Button } from "@/components/ui/button";
import { BellRing, BellOff } from "lucide-react";

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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setIsSupported(true);

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  const handleToggle = () => {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.ready;

      if (isSubscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
        await removeSubscription();
        setIsSubscribed(false);
      } else {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });

        const json = sub.toJSON();
        if (!json.endpoint || !json.keys) return;

        await saveSubscription({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh!,
            auth: json.keys.auth!,
          },
        });

        setIsSubscribed(true);
      }
    });
  };

  if (!isSupported) return null;

  return (
    <Button
      variant={isSubscribed ? "outline" : "default"}
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
    >
      {isSubscribed ? (
        <>
          <BellOff className="mr-1 size-4" />
          {isPending ? "..." : "Désactiver les push"}
        </>
      ) : (
        <>
          <BellRing className="mr-1 size-4" />
          {isPending ? "..." : "Activer les push"}
        </>
      )}
    </Button>
  );
}
