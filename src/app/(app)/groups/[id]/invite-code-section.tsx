"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

export function InviteCodeSection({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Code d&apos;invitation</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Partage ce code pour inviter tes amis.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-muted px-4 py-2.5 text-center font-mono text-lg tracking-widest">
          {inviteCode}
        </code>
        <Button
          variant="outline"
          size="icon"
          onClick={handleCopy}
          aria-label={copied ? "Code copié" : "Copier le code d'invitation"}
        >
          {copied ? (
            <Check className="size-4 text-green-500" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
    </section>
  );
}
