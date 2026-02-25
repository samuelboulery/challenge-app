"use client";

import { useActionState } from "react";
import {
  updateGroup,
  transferGroupOwnership,
  deleteGroup,
} from "@/app/(app)/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Crown, Pencil, Trash2 } from "lucide-react";

interface MemberOption {
  profileId: string;
  username: string;
  role: "owner" | "admin" | "member";
}

interface GroupAdminActionsProps {
  groupId: string;
  name: string;
  description: string | null;
  members: MemberOption[];
}

export function GroupAdminActions({
  groupId,
  name,
  description,
  members,
}: GroupAdminActionsProps) {
  const [updateState, updateAction, updatePending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) =>
      (await updateGroup(formData)) ?? null,
    null,
  );

  const [transferState, transferAction, transferPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) =>
      (await transferGroupOwnership(formData)) ?? null,
    null,
  );

  const [, deleteAction, deletePending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) =>
      (await deleteGroup(formData)) ?? null,
    null,
  );

  const transferableMembers = members.filter((m) => m.role !== "owner");

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="size-5" />
        <h2 className="text-lg font-semibold">Administration du groupe</h2>
      </div>

      <Card>
        <CardContent className="py-4">
          <form action={updateAction} className="space-y-3">
            <input type="hidden" name="groupId" value={groupId} />
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Nom du groupe</Label>
              <Input id="group-name" name="name" defaultValue={name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-description">Description</Label>
              <Textarea
                id="group-description"
                name="description"
                defaultValue={description ?? ""}
                rows={3}
              />
            </div>
            {updateState?.error && (
              <p className="text-sm text-destructive">{updateState.error}</p>
            )}
            {updateState?.success && (
              <p className="text-sm text-green-600">Groupe mis à jour.</p>
            )}
            <Button type="submit" disabled={updatePending}>
              <Pencil className="mr-2 size-4" />
              {updatePending ? "Enregistrement..." : "Modifier le groupe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <form action={transferAction} className="space-y-3">
            <input type="hidden" name="groupId" value={groupId} />
            <div className="space-y-1.5">
              <Label htmlFor="new-owner">Transférer l&apos;ownership</Label>
              <select
                id="new-owner"
                name="newOwnerId"
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Choisir un membre
                </option>
                {transferableMembers.map((member) => (
                  <option key={member.profileId} value={member.profileId}>
                    {member.username} ({member.role === "admin" ? "admin" : "membre"})
                  </option>
                ))}
              </select>
            </div>
            {transferState?.error && (
              <p className="text-sm text-destructive">{transferState.error}</p>
            )}
            {transferState?.success && (
              <p className="text-sm text-green-600">Ownership transféré.</p>
            )}
            <Button
              type="submit"
              variant="outline"
              disabled={transferPending || transferableMembers.length === 0}
            >
              {transferPending ? "Transfert..." : "Transférer l'ownership"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 text-destructive" />
            <p>Action irréversible: le groupe et ses données seront supprimés.</p>
          </div>
          <form action={deleteAction}>
            <input type="hidden" name="groupId" value={groupId} />
            <Button type="submit" variant="destructive" disabled={deletePending}>
              <Trash2 className="mr-2 size-4" />
              {deletePending ? "Suppression..." : "Supprimer le groupe"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
