import { z } from "zod";
import { STORE_ITEM_TYPES } from "@/lib/store-item-types";

const MAX_TEXT = 500;
const MAX_NAME = 100;
const CHALLENGE_PRESET_POINTS = [5, 10, 25, 50, 75, 100, 150] as const;
const CREATION_ITEM_TYPES = [
  "quitte_ou_double",
  "cinquante_cinquante",
  "sniper",
  "roulette_russe",
] as const;

const uuid = z.string().uuid("ID invalide");

export const createChallengeSchema = z
  .object({
    groupId: uuid,
    targetIds: z
      .array(uuid)
      .refine((ids) => new Set(ids).size === ids.length, "Les cibles doivent être uniques"),
    title: z.string().min(1, "Le titre est requis").max(MAX_NAME, `${MAX_NAME} caractères max`),
    description: z.string().max(MAX_TEXT).nullable(),
    points: z
      .number()
      .int()
      .refine(
        (value) =>
          (CHALLENGE_PRESET_POINTS as readonly number[]).includes(value),
        "Valeur de points invalide",
      ),
    deadline: z.string().nullable(),
    selectedItemInventoryId: uuid.nullable().optional(),
    selectedItemType: z.enum(CREATION_ITEM_TYPES).nullable().optional(),
    fiftyFiftyTitle: z.string().max(MAX_NAME, `${MAX_NAME} caractères max`).nullable().optional(),
    fiftyFiftyDescription: z.string().max(MAX_TEXT).nullable().optional(),
    fiftyFiftyPoints: z
      .number()
      .int()
      .refine(
        (value) =>
          (CHALLENGE_PRESET_POINTS as readonly number[]).includes(value),
        "Valeur de points invalide",
      )
      .nullable()
      .optional(),
    fiftyFiftyDeadline: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasItemId = !!data.selectedItemInventoryId;
    const hasItemType = !!data.selectedItemType;
    if (hasItemId !== hasItemType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sélection d'item invalide",
        path: ["selectedItemInventoryId"],
      });
    }

    const selectedType = data.selectedItemType;
    if (selectedType === "roulette_russe") {
      if (data.targetIds.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Roulette Russe ne nécessite pas de cible manuelle",
          path: ["targetIds"],
        });
      }
      return;
    }

    if (data.targetIds.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sélectionne au moins une cible",
        path: ["targetIds"],
      });
      return;
    }

    if (selectedType === "quitte_ou_double" && data.targetIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quitte ou Double est disponible uniquement pour une cible unique",
        path: ["selectedItemType"],
      });
    }

    if (
      (selectedType === "cinquante_cinquante" || selectedType === "sniper") &&
      data.targetIds.length !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cet item nécessite une cible unique",
        path: ["targetIds"],
      });
    }

    if (selectedType === "cinquante_cinquante") {
      if (!data.fiftyFiftyTitle || data.fiftyFiftyTitle.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Le titre de l'option 2 est requis pour 50/50",
          path: ["fiftyFiftyTitle"],
        });
      }
      if (data.fiftyFiftyPoints == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Les points de l'option 2 sont requis pour 50/50",
          path: ["fiftyFiftyPoints"],
        });
      }
    }
  });

export const submitProofSchema = z.object({
  challengeId: uuid,
  comment: z.string().max(MAX_TEXT).nullable(),
  mediaUrl: z
    .string()
    .url()
    .refine(
      (url) => url.includes(".supabase.co/storage/"),
      "URL de média invalide",
    )
    .nullable()
    .optional(),
});

export const createGroupSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME, `${MAX_NAME} caractères max`),
  description: z.string().max(MAX_TEXT).nullable(),
});

export const joinGroupSchema = z.object({
  code: z.string().min(1, "Le code est requis").max(50),
});

export const leaveGroupSchema = z.object({
  groupId: uuid,
});

export const updateGroupSchema = z.object({
  groupId: uuid,
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME, `${MAX_NAME} caractères max`),
  description: z.string().max(MAX_TEXT).nullable(),
});

