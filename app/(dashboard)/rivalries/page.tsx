import type { Metadata } from "next";
import Link from "next/link";
import { Flame } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { duelBetween, exchanged, hottestDuels, loadRivalries } from "@/lib/rivalries";
import { cn } from "@/lib/utils";
import { PlayerAvatar, Score } from "@/components/duel-ui";

export const metadata: Metadata = { title: "Rivalidades" };

const VIEWS = ["abates", "vitorias", "mesas"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { abates: "Abates", vitorias: "Vitórias", mesas: "Mesas juntos" };

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export default async function RivalriesPage(props: PageProps<"/rivalries">) {
  const sp = await props.searchParams;
  const view: View = VIEWS.includes(sp.ver as View) ? (sp.ver as View) : "abates";

  const { supabase } = await requireUser();
  const r = await loadRivalries(supabase);
  const byId = new Map(r.players.map((p) => [p.id, p]));
  const hottest = hottestDuels(r);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Confrontos"
        title="Rivalidades"
        description="Quem vence quem e quem elimina quem, contando só as mesas em que os dois estavam juntos."
      />

      {r.players.length < 2 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            As rivalidades aparecem quando houver partidas aprovadas com pelo menos dois jogadores.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Flame className="size-4 text-orange-400" /> Rivalidades mais quentes
            </h2>
            {hottest.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma dupla se enfrentou mais de uma vez ainda.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hottest.map((d) => {
                const a = byId.get(d.me);
                const b = byId.get(d.them);
                return (
                  <Link key={`${d.me}:${d.them}`} href={`/rivalries/${d.me}/${d.them}`} className="group">
                    <Card className="gap-3 px-4 py-4 transition-colors group-hover:border-primary/50">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar player={a} />
                        <span className="font-display text-xs font-bold tracking-widest text-primary">VS</span>
                        <PlayerAvatar player={b} />
                        <div className="min-w-0 flex-1 text-sm leading-tight font-semibold">
                          <div className="truncate">{a?.name}</div>
                          <div className="truncate">{b?.name}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <Score mine={d.iKilled} theirs={d.theyKilled} className="text-lg" />
                          <div className="text-[10px] tracking-wider text-muted-foreground uppercase">Abates</div>
                        </div>
                        <div>
                          <Score mine={d.myWins} theirs={d.theirWins} className="text-lg" />
                          <div className="text-[10px] tracking-wider text-muted-foreground uppercase">Vitórias</div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold tabular-nums">{d.together}</div>
                          <div className="text-[10px] tracking-wider text-muted-foreground uppercase">Mesas</div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Quadro de confrontos</CardTitle>
              <CardDescription>
                Leia pela linha: o primeiro número é de quem está à esquerda, contra quem está na coluna. Toque numa
                casa para ver o confronto.
              </CardDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {VIEWS.map((v) => (
                  <Chip key={v} href={`/rivalries?ver=${v}`} active={v === view}>
                    {VIEW_LABEL[v]}
                  </Chip>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-1 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-card" />
                      {r.players.map((p) => (
                        <th key={p.id} className="px-1 pb-1 font-normal" title={p.name}>
                          <Link href={`/players/${p.id}`} className="flex flex-col items-center gap-1">
                            <PlayerAvatar player={p} className="size-8" />
                            <span className="max-w-14 truncate text-[10px] text-muted-foreground">
                              {p.name.split(" ")[0]}
                            </span>
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.players.map((row) => (
                      <tr key={row.id}>
                        <th className="sticky left-0 z-10 bg-card pr-2 text-left font-medium">
                          <Link href={`/players/${row.id}`} className="flex items-center gap-2 hover:underline">
                            <PlayerAvatar player={row} className="size-7 sm:hidden" />
                            <span className="hidden max-w-32 truncate sm:inline">{row.name}</span>
                            <span className="sr-only sm:hidden">{row.name}</span>
                          </Link>
                        </th>
                        {r.players.map((col) => {
                          if (col.id === row.id)
                            return (
                              <td key={col.id} className="rounded-md bg-muted/30 text-center text-muted-foreground">
                                <span className="sr-only">—</span>
                              </td>
                            );
                          const d = duelBetween(r, row.id, col.id);
                          if (!d)
                            return (
                              <td
                                key={col.id}
                                className="h-11 min-w-14 rounded-md border border-dashed border-border/50 text-center text-muted-foreground/50"
                                title={`${row.name} e ${col.name} ainda não dividiram mesa`}
                              >
                                ·
                              </td>
                            );
                          const [mine, theirs] =
                            view === "abates"
                              ? [d.iKilled, d.theyKilled]
                              : view === "vitorias"
                                ? [d.myWins, d.theirWins]
                                : [d.together, d.together];
                          const tone =
                            view === "mesas" || mine === theirs
                              ? "border-border bg-background/40"
                              : mine > theirs
                                ? "border-emerald-500/40 bg-emerald-500/10"
                                : "border-rose-500/40 bg-rose-500/10";
                          return (
                            <td key={col.id} className="p-0">
                              <Link
                                href={`/rivalries/${row.id}/${col.id}`}
                                title={`${row.name} × ${col.name}: ${d.together} mesa(s), vitórias ${d.myWins}×${d.theirWins}, abates ${d.iKilled}×${d.theyKilled}`}
                                className={cn(
                                  "flex h-11 min-w-14 items-center justify-center rounded-md border px-1.5 transition-colors hover:border-primary",
                                  tone,
                                )}
                              >
                                {view === "mesas" ? (
                                  <span className="font-semibold tabular-nums">{d.together}</span>
                                ) : (
                                  <Score mine={mine} theirs={theirs} />
                                )}
                              </Link>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Verde: quem está na linha leva vantagem · vermelho: está atrás · tracejado: nunca dividiram mesa.
                {view === "abates" &&
                  ` Abates trocados no grupo: ${[...r.duels.values()].filter((d) => d.me < d.them).reduce((s, d) => s + exchanged(d), 0)}.`}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
