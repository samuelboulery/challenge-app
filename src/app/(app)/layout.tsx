import { AppClientShell } from "@/components/shared/app-client-shell";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-svh pb-20">
      {children}
      <AppClientShell />
    </div>
  );
}
