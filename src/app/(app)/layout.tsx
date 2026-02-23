import { BottomNav } from "@/components/shared/bottom-nav";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-svh pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
