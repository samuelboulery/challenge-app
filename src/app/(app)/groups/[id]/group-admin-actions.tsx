"use client";

import { useActionState, useState } from "react";
import {
  updateGroup,
  transferGroupOwnership,
  deleteGroup,
  resetGroup,
  updateMemberGroupPoints,
} from "@/app/(app)/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsivePanel,
  ResponsivePanelContent,
  ResponsivePanelDescription,
  ResponsivePanelFooter,
  ResponsivePanelHeader,
  ResponsivePanelTitle,
  ResponsivePanelTrigger,
} from "@/components/ui/responsive-panel";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Crown,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";

interface MemberOption {
  profileId: string;
  username: string;
  role: "owner" | "admin" | "member";
  groupPoints: number;
}

interface GroupAdminActionsProps {
  groupId: string;
  name: string;
  description: string | null;
  members: MemberOption[];
  isOwner: boolean;
}

function MemberPointsEditor({
  groupId,
  member,
}: {
  groupId: string;
  member: MemberOption;
}) {
  const [newPoints, setNewPoints] = useState(String(member.groupPoints));
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) =>
      (await updateMemberGroupPoints(formData)) ?? null,
    null,
  );

  const parsedPoints = Number(newPoints);
  const isValid = Number.isInteger(parsedPoints) && parsedPoints >= 0;
  const isUnchanged = isValid && parsedPoints === member.groupPoints;

  return (
    <form action={action} className="rounded-lg border p-3 space-y-2">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="memberId" value={member.profileId} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{member.username}</p>
          <p className="text-xs text-muted-foreground">
            Rôle: {member.role === "owner" ? "fondateur" : member.role === "admin" ? "admin" : "membre"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            name="newPoints"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={newPoints}
            onChange={(event) => setNewPoints(event.target.value)}
            className="w-28 text-right"
            required
          />
          <Button
            type="submit"
            variant="outline"
            disabled={pending || !isValid || isUnchanged}
          >
            {pending ? "..." : "Sauver"}
          </Button>
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">Points mis à jour.</p>}
    </form>
  );
}