export const deleteGroupSchema = z.object({
  groupId: uuid,
  groupNameConfirmation: z.string().min(1, "Le nom du groupe est requis"),
});

export const resetGroupSchema = z.object({
  groupId: uuid,
  groupNameConfirmation: z.string().min(1, "Le nom du groupe est requis"),
});

export const transferGroupOwnershipSchema = z.object({
  groupId: uuid,
  newOwnerId: uuid,
});

export const updateMemberGroupPointsSchema = z.object({
  groupId: uuid,
  memberId: uuid,
  newPoints: z.number().int().min(0, "Les points doivent être positifs ou nuls").max(1_000_000),
});

export const addShopItemSchema = z.object({
  groupId: uuid,
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME),
  description: z.string().max(MAX_TEXT).nullable(),
  price: z.number().int().min(1, "Le prix doit être positif").max(100_000),
  stock: z.number().int().min(0).nullable(),
  itemType: z.enum(STORE_ITEM_TYPES).default("custom"),
});

export const updateShopItemSchema = z.object({
  itemId: uuid,
  groupId: uuid,
  price: z.number().int().min(1, "Le prix doit être positif").max(100_000),
  stock: z.number().int().min(0).nullable(),
});

export const deleteShopItemSchema = z.object({
  itemId: uuid,
  groupId: uuid,
});

export const purchaseItemSchema = z.object({
  itemId: uuid,
  groupId: uuid,
});

export const getEffectiveShopPricesSchema = z.object({
  groupId: uuid,
});

export const voteOnChallengeSchema = z.object({
  challengeId: uuid,
  vote: z.enum(["approve", "reject"], { message: "Vote invalide" }),
});

export const voteChallengePriceSchema = z.object({
  challengeId: uuid,
  vote: z.enum(["counter", "cancel", "keep"], { message: "Vote invalide" }),
  counterPoints: z.number().int().min(1, "La contre-proposition doit être positive").nullable(),
}).superRefine((data, ctx) => {
  if (data.vote === "counter" && data.counterPoints == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Un montant est requis pour une contre-proposition",
      path: ["counterPoints"],
    });
  }
  if ((data.vote === "cancel" || data.vote === "keep") && data.counterPoints != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Aucun montant n'est attendu pour ce vote",
      path: ["counterPoints"],
    });
  }
});

export const contestChallengeSchema = z.object({
  challengeId: uuid,
});

export const applyInventoryItemEffectSchema = z.object({
  inventoryId: uuid,
  challengeId: uuid.optional(),
  targetProfileId: uuid.optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const creatorDecideCounterProposalSchema = z.object({
  challengeId: uuid,
  action: z.enum(["accept", "counter"], { message: "Action invalide" }),
  counterPoints: z.number().int().min(1, "La contre-proposition doit être positive").nullable(),
});

export const cancelChallengeByCreatorSchema = z.object({
  challengeId: uuid,
});

export const updateProfileSchema = z.object({
  username: z.string().min(3, "3 caractères minimum").max(30, "30 caractères max"),
  avatarUrl: z.string().url().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
});

export const signupSchema = z.object({
  username: z.string().min(3, "3 caractères minimum").max(30, "30 caractères max"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
});

export function parseFormData<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      raw[key] = value === "" ? null : value;
    }
  }

  if ("price" in raw && raw.price !== null) raw.price = Number(raw.price);
  if ("points" in raw && raw.points !== null) raw.points = Number(raw.points);
  if ("fiftyFiftyPoints" in raw && raw.fiftyFiftyPoints !== null) {
    raw.fiftyFiftyPoints = Number(raw.fiftyFiftyPoints);
  }
  if ("newPoints" in raw && raw.newPoints !== null) raw.newPoints = Number(raw.newPoints);
  if ("stock" in raw && raw.stock !== null) raw.stock = Number(raw.stock);

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Données invalides" };
  }
  return { success: true, data: result.data };
}
