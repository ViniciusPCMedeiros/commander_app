import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { WhatsAppShareButton } from "@/components/whatsapp-share-button";
import { formatDay } from "@/lib/format";
import type { WeeklyNewspaper } from "@/lib/types";

/** Última edição do jornal no painel, com atalhos para a edição completa e o arquivo. */
export function NewspaperCard({ newspaper, aiEnabled }: { newspaper: WeeklyNewspaper | null; aiEnabled: boolean }) {
  return (
    <Card className="border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Newspaper className="size-5 text-amber-400" />
          <CardTitle>Jornal Semanal do Playgroup</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {aiEnabled ? "Gemini" : "IA local (fallback)"}
          </Badge>
        </div>
        {newspaper && (
          <CardDescription>
            Edição #{newspaper.edition_number} · {formatDay(newspaper.week_start)} a {formatDay(newspaper.week_end)} ·{" "}
            {newspaper.matches_count} partidas
          </CardDescription>
        )}
        {newspaper && (
          <CardDescription className="text-xs">Nova edição toda segunda-feira à 00h, com as partidas de segunda a domingo.</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {newspaper ? (
          <article className="space-y-3">
            <Link href={`/newspapers/${newspaper.id}`} className="block hover:underline">
              <h2 className="font-serif text-2xl leading-tight font-bold">{newspaper.headline}</h2>
            </Link>
            <div className="max-h-72 overflow-y-auto pr-1">
              <Markdown>{newspaper.content}</Markdown>
            </div>
          </article>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma edição publicada ainda. Nova edição toda segunda-feira à 00h, com as partidas de segunda a domingo.</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {newspaper && (
          <Button asChild size="sm">
            <Link href={`/newspapers/${newspaper.id}`}>
              Ler edição completa <ArrowRight />
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href="/newspapers">Todas as edições</Link>
        </Button>
        {newspaper && (
          <WhatsAppShareButton headline={newspaper.headline} content={newspaper.content} edition={newspaper.edition_number} />
        )}
      </CardFooter>
    </Card>
  );
}
