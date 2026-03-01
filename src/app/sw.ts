import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const htmlAndRscNetworkOnly = [
  {
    matcher: ({ request }: { request: Request }) => request.mode === "navigate",
    handler: "NetworkOnly" as const,
  },
  {
    matcher: ({ request }: { request: Request }) =>
      request.headers.get("RSC") === "1",
    handler: "NetworkOnly" as const,
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: [...htmlAndRscNetworkOnly, ...defaultCache],
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json() as {
      title?: string;
      body?: string;
      url?: string;
    };

    const title = data.title ?? "Challenge App";
    const options: NotificationOptions & { renotify?: boolean } = {
      body: data.body ?? "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: data.url ?? "default",
      renotify: true,
      data: { url: data.url ?? "/" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Invalid push payload
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