export function GroupAdminActions({
  groupId,
  name,
  description,
  members,
  isOwner,
}: GroupAdminActionsProps) {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [groupNameResetConfirmation, setGroupNameResetConfirmation] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [groupNameConfirmation, setGroupNameConfirmation] = useState("");

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

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) =>
      (await deleteGroup(formData)) ?? null,
    null,
  );

  const [resetState, resetAction, resetPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) =>
      (await resetGroup(formData)) ?? null,
    null,
  );

  const transferableMembers = members.filter((m) => m.role !== "owner");
  const canConfirmDelete = groupNameConfirmation.trim() === name;
  const canConfirmReset = groupNameResetConfirmation.trim() === name;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Crown className="size-5" />
          <h2 className="text-lg font-semibold">Administration du groupe</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsAdminOpen((prev) => !prev)}
          aria-expanded={isAdminOpen}
        >
          {isAdminOpen ? (
            <>
              <ChevronUp className="mr-2 size-4" />
              Masquer
            </>
          ) : (
            <>
              <ChevronDown className="mr-2 size-4" />
              Ouvrir
            </>
          )}
        </Button>
      </div>

      {!isAdminOpen && (
        <p className="text-sm text-muted-foreground">
          Ouvre l&apos;administration pour modifier le groupe, transférer
          l&apos;ownership, réinitialiser les données ou supprimer le groupe.
        </p>
      )}

      {isAdminOpen && (
        <>
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
                    className="border-input bg-background h-12 sm:h-10 w-full rounded-md border px-3 text-sm"
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

          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="space-y-1">
                <h3 className="font-medium">Points des membres</h3>
                <p className="text-sm text-muted-foreground">
                  Modifie les points d&apos;un membre dans ce groupe.
                </p>
              </div>
              <div className="space-y-2">
                {members.map((member) => (
                  <MemberPointsEditor
                    key={member.profileId}
                    groupId={groupId}
                    member={member}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                <p>Action irréversible: le groupe et ses données seront supprimés.</p>
              </div>
              <ResponsivePanel
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                  setIsDeleteDialogOpen(open);
                  if (!open) setGroupNameConfirmation("");
                }}
              >
                <ResponsivePanelTrigger asChild>
                  <Button type="button" variant="destructive">
                    <Trash2 className="mr-2 size-4" />
                    Supprimer le groupe
                  </Button>
                </ResponsivePanelTrigger>
                <ResponsivePanelContent>
                  <ResponsivePanelHeader>
                    <ResponsivePanelTitle>Confirmer la suppression</ResponsivePanelTitle>
                    <ResponsivePanelDescription>
                      Pour confirmer, tape exactement le nom du groupe:
                      <span className="font-semibold"> {name}</span>
                    </ResponsivePanelDescription>
                  </ResponsivePanelHeader>
                  <form action={deleteAction} className="space-y-4">
                    <input type="hidden" name="groupId" value={groupId} />
                    <div className="space-y-2">
                      <Label htmlFor="group-name-confirmation">
                        Nom du groupe
                      </Label>
                      <Input
                        id="group-name-confirmation"
                        name="groupNameConfirmation"
                        value={groupNameConfirmation}
                        onChange={(event) =>
                          setGroupNameConfirmation(event.target.value)
                        }
                        placeholder={name}
                        autoComplete="off"
                        required
                      />
                    </div>
                    {deleteState?.error && (
                      <p className="text-sm text-destructive">{deleteState.error}</p>
                    )}
                    <ResponsivePanelFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDeleteDialogOpen(false)}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={deletePending || !canConfirmDelete}
                      >
                        <Trash2 className="mr-2 size-4" />
                        {deletePending ? "Suppression..." : "Supprimer définitivement"}
                      </Button>
                    </ResponsivePanelFooter>
                  </form>
                </ResponsivePanelContent>
              </ResponsivePanel>
            </CardContent>
          </Card>

          {isOwner && (
            <Card className="border-destructive/50">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                  <p>
                    Réinitialisation: supprime les challenges, les preuves, les items achetés
                    et retire les points liés à ce groupe.
                  </p>
                </div>
                <ResponsivePanel
                  open={isResetDialogOpen}
                  onOpenChange={(open) => {
                    setIsResetDialogOpen(open);
                    if (!open) setGroupNameResetConfirmation("");
                  }}
                >
                  <ResponsivePanelTrigger asChild>
                    <Button type="button" variant="destructive">
                      <RotateCcw className="mr-2 size-4" />
                      Remettre le groupe à 0
                    </Button>
                  </ResponsivePanelTrigger>
                  <ResponsivePanelContent>
                    <ResponsivePanelHeader>
                      <ResponsivePanelTitle>Confirmer la remise à 0</ResponsivePanelTitle>
                      <ResponsivePanelDescription>
                        Pour confirmer, tape exactement le nom du groupe:
                        <span className="font-semibold"> {name}</span>
                      </ResponsivePanelDescription>
                    </ResponsivePanelHeader>
                    <form action={resetAction} className="space-y-4">
                      <input type="hidden" name="groupId" value={groupId} />
                      <div className="space-y-2">
                        <Label htmlFor="group-name-reset-confirmation">
                          Nom du groupe
                        </Label>
                        <Input
                          id="group-name-reset-confirmation"
                          name="groupNameConfirmation"
                          value={groupNameResetConfirmation}
                          onChange={(event) =>
                            setGroupNameResetConfirmation(event.target.value)
                          }
                          placeholder={name}
                          autoComplete="off"
                          required
                        />
                      </div>
                      {resetState?.error && (
                        <p className="text-sm text-destructive">{resetState.error}</p>
                      )}
                      {resetState?.success && (
                        <p className="text-sm text-green-600">
                          Le groupe a été remis à 0.
                        </p>
                      )}
                      <ResponsivePanelFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsResetDialogOpen(false)}
                        >
                          Annuler
                        </Button>
                        <Button
                          type="submit"
                          variant="destructive"
                          disabled={resetPending || !canConfirmReset}
                        >
                          <RotateCcw className="mr-2 size-4" />
                          {resetPending ? "Réinitialisation..." : "Confirmer la remise à 0"}
                        </Button>
                      </ResponsivePanelFooter>
                    </form>
                  </ResponsivePanelContent>
                </ResponsivePanel>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
