import Link from "next/link";
import { Clock, Hourglass, ScrollText, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RARITY_STYLE } from "@/components/achievement-badge";
import { CONTRACT_RARITY_LABEL, type SeasonContract } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Contratos da semana em aberto (Painel): o que dá para cumprir agora e quanto vale. */
export function WeeklyContracts({
  contracts,
  seasonLabel,
  viewerId,
}: {
  contracts: (SeasonContract & { takers: string[]; inReview: boolean })[];
  seasonLabel: string;
  viewerId: string;
}) {
  return (
    <Card className="border-amber-400/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-5 text-amber-300" /> Contratos da semana
        </CardTitle>
        <CardDescription className="flex items-center justify-between gap-2">
          <span>Pontos extras na {seasonLabel}.</span>
          <Link href="/seasons#contratos" className="shrink-0 text-foreground hover:underline">
            Pegar ou reivindicar →
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {contracts.length === 0 && (
          <p className="text-sm text-muted-foreground">Todos os contratos desta semana já têm dono. Novos na segunda.</p>
        )}
        {contracts.map((c) => (
          <Link
            key={c.id}
            href="/seasons#contratos"
            className="flex items-start gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/40"
          >
            <ScrollText className={cn("mt-0.5 size-4 shrink-0", RARITY_STYLE[c.rarity].text)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{c.title}</span>
                <span className={cn("text-[10px] font-semibold tracking-wider uppercase", RARITY_STYLE[c.rarity].text)}>
                  {CONTRACT_RARITY_LABEL[c.rarity]}
                </span>
              </div>
              {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> até {formatDateTime(new Date(new Date(c.ends_at).getTime() - 60_000))}
                </span>
                {c.inReview && (
                  <span className="flex items-center gap-1 text-amber-300/90">
                    <Hourglass className="size-3" /> reivindicado, em análise
                  </span>
                )}
                {c.takers.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {c.takers.includes(viewerId)
                      ? c.takers.length === 1
                        ? "você está tentando"
                        : `você e mais ${c.takers.length - 1} tentando`
                      : `${c.takers.length} tentando`}
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 text-lg font-black text-amber-300 tabular-nums">+{c.reward}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
