"use client";

import { BottomNav } from "@/components/shared/bottom-nav";
import { InstallPrompt } from "@/components/shared/install-prompt";

export function AppClientShell() {
  return (
    <>
      <InstallPrompt />
      <BottomNav />
    </>
  );
}
