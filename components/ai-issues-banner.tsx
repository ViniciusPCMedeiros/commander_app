import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { AIIssues } from "@/lib/ai-issues";

/** Faixa só para o root quando a rotina semanal da IA caiu no modo local. */
export function AIIssuesBanner({ issues }: { issues: AIIssues }) {
  if (issues.configured && issues.total === 0) return null;
  const parts = [
    issues.insights.length && `${issues.insights.length} análise${issues.insights.length > 1 ? "s" : ""} de jogador`,
    issues.newspapers.length && `a Gazeta ${issues.newspapers.map((n) => `#${n.edition}`).join(" e ")}`,
  ].filter(Boolean);

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-amber-200">
        <AlertTriangle className="size-4 shrink-0 text-amber-400" />
        <span className="flex-1">
          {issues.configured
            ? `A IA não respondeu: ${parts.join(" e ")} ${issues.total > 1 ? "saíram" : "saiu"} no modo local.`
            : "IA não configurada (AI_API_KEY): análises e Gazeta saem no modo local."}
        </span>
        {issues.configured && (
          <Link href="/admin#ia" className="font-semibold text-amber-300 underline-offset-2 hover:underline">
            Refazer no Admin →
          </Link>
        )}
      </div>
    </div>
  );
}
