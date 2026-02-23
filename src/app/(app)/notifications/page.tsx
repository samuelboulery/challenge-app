import { getNotifications } from "./actions";
import { MarkAllReadButton } from "./mark-all-read-button";
import { NotificationItem } from "./notification-item";
import { Bell } from "lucide-react";

export default async function NotificationsPage() {
  const notifications = await getNotifications();
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {hasUnread && <MarkAllReadButton />}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Bell className="size-8 text-muted-foreground" />
          <p className="font-medium">Rien de nouveau</p>
          <p className="text-sm text-muted-foreground">
            Tes notifications apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {notifications.map((notif) => (
            <NotificationItem key={notif.id} notification={notif} />
          ))}
        </div>
      )}
    </main>
  );
}
