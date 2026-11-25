"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Refaz um item da rotina semanal pela IA (só o root chega a ver este botão). */
export function AIRetryButton({
  endpoint,
  body,
  label,
}: {
  endpoint: string;
  body: Record<string, string>;
  label: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const retry = async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao refazer");
      if (json.source === "ai") toast.success(`${label}: refeita pela IA.`);
      else toast.warning(`${label}: a IA ainda não respondeu; ficou no modo local. Tente mais tarde.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="secondary" onClick={retry} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <RotateCw />} Refazer
    </Button>
  );
}
