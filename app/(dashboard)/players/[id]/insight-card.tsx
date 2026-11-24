"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { formatDate } from "@/lib/format";
import type { AIInsight } from "@/lib/types";

export function InsightCard({
  userId,
  insight,
  currentGames,
  aiEnabled,
}: {
  userId: string;
  insight: AIInsight | null;
  currentGames: number;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const outdated = insight && insight.games_snapshot !== currentGames;

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/player-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao gerar análise");
      toast.success(json.source === "ai" ? "Análise gerada pelo Gemini!" : "Análise gerada (modo local).");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-violet-500/20 bg-gradient-to-b from-violet-500/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Brain className="size-5 text-violet-400" /> Estilo de jogo
          <Badge variant="outline" className="text-[10px]">
            {aiEnabled ? "Gemini" : "IA local (fallback)"}
          </Badge>
        </CardTitle>
        {insight && (
          <CardDescription>
            Gerado em {formatDate(insight.created_at)} com {insight.games_snapshot} partidas
            {outdated && " · há partidas novas desde então"}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {insight ? (
          <Markdown>{insight.content}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma análise ainda.</p>
        )}
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="secondary" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} {insight ? "Atualizar análise" : "Gerar análise"}
        </Button>
      </CardFooter>
    </Card>
  );
}
