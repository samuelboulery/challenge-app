"use client";

import * as React from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function ResponsivePanel({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />;
}

function ResponsivePanelTrigger({
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  return <DialogTrigger {...props} />;
}

function ResponsivePanelClose({
  ...props
}: React.ComponentProps<typeof DialogClose>) {
  return <DialogClose {...props} />;
}

function ResponsivePanelContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        "!top-auto !right-0 !bottom-0 !left-0 !max-w-none !translate-x-0 !translate-y-0 w-full max-w-[100dvw] rounded-t-2xl rounded-b-none border-x-0 border-b-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full sm:!top-[50%] sm:!right-auto sm:!bottom-auto sm:!left-[50%] sm:!max-w-lg sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:rounded-lg sm:border sm:p-6 sm:pb-6 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 max-h-[85dvh] overflow-y-auto overflow-x-hidden break-words [&>*]:min-w-0 sm:max-h-[90dvh]",
        className,
      )}
      {...props}
    />
  );
}

function ResponsivePanelHeader({
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader {...props} />;
}

function ResponsivePanelFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn(
        "sticky bottom-0 bg-background pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:static sm:bg-transparent sm:pt-0 sm:pb-0",
        className,
      )}
      {...props}
    />
  );
}

function ResponsivePanelTitle({
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle {...props} />;
}

function ResponsivePanelDescription({
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  return <DialogDescription {...props} />;
}

export {
  ResponsivePanel,
  ResponsivePanelClose,
  ResponsivePanelContent,
  ResponsivePanelDescription,
  ResponsivePanelFooter,
  ResponsivePanelHeader,
  ResponsivePanelTitle,
  ResponsivePanelTrigger,
};
