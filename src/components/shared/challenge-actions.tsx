"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  ResponsivePanel,
  ResponsivePanelContent,
  ResponsivePanelDescription,
  ResponsivePanelFooter,
  ResponsivePanelHeader,
  ResponsivePanelTitle,
} from "@/components/ui/responsive-panel";
import { Progress } from "@/components/ui/progress";
import {
  acceptChallenge,
  declineChallenge,
  abandonChallengeAfterFailedProof,
  cancelChallengeByCreator,
  contestChallenge,
  voteOnChallenge,
  voteChallengePrice,
  getDeclineInfo,
  validateOwnProofWith493,
} from "@/app/(app)/challenges/actions";
import type { ChallengeStatus } from "@/types/database.types";
import { Check, X, Clock, Trophy, Shield, Zap, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";

export interface VoteInfo {
  approvals: number;
  rejections: number;
  threshold: number;
  eligible: number;
  userVote: string | null;
  voters: { id: string; username: string; vote: string }[];
}

export interface PriceNegotiationState {
  round?: number;
  proposed_points?: number;
  approvals?: number;
  rejections?: number;
  keeps?: number;
  threshold?: number;
  validators_count?: number;
  user_vote?: string | null;
  votes?: { voter_id: string; username: string; vote: string }[];
}

interface ChallengeActionsProps {
  challengeId: string;
  status: ChallengeStatus;
  isCreator: boolean;
  isTarget: boolean;
  points: number;
  hasBoosted?: boolean;
  availableBoosters?: { id: string }[];
  voteInfo?: VoteInfo | null;
  isMember?: boolean;
  isValidator?: boolean;
  priceState?: PriceNegotiationState | null;
  canContest?: boolean;
  proofRejectionsCount?: number;
  available493Items?: { id: string }[];
}

type DeclineInfoState = {
  isFree: boolean;
  penalty: number;
  freeRemaining: number;
  availableJokers: string[];
};

export function ChallengeActions({
  challengeId,
  status,
  isCreator,
  isTarget,
  points,
  hasBoosted,
  availableBoosters = [],
  voteInfo,
  isMember,
  isValidator = false,
  priceState,
  canContest = true,
  proofRejectionsCount = 0,
  available493Items = [],
}: ChallengeActionsProps) {
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [declineInfo, setDeclineInfo] = useState<DeclineInfoState | null>(null);
  const [cancelInfo, setCancelInfo] = useState<DeclineInfoState | null>(null);
  const [currentVoteInfo, setCurrentVoteInfo] = useState<VoteInfo | null>(voteInfo ?? null);
  const [currentPriceState, setCurrentPriceState] = useState<PriceNegotiationState | null>(
    priceState ?? null,
  );
  const [counterPoints, setCounterPoints] = useState(
    String(priceState?.proposed_points ?? points),
  );

  const [isPending, startTransition] = useTransition();
  const hasFailedProofOnce = proofRejectionsCount >= 1;

  const handleDeclineClick = () => {
    startTransition(async () => {
      const info = await getDeclineInfo(challengeId);
      if ("error" in info) {
        toast.error(info.error);
        return;
      }
      if (info.isFree) {
        const result = await declineChallenge(challengeId);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          toast.success(`Défi refusé (${info.freeRemaining} refus gratuit${info.freeRemaining !== 1 ? "s" : ""} restant${info.freeRemaining !== 1 ? "s" : ""})`);
        }
      } else {
        setDeclineInfo(info);
        setDeclineDialogOpen(true);
      }
    });
  };

  const handleDeclineConfirm = (jokerInventoryId?: string) => {
    startTransition(async () => {
      const result = await declineChallenge(challengeId, jokerInventoryId);
      setDeclineDialogOpen(false);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.jokerUsed) {
        toast.success("Défi refusé (Joker utilisé, aucune pénalité)");
      } else if (result.penalty && result.penalty > 0) {
        toast.warning(`Défi refusé (-${result.penalty} points de pénalité)`);
      } else {
        toast.success("Défi refusé");
      }
    });
  };

  const handleCancelClick = () => {
    startTransition(async () => {
      const info = await getDeclineInfo(challengeId);
      if ("error" in info) {
        toast.error(info.error);
        return;
      }
      setCancelInfo(info);
      setCancelDialogOpen(true);
    });
  };

  const handleCancelConfirm = (jokerInventoryId?: string) => {
    startTransition(async () => {
      const result = await declineChallenge(challengeId, jokerInventoryId);
      setCancelDialogOpen(false);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.jokerUsed) {
        toast.success("Défi annulé (Joker utilisé, aucune pénalité)");
      } else if (result.penalty && result.penalty > 0) {
        toast.warning(`Défi annulé (-${result.penalty} points de pénalité)`);
      } else {
        toast.success("Défi annulé");
      }
    });
  };

  const handleAcceptClick = () => {
    if (availableBoosters.length > 0) {
      setAcceptDialogOpen(true);
    } else {
      startTransition(async () => {
        const result = await acceptChallenge(challengeId);
        if ("error" in result) {
          toast.error(result.error);
        }
      });
    }
  };

  const handleAcceptConfirm = (boosterInventoryId?: string) => {
    startTransition(async () => {
      const result = await acceptChallenge(challengeId, boosterInventoryId);
      setAcceptDialogOpen(false);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.boosted) {
        toast.success("Défi accepté avec Booster x2 !");
      }
    });
  };

  const handleVote = (vote: "approve" | "reject") => {
    startTransition(async () => {
      const result = await voteOnChallenge(challengeId, vote);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.status === "validated") {
        toast.success("Défi validé par le groupe !");
      } else if (result.status === "rejected") {
        toast.info("Preuve rejetée par le groupe");
      } else {
        const label = vote === "approve" ? "Approuvé" : "Rejeté";
        toast.success(`${label} ! (${result.approvals}/${result.threshold})`);
        setCurrentVoteInfo((prev) =>
          prev
            ? {
                ...prev,
                approvals: result.approvals ?? prev.approvals,
                rejections: result.rejections ?? prev.rejections,
                userVote: vote,
              }
            : null,
        );
      }
    });
  };

  const handleValidateOwnProofWith493 = () => {
    startTransition(async () => {
      const result = await validateOwnProofWith493(challengeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Preuve validée automatiquement ! +${result.reward ?? points} pts`);
    });
  };

  const handlePriceVote = (vote: "counter" | "cancel" | "keep") => {
    startTransition(async () => {
      let nextCounter: number | undefined;
      if (vote === "counter") {
        const parsed = Number(counterPoints);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          toast.error("La contre-proposition doit être un nombre entier positif");
          return;
        }
        nextCounter = parsed;
      }

      const result = await voteChallengePrice(challengeId, vote, nextCounter);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      if (result.status === "counter_applied") {
        toast.success("Contre-proposition validée par le groupe");
      } else if (result.status === "cancelled_by_contestation") {
        toast.info("Le défi est annulé après contestation");
      } else if (result.status === "kept_by_contestation") {
        toast.success("Le défi est maintenu tel quel");
      } else {
        toast.success("Vote enregistré");
      }

      const refreshed = {
        ...(currentPriceState ?? {}),
        ...(typeof result.round === "number" ? { round: result.round } : {}),
        ...(typeof result.proposed_points === "number"
          ? { proposed_points: result.proposed_points }
          : {}),
        ...(typeof result.approvals === "number"
          ? { approvals: result.approvals }
          : {}),
        ...(typeof result.rejections === "number"
          ? { rejections: result.rejections }
          : {}),
        ...(typeof result.keeps === "number" ? { keeps: result.keeps } : {}),
        ...(typeof result.threshold === "number"
          ? { threshold: result.threshold }
          : {}),
        ...(result.status === "counter_applied" ||
        result.status === "cancelled_by_contestation" ||
        result.status === "kept_by_contestation"
          ? {}
          : { user_vote: vote }),
      } as PriceNegotiationState;

      setCurrentPriceState(refreshed);
      if (typeof refreshed.proposed_points === "number") {
        setCounterPoints(String(refreshed.proposed_points));
      }
    });
  };

  const handleContestClick = () => {
    startTransition(async () => {
      const result = await contestChallenge(challengeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Contestation envoyée au groupe");
    });
  };

  const handleCreatorCancel = () => {
    startTransition(async () => {
      const result = await cancelChallengeByCreator(challengeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Défi annulé par le lanceur");
    });
  };

  const handleAbandonAfterFailedProof = () => {
    startTransition(async () => {
      const result = await abandonChallengeAfterFailedProof(challengeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.warning(`Pari perdu (-${result.penalty} points)`);
    });
  };

  if (status === "negotiating") {
    const ps = currentPriceState;
    const votes = ps?.votes ?? [];
    const approvals = ps?.approvals ?? 0;
    const rejections = ps?.rejections ?? 0;
    const keeps = ps?.keeps ?? 0;
    const threshold = ps?.threshold ?? 0;
    if (isTarget) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            La contestation est en cours de vote par les autres membres.
          </div>
          {ps && (
            <PriceProgress
              approvals={approvals}
              rejections={rejections}
              keeps={keeps}
              threshold={threshold}
            />
          )}
        </div>
      );
    }

    if (isCreator) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            Contestation en cours, en attente du vote des autres membres.
          </div>
          {ps && (
            <PriceProgress
              approvals={approvals}
              rejections={rejections}
              keeps={keeps}
              threshold={threshold}
              validatorsCount={ps.validators_count}
            />
          )}
          <Button
            variant="destructive"
            className="w-full"
            disabled={isPending}
            onClick={handleCreatorCancel}
          >
            <X className="mr-1 size-4" />
            {isPending ? "..." : "Annuler le défi"}
          </Button>
        </div>
      );
    }

    if (!isValidator) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          En attente des validateurs du groupe.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">Vote de contestation</p>
          <p className="text-muted-foreground">
            Choisis entre annuler le défi, le maintenir tel quel, ou proposer un nouveau tarif.
          </p>
        </div>

        {ps && (
          <PriceProgress
            approvals={approvals}
            rejections={rejections}
            keeps={keeps}
            threshold={threshold}
            validatorsCount={ps.validators_count}
          />
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            className="flex-1"
            variant={ps?.user_vote === "keep" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => handlePriceVote("keep")}
          >
            <Check className="mr-1 size-4" />
            {isPending ? "..." : "Maintenir tel quel"}
          </Button>
          <Button
            className="flex-1"
            variant={ps?.user_vote === "counter" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => handlePriceVote("counter")}
          >
            <ThumbsUp className="mr-1 size-4" />
            {isPending ? "..." : "Contre-proposer"}
          </Button>
          <Button
            className="flex-1"
            variant={ps?.user_vote === "cancel" ? "destructive" : "outline"}
            disabled={isPending}
            onClick={() => handlePriceVote("cancel")}
          >
            <ThumbsDown className="mr-1 size-4" />
            {isPending ? "..." : "Demander annulation"}
          </Button>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium">Montant de contre-proposition</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={counterPoints}
              onChange={(e) => setCounterPoints(e.target.value)}
              className="border-input bg-background h-12 sm:h-9 w-full rounded-md border px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">pts</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              className="w-full"
              variant="outline"
              disabled={isPending}
              onClick={() => handlePriceVote("counter")}
            >
              Envoyer ma contre-proposition
            </Button>
          </div>
        </div>

        {votes.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {votes.map((v) => (
              <div key={v.voter_id} className="flex items-center gap-1">
                {v.vote === "counter" ? (
                  <ThumbsUp className="size-3 text-green-500" />
                ) : v.vote === "keep" ? (
                  <Check className="size-3 text-blue-500" />
                ) : (
                  <ThumbsDown className="size-3 text-red-500" />
                )}
                <span>{v.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (status === "proposed" && isTarget) {
    return (
      <>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              className="flex-1"
              disabled={isPending}
              onClick={handleAcceptClick}
            >
              <Check className="mr-1 size-4" />
              {isPending ? "..." : "Accepter"}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={isPending}
              onClick={handleDeclineClick}
            >
              <X className="mr-1 size-4" />
              {isPending ? "..." : "Refuser"}
            </Button>
          </div>
          {canContest ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={handleContestClick}
            >
              <AlertTriangle className="mr-1 size-4" />
              {isPending ? "..." : "Contester"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Contestation déjà utilisée pour ce défi. Tu peux accepter ou refuser.
            </p>
          )}
        </div>

        <ResponsivePanel open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
          <ResponsivePanelContent>
            <ResponsivePanelHeader>
              <ResponsivePanelTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-orange-500" />
                Refus avec pénalité
              </ResponsivePanelTitle>
              <ResponsivePanelDescription>
                Tu as utilisé tes 2 refus gratuits cette semaine. Refuser ce
                défi te coûtera{" "}
                <strong className="text-destructive">
                  {declineInfo?.penalty ?? 0} points
                </strong>{" "}
                (50% des {points} pts du défi).
              </ResponsivePanelDescription>
            </ResponsivePanelHeader>
            <ResponsivePanelFooter className="flex-col gap-2 sm:flex-col">
              {declineInfo && declineInfo.availableJokers.length > 0 && (
                <Button
                  className="w-full"
                  onClick={() =>
                    handleDeclineConfirm(declineInfo.availableJokers[0])
                  }
                  disabled={isPending}
                >
                  <Shield className="mr-1 size-4" />
                  {isPending
                    ? "..."
                    : `Utiliser un Joker (${declineInfo.availableJokers.length} dispo)`}
                </Button>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => handleDeclineConfirm()}
                disabled={isPending}
              >
                <X className="mr-1 size-4" />
                {isPending
                  ? "..."
                  : `Refuser et perdre ${declineInfo?.penalty ?? 0} pts`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setDeclineDialogOpen(false)}
                disabled={isPending}
              >
                Annuler
              </Button>
            </ResponsivePanelFooter>
          </ResponsivePanelContent>
        </ResponsivePanel>

        <ResponsivePanel open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
          <ResponsivePanelContent>
            <ResponsivePanelHeader>
              <ResponsivePanelTitle className="flex items-center gap-2">
                <Zap className="size-5 text-yellow-500" />
                Utiliser un Booster ?
              </ResponsivePanelTitle>
              <ResponsivePanelDescription>
                Tu as {availableBoosters.length} Booster
                {availableBoosters.length > 1 ? "s" : ""} disponible
                {availableBoosters.length > 1 ? "s" : ""}. Un Booster doublera
                les points gagnés ({points} → {points * 2} pts) si tu
                réussis ce défi.
              </ResponsivePanelDescription>
            </ResponsivePanelHeader>
            <ResponsivePanelFooter className="flex-col gap-2 sm:flex-col">
              <Button
                className="w-full"
                onClick={() =>
                  handleAcceptConfirm(availableBoosters[0]?.id)
                }
                disabled={isPending}
              >
                <Zap className="mr-1 size-4" />
                {isPending ? "..." : `Accepter avec Booster (x2)`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleAcceptConfirm()}
                disabled={isPending}
              >
                <Check className="mr-1 size-4" />
                {isPending ? "..." : "Accepter sans Booster"}
              </Button>
            </ResponsivePanelFooter>
          </ResponsivePanelContent>
        </ResponsivePanel>
      </>
    );
  }

  if (status === "proposed" && isCreator) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          En attente de la réponse...
        </div>
        <Button
          variant="destructive"
          className="w-full"
          disabled={isPending}
          onClick={handleCreatorCancel}
        >
          <X className="mr-1 size-4" />
          {isPending ? "..." : "Annuler le défi"}
        </Button>
      </div>
    );
  }

  if (status === "accepted" && isTarget) {
    return (
      <div className="space-y-3">
        {hasFailedProofOnce && (
          <div className="flex items-center gap-2 rounded-lg bg-orange-50 p-4 text-sm text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            <AlertTriangle className="size-4 shrink-0" />
            Ta première preuve a été refusée. Il te reste une dernière tentative,
            ou tu peux abandonner avec pénalité.
          </div>
        )}
        {hasBoosted && (
          <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
            <Zap className="size-4 shrink-0" />
            Booster actif — x2 points à la validation
          </div>
        )}
        {hasFailedProofOnce ? (
          <Button
            variant="destructive"
            className="w-full"
            disabled={isPending}
            onClick={handleAbandonAfterFailedProof}
          >
            <X className="mr-1 size-4" />
            {isPending
              ? "..."
              : `Abandonner le pari (-${Math.max(1, Math.floor(points / 2))} pts)`}
          </Button>
        ) : (
          <Button
            variant="destructive"
            className="w-full"
            disabled={isPending}
            onClick={handleCancelClick}
          >
            <X className="mr-1 size-4" />
            {isPending ? "..." : "Annuler le défi"}
          </Button>
        )}

        {!hasFailedProofOnce && (
          <ResponsivePanel open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <ResponsivePanelContent>
              <ResponsivePanelHeader>
                <ResponsivePanelTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-orange-500" />
                  Confirmer l&apos;annulation
                </ResponsivePanelTitle>
                <ResponsivePanelDescription>
                  {cancelInfo?.isFree
                    ? "Ce défi sera annulé sans pénalité."
                    : `Annuler ce défi te coûtera ${cancelInfo?.penalty ?? 0} points (50% des ${points} pts).`}
                </ResponsivePanelDescription>
              </ResponsivePanelHeader>
              <ResponsivePanelFooter className="flex-col gap-2 sm:flex-col">
                {!cancelInfo?.isFree && (cancelInfo?.availableJokers.length ?? 0) > 0 && (
                  <Button
                    className="w-full"
                    onClick={() => handleCancelConfirm(cancelInfo?.availableJokers[0])}
                    disabled={isPending}
                  >
                    <Shield className="mr-1 size-4" />
                    {isPending
                      ? "..."
                      : `Utiliser un Joker et annuler (${cancelInfo?.availableJokers.length ?? 0} dispo)`}
                  </Button>
                )}
                <Button
                  variant={cancelInfo?.isFree ? "default" : "destructive"}
                  className="w-full"
                  onClick={() => handleCancelConfirm()}
                  disabled={isPending}
                >
                  <X className="mr-1 size-4" />
                  {isPending
                    ? "..."
                    : cancelInfo?.isFree
                      ? "Confirmer l&apos;annulation"
                      : `Annuler et perdre ${cancelInfo?.penalty ?? 0} pts`}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setCancelDialogOpen(false)}
                  disabled={isPending}
                >
                  Conserver le défi
                </Button>
              </ResponsivePanelFooter>
            </ResponsivePanelContent>
          </ResponsivePanel>
        )}
      </div>
    );
  }

  if (status === "accepted" && isCreator) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          En attente de la preuve...
          {hasBoosted && (
            <span className="ml-auto flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <Zap className="size-3.5" /> x2
            </span>
          )}
        </div>
        <Button
          variant="destructive"
          className="w-full"
          disabled={isPending}
          onClick={handleCreatorCancel}
        >
          <X className="mr-1 size-4" />
          {isPending ? "..." : "Annuler le défi"}
        </Button>
      </div>
    );
  }

  if (status === "in_progress" && isCreator) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          Défi en cours...
        </div>
        <Button
          variant="destructive"
          className="w-full"
          disabled={isPending}
          onClick={handleCreatorCancel}
        >
          <X className="mr-1 size-4" />
          {isPending ? "..." : "Annuler le défi"}
        </Button>
      </div>
    );
  }

  if (status === "proof_submitted") {
    const vi = currentVoteInfo;

    if (isTarget) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            En attente de validation par le groupe...
          </div>
          {vi && <VoteProgress voteInfo={vi} />}
          {available493Items.length > 0 && (
            <Button
              className="w-full"
              variant="outline"
              disabled={isPending}
              onClick={handleValidateOwnProofWith493}
            >
              <Shield className="mr-1 size-4" />
              {isPending ? "..." : "Valider ma preuve (49.3)"}
            </Button>
          )}
        </div>
      );
    }

    const canVote = isMember && !isTarget;

    return (
      <div className="space-y-3">
        {vi && <VoteProgress voteInfo={vi} />}
        {canVote && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              className="flex-1"
              variant={vi?.userVote === "approve" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => handleVote("approve")}
            >
              <ThumbsUp className="mr-1 size-4" />
              {isPending ? "..." : "Approuver"}
            </Button>
            <Button
              className="flex-1"
              variant={vi?.userVote === "reject" ? "destructive" : "outline"}
              disabled={isPending}
              onClick={() => handleVote("reject")}
            >
              <ThumbsDown className="mr-1 size-4" />
              {isPending ? "..." : "Rejeter"}
            </Button>
          </div>
        )}
        {vi && vi.voters.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {vi.voters.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                {v.vote === "approve" ? (
                  <ThumbsUp className="size-3 text-green-500" />
                ) : (
                  <ThumbsDown className="size-3 text-red-500" />
                )}
                <span>{v.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (status === "validated") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
        <Trophy className="size-4 shrink-0" />
        Défi validé ! {isTarget && `+${hasBoosted ? points * 2 : points} points${hasBoosted ? " (x2 Booster)" : ""}`}
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <X className="size-4 shrink-0" />
        Défi refusé
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        <X className="size-4 shrink-0" />
        Pari perdu. Le défi est rejeté avec pénalité.
      </div>
    );
  }

  return null;
}

function VoteProgress({ voteInfo }: { voteInfo: VoteInfo }) {
  const { approvals, rejections, threshold } = voteInfo;
  const approvalPct = Math.min(100, Math.round((approvals / threshold) * 100));
  const rejectionPct = Math.min(100, Math.round((rejections / threshold) * 100));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <ThumbsUp className="size-3.5" />
          {approvals}/{threshold}
        </span>
        <span className="text-xs text-muted-foreground">
          Seuil : {threshold} vote{threshold > 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          {rejections}/{threshold}
          <ThumbsDown className="size-3.5" />
        </span>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Progress value={approvalPct} className="h-2 [&>div]:bg-green-500" />
        </div>
        <div className="flex-1">
          <Progress value={rejectionPct} className="h-2 [&>div]:bg-red-500" />
        </div>
      </div>
    </div>
  );
}

function PriceProgress({
  approvals,
  rejections,
  keeps,
  threshold,
  validatorsCount,
}: {
  approvals: number;
  rejections: number;
  keeps: number;
  threshold: number;
  validatorsCount?: number;
}) {
  const safeThreshold = Math.max(1, threshold);
  const counterPct = Math.min(100, Math.round((approvals / safeThreshold) * 100));
  const keepPct = Math.min(100, Math.round((keeps / safeThreshold) * 100));
  const cancelPct = Math.min(100, Math.round((rejections / safeThreshold) * 100));
  const thresholdLabel =
    typeof validatorsCount === "number" && validatorsCount < 3
      ? `Seuil : tous les ${validatorsCount} votants`
      : "Seuil : 3 votes";

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{thresholdLabel}</span>
        <span>{safeThreshold} vote{safeThreshold > 1 ? "s" : ""} requis</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <Check className="size-3.5" />
            Maintien
          </span>
          <span className="text-xs">{keeps}/{safeThreshold}</span>
        </div>
        <Progress value={keepPct} className="h-2 [&>div]:bg-blue-500" />
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <ThumbsUp className="size-3.5" />
            Contre-proposition
          </span>
          <span className="text-xs">{approvals}/{safeThreshold}</span>
        </div>
        <Progress value={counterPct} className="h-2 [&>div]:bg-green-500" />
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <ThumbsDown className="size-3.5" />
            Annulation
          </span>
          <span className="text-xs">{rejections}/{safeThreshold}</span>
        </div>
        <Progress value={cancelPct} className="h-2 [&>div]:bg-red-500" />
      </div>
    </div>
  );
}
