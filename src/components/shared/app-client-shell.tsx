"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/shared/bottom-nav";
import { InstallPrompt } from "@/components/shared/install-prompt";

export function AppClientShell() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <InstallPrompt />
      <BottomNav />
    </>
  );
}
