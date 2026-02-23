import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChallengeActions } from "@/components/shared/challenge-actions";
import { SubmitProofForm } from "@/components/shared/submit-proof-form";
import { getUserItemsByType } from "@/app/(app)/groups/[id]/shop-actions";
import { ArrowLeft, Flame, Calendar, ArrowRight, Zap } from "lucide-react";
import type { ChallengeStatus } from "@/types/database.types";

const STATUS_CONFIG: Record<
  ChallengeStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  proposed: { label: "Proposé", variant: "outline" },
  negotiating: { label: "Négociation", variant: "outline" },
  accepted: { label: "Accepté", variant: "secondary" },
  in_progress: { label: "En cours", variant: "secondary" },
  proof_submitted: { label: "Preuve soumise", variant: "default" },
  validated: { label: "Validé", variant: "default" },
  rejected: { label: "Rejeté", variant: "destructive" },
  expired: { label: "Expiré", variant: "destructive" },
  cancelled: { label: "Refusé", variant: "destructive" },
};

export default async function GroupChallengeDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; id: string }>;
}) {
  const { groupId, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: challenge } = await supabase
    .from("challenges")
    .select(
      "*, creator:profiles!challenges_creator_id_fkey(username), target:profiles!challenges_target_id_fkey(username), groups(name)",
    )
    .eq("id", id)
    .single();

  if (!challenge) notFound();

  const isCreator = challenge.creator_id === user?.id;
  const isTarget = challenge.target_id === user?.id;
  const config = STATUS_CONFIG[challenge.status];
  const hasBoosted = !!challenge.booster_inventory_id;

  const creatorName =
    (challenge.creator as { username: string })?.username ?? "?";
  const targetName =
    (challenge.target as { username: string })?.username ?? "?";
  const groupName =
    (challenge.groups as { name: string })?.name ?? "?";

  // Fetch available boosters for the target when challenge is proposed
  let availableBoosters: { id: string }[] = [];
  if (challenge.status === "proposed" && isTarget) {
    const boosters = await getUserItemsByType(groupId, "booster");
    availableBoosters = boosters.map((b) => ({ id: b.id }));
  }

  const { data: proofs } = await supabase
    .from("proofs")
    .select("*, profiles!proofs_submitted_by_fkey(username)")
    .eq("challenge_id", id)
    .order("created_at", { ascending: false });

  return (
    <main className="px-4 pt-8">
      <Link
        href={`/g/${groupId}/challenges`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Défis du groupe
      </Link>

      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold">{challenge.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            {hasBoosted && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                <Zap className="mr-0.5 size-3" />
                x2
              </Badge>
            )}
            <Badge variant={config.variant}>
              {config.label}
            </Badge>
          </div>
        </div>
        {challenge.description && (
          <p className="mt-2 text-muted-foreground">{challenge.description}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{creatorName}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{targetName}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Flame className="size-4" />
          <span className="font-semibold text-foreground">
            {hasBoosted ? `${challenge.points} x2` : challenge.points}
          </span>{" "}
          pts
        </div>
        {challenge.deadline && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="size-4" />
            {new Date(challenge.deadline).toLocaleDateString("fr-FR")}
          </div>
        )}
        <span className="text-muted-foreground">{groupName}</span>
      </div>

      <Separator className="my-6" />

      <ChallengeActions
        challengeId={challenge.id}
        status={challenge.status}
        isCreator={isCreator}
        isTarget={isTarget}
        points={challenge.points}
        groupId={groupId}
        hasBoosted={hasBoosted}
        availableBoosters={availableBoosters}
      />

      {challenge.status === "accepted" && isTarget && (
        <div className="mt-4">
          <SubmitProofForm challengeId={challenge.id} />
        </div>
      )}

      {proofs && proofs.length > 0 && (
        <>
          <Separator className="my-6" />
          <section>
            <h2 className="mb-4 text-lg font-semibold">
              Preuves ({proofs.length})
            </h2>
            <div className="space-y-3">
              {proofs.map((proof) => {
                const proofAuthor =
                  (proof.profiles as { username: string })?.username ?? "?";
                return (
                  <div key={proof.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{proofAuthor}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(proof.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {proof.media_url && (
                      <a
                        href={proof.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block relative max-h-64 w-full overflow-hidden rounded-lg border"
                      >
                        <Image
                          src={proof.media_url}
                          alt="Preuve photo"
                          width={400}
                          height={256}
                          className="h-auto w-full object-cover"
                        />
                      </a>
                    )}
                    {proof.comment && (
                      <p className="mt-2 text-sm">{proof.comment}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
