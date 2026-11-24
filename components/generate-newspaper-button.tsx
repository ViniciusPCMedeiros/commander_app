"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Gera (ou atualiza) a edição da semana e abre a página dela. */
export function GenerateNewspaperButton({ variant = "secondary" }: { variant?: "default" | "secondary" | "outline" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/newspaper", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao gerar o jornal");
      const via = json.source === "ai" ? "pela IA" : "no modo local";
      toast.success(
        json.updated
          ? `Edição #${json.newspaper.edition_number} da semana atualizada ${via}.`
          : `Edição #${json.newspaper.edition_number} gerada ${via}!`,
      );
      router.push(`/newspapers/${json.newspaper.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar o jornal");
      setLoading(false);
    }
  };

  return (
    <Button onClick={generate} disabled={loading} variant={variant} size="sm">
      {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Gerar edição da semana
    </Button>
  );
}
