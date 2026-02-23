"use client";

import { useState, useRef, useTransition } from "react";
import { submitProof } from "@/app/(app)/challenges/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, ImagePlus, X } from "lucide-react";

interface SubmitProofFormProps {
  challengeId: string;
}

export function SubmitProofForm({ challengeId }: SubmitProofFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Format non supporté. Utilise JPEG, PNG, WebP ou GIF.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("L'image ne doit pas dépasser 5 Mo");
      return;
    }

    setImageFile(file);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      let mediaUrl: string | null = null;

      if (imageFile) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("Non authentifié");
          return;
        }

        const ext = imageFile.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("proofs")
          .upload(path, imageFile);

        if (uploadError) {
          setError(`Erreur upload : ${uploadError.message}`);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("proofs").getPublicUrl(path);

        mediaUrl = publicUrl;
      }

      if (mediaUrl) {
        formData.set("mediaUrl", mediaUrl);
      }

      const result = await submitProof(formData);

      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        Preuve soumise ! En attente de validation...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="challengeId" value={challengeId} />
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {imagePreview && (
        <div className="relative inline-block">
          <img
            src={imagePreview}
            alt="Aperçu"
            className="max-h-48 rounded-lg border object-cover"
          />
          <button
            type="button"
            onClick={removeImage}
            className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="comment">Preuve / Commentaire</Label>
        <Textarea
          id="comment"
          name="comment"
          placeholder="Décris ta preuve ou ajoute un commentaire..."
          rows={3}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="mr-1 size-4" />
          {imageFile ? "Changer la photo" : "Ajouter une photo"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        <Send className="mr-1 size-4" />
        {isPending ? "Envoi..." : "Soumettre la preuve"}
      </Button>
    </form>
  );
}
