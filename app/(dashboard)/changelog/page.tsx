import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { APP_VERSION, CHANGELOG, type ChangeKind } from "@/lib/changelog";
import { formatDate } from "@/lib/format";
import { MarkSeen } from "./mark-seen";

export const metadata: Metadata = { title: "Novidades" };

const KIND: Record<ChangeKind, { label: string; className: string }> = {
  novo: { label: "Novo", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  melhoria: { label: "Melhoria", className: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  correcao: { label: "Correção", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
};
const ORDER: ChangeKind[] = ["novo", "melhoria", "correcao"];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <MarkSeen />
      <PageHeader
        banner="novidades"
        eyebrow={`Versão atual: v${APP_VERSION}`}
        title="Novidades"
        description="O que mudou no Mesão a cada versão."
      />

      {CHANGELOG.map((release, i) => (
        <Card key={release.version} id={`v${release.version}`} className={i === 0 ? "border-primary/40" : undefined}>
          <CardHeader className="gap-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-display text-lg font-semibold text-primary">v{release.version}</span>
              <span>· {formatDate(release.date)}</span>
              {i === 0 && <Badge className="h-5">atual</Badge>}
            </div>
            <CardTitle>{release.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[...release.changes]
                .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
                .map((c) => (
                  <li key={c.text} className="flex items-start gap-3 text-sm">
                    <Badge variant="outline" className={`mt-0.5 w-20 shrink-0 justify-center ${KIND[c.kind].className}`}>
                      {KIND[c.kind].label}
                    </Badge>
                    <span>{c.text}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
