import { BottomNav } from "@/components/shared/bottom-nav";
import { InstallPrompt } from "@/components/shared/install-prompt";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-svh pb-20">
      {children}
      <InstallPrompt />
      <BottomNav />
    </div>
  );
}
