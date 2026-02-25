import { z } from "zod";

const MAX_TEXT = 500;
const MAX_NAME = 100;

const uuid = z.string().uuid("ID invalide");

export const createChallengeSchema = z.object({
  groupId: uuid,
  targetId: uuid,
  title: z.string().min(1, "Le titre est requis").max(MAX_NAME, `${MAX_NAME} caractères max`),
  description: z.string().max(MAX_TEXT).nullable(),
  points: z.number().int().min(1, "Les points doivent être positifs").max(10_000),
  deadline: z.string().nullable(),
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
    .nullable(),
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
});

export const transferGroupOwnershipSchema = z.object({
  groupId: uuid,
  newOwnerId: uuid,
});

export const addShopItemSchema = z.object({
  groupId: uuid,
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME),
  description: z.string().max(MAX_TEXT).nullable(),
  price: z.number().int().min(1, "Le prix doit être positif").max(100_000),
  stock: z.number().int().min(0).nullable(),
  itemType: z.enum(["custom", "joker", "booster", "voleur"]).default("custom"),
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

export const voteOnChallengeSchema = z.object({
  challengeId: uuid,
  vote: z.enum(["approve", "reject"], { message: "Vote invalide" }),
});

export const voteChallengePriceSchema = z.object({
  challengeId: uuid,
  vote: z.enum(["approve", "reject"], { message: "Vote invalide" }),
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
  if ("stock" in raw && raw.stock !== null) raw.stock = Number(raw.stock);

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Données invalides" };
  }
  return { success: true, data: result.data };
}
