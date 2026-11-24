import type { Metadata } from "next";
import Link from "next/link";
import { Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GenerateNewspaperButton } from "@/components/generate-newspaper-button";
import { isAIConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { formatDay, markdownExcerpt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WeeklyNewspaper } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Jornais" };

function SourceBadge({ source }: { source: WeeklyNewspaper["source"] }) {
  if (!source) return null;
  return (
    <Badge variant="outline" className="text-[10px]">
      {source === "ai" ? "Gemini" : "Gerador local"}
    </Badge>
  );
}

export default async function NewspapersPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("weekly_newspapers")
    .select("*")
    .order("edition_number", { ascending: false })
    .limit(200)
    .returns<WeeklyNewspaper[]>();
  const editions = data ?? [];
  const [latest, ...older] = editions;

  return (
    <div className="space-y-6">
      <PageHeader
        banner="jornais"
        eyebrow="Gazeta do Mesão"
        title="Jornais"
        description={
          <>
            Arquivo do Jornal Semanal do Playgroup · {editions.length} edição(ões) ·{" "}
            {isAIConfigured() ? "escrito pelo Gemini" : "IA não configurada (gerador local)"}
          </>
        }
        actions={<GenerateNewspaperButton variant="default" />}
      />

      {!latest && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Nenhuma edição ainda. Gere a primeira!</CardContent>
        </Card>
      )}

      {latest && (
        <Link href={`/newspapers/${latest.id}`} className="group block">
          <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent transition-colors group-hover:border-amber-500/60">
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge className="bg-amber-500 text-amber-950">Edição mais recente</Badge>
                <span>
                  #{latest.edition_number} · {formatDay(latest.week_start)} a {formatDay(latest.week_end)}
                </span>
                <SourceBadge source={latest.source} />
              </div>
              <h2 className="font-serif text-3xl leading-tight font-bold group-hover:underline">{latest.headline}</h2>
              <p className="text-sm text-muted-foreground">{markdownExcerpt(latest.content, 320)}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Swords className="size-3.5" /> {latest.matches_count} partidas na semana
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {older.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Edições anteriores</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {older.map((n) => (
              <Link key={n.id} href={`/newspapers/${n.id}`} className="group">
                <Card className={cn("h-full gap-2 transition-colors group-hover:border-foreground/30")}>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">#{n.edition_number}</span>
                      <span>
                        {formatDay(n.week_start)} a {formatDay(n.week_end)}
                      </span>
                      <SourceBadge source={n.source} />
                    </div>
                    <h3 className="font-serif text-lg leading-snug font-bold group-hover:underline">{n.headline}</h3>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{markdownExcerpt(n.content)}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Swords className="size-3.5" /> {n.matches_count} partidas
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
