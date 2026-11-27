"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Flag, Loader2, Pencil, Plus, Rocket, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { RARITY_LABEL } from "@/lib/achievements";
import {
  addBaseAchievement,
  cancelSeason,
  deleteBaseAchievement,
  endSeasonNow,
  launchSeason,
  themeForRelaunch,
  updateSeasonEnd,
  type ThemeInput,
} from "@/lib/actions/seasons";
import {
  BASE_SEASON_ACHIEVEMENTS,
  CLOSE_GRACE_DAYS,
  freezeAchievements,
  SEASON_ICONS,
  seasonStatus,
  themeColor,
  type Season,
  type SeasonAchievementInput,
} from "@/lib/seasons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AchievementRow, emptyAchievement } from "./achievement-editor";
import { emptyTheme, ThemeEditor } from "./theme-editor";

export interface ThemeSummary extends ThemeInput {
  id: string;
}

const SP_MS = 3 * 60 * 60 * 1000;
/** Data → valor de <input type="datetime-local"> no horário de Brasília. */
const toLocal = (d: Date) => new Date(d.getTime() - SP_MS).toISOString().slice(0, 16);
const fromLocal = (v: string) => `${v}:00-03:00`;
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );
const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

const STATUS_LABEL = {
  upcoming: "Agendada",
  active: "Em andamento",
  ended: "Aguardando as últimas aprovações",
  closed: "Encerrada",
};

export function SeasonAdmin({
  seasons,
  themes,
  customBase,
  banners,
  defaultStartIso,
}: {
  seasons: Season[];
  defaultStartIso: string;
  themes: ThemeSummary[];
  customBase: { id: string; definition: SeasonAchievementInput }[];
  banners: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) return void toast.error(res.error);
      toast.success(ok);
      router.refresh();
    });

  const open = seasons.filter((s) => seasonStatus(s) !== "closed");
  const closed = seasons.filter((s) => seasonStatus(s) === "closed").reverse();

  // Lançar (início sugerido vem do servidor: logo depois da última temporada, ou a próxima hora cheia)
  const defaultStart = new Date(defaultStartIso);
  const [chosenTheme, setThemeId] = useState(themes[0]?.id ?? "");
  // Tema recém-criado ou excluído: cai no primeiro da lista em vez de ficar sem nenhum
  const themeId = themes.some((t) => t.id === chosenTheme) ? chosenTheme : (themes[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(toLocal(defaultStart));
  const [endsAt, setEndsAt] = useState(toLocal(addMonths(defaultStart, 1)));
  // Depois de lançar, o início sugerido muda (logo após a nova temporada): o formulário acompanha
  const [lastDefault, setLastDefault] = useState(defaultStartIso);
  if (lastDefault !== defaultStartIso) {
    setLastDefault(defaultStartIso);
    setStartsAt(toLocal(defaultStart));
    setEndsAt(toLocal(addMonths(defaultStart, 1)));
  }
  const theme = themes.find((t) => t.id === themeId);
  const preview = useMemo(() => {
    const s = new Date(fromLocal(startsAt));
    const e = new Date(fromLocal(endsAt));
    if (!theme || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return [];
    return freezeAchievements(
      [...BASE_SEASON_ACHIEVEMENTS, ...customBase.map((b) => b.definition)],
      theme.achievements,
      s,
      e,
    );
  }, [theme, startsAt, endsAt, customBase]);

  // Temas e base
  const [editing, setEditing] = useState<string | "new" | null>(null);
  // Relançar uma temporada encerrada: o mesmo tema no formulário, já aberto para editar as conquistas
  const relaunch = (seasonId: string) =>
    start(async () => {
      const res = await themeForRelaunch(seasonId);
      if (res.error || !res.id) return void toast.error(res.error ?? "Não deu para relançar.");
      setThemeId(res.id);
      setEditing(res.id);
      router.refresh();
      document.getElementById("lancar")?.scrollIntoView({ behavior: "smooth" });
    });
  const [newBase, setNewBase] = useState<SeasonAchievementInput | null>(null);
  const [endEdit, setEndEdit] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      {/* Temporadas abertas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-5" /> Temporada atual e agendadas
          </CardTitle>
          <CardDescription>
            As conquistas ficam travadas no lançamento; dá para mudar só a data de fim. No fim, a rotina automática
            encerra sozinha (pódio, campeão, Coroa e Lenda) assim que as partidas do período forem moderadas — no
            máximo {CLOSE_GRACE_DAYS} dias depois.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {open.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma temporada em andamento.</p>}
          {open.map((s) => {
            const status = seasonStatus(s);
            const color = themeColor(s.theme.color);
            return (
              <div key={s.id} className={cn("space-y-3 rounded-lg border p-3", color.border, color.bg)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-display text-lg font-bold", color.text)}>
                    T{s.number} · {s.theme.name}
                  </span>
                  <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {fmt(s.starts_at)} → {fmt(s.ends_at)} · {s.achievements.length} conquistas
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Novo fim</Label>
                    <Input
                      type="datetime-local"
                      value={endEdit[s.id] ?? toLocal(new Date(s.ends_at))}
                      onChange={(e) => setEndEdit({ ...endEdit, [s.id]: e.target.value })}
                      className="h-9 w-auto"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending || !endEdit[s.id]}
                    onClick={() => run(() => updateSeasonEnd(s.id, fromLocal(endEdit[s.id])), "Data de fim atualizada.")}
                  >
                    <Pencil /> Mudar fim
                  </Button>
                  {status !== "upcoming" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-500/50 text-rose-300"
                      disabled={pending}
                      onClick={() =>
                        confirm(
                          `Encerrar a T${s.number} agora? Pódio, campeão e títulos saem assim que não houver partida pendente do período.`,
                        ) &&
                        start(async () => {
                          const res = await endSeasonNow(s.id);
                          if (res.error) return void toast.error(res.error);
                          if (res.waiting)
                            toast.info(
                              `Fim marcado. ${res.waiting} partida(s) do período aguardam moderação: o resultado sai quando forem aprovadas ou rejeitadas.`,
                            );
                          else toast.success("Temporada encerrada.");
                          router.refresh();
                        })
                      }
                    >
                      <Flag /> Encerrar agora
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-300"
                      disabled={pending}
                      onClick={() =>
                        confirm(`Cancelar a T${s.number}? Ela ainda não começou.`) &&
                        run(() => cancelSeason(s.id), "Temporada cancelada.")
                      }
                    >
                      <XCircle /> Cancelar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {closed.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Encerradas</div>
              <ul className="space-y-1">
                {closed.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        T{s.number} · {s.theme.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({formatDate(s.starts_at)} a {formatDate(s.ends_at)})
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={pending}
                        onClick={() => relaunch(s.id)}
                      >
                        <RotateCcw /> Relançar
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lançar */}
      <Card id="lancar" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="size-5" /> Lançar temporada
          </CardTitle>
          <CardDescription>
            Escolha o tema (pode repetir um antigo) e as datas, no horário de Brasília. Partidas já jogadas dentro do
            período contam. Para trocar as conquistas de um tema antigo, edite o tema (abaixo) antes de lançar: as
            temporadas que já usaram o tema continuam com as conquistas de quando foram lançadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Crie um tema primeiro (abaixo).</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="launch-theme">Tema</Label>
                  <NativeSelect id="launch-theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
                    {themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="launch-start">Início</Label>
                  <Input
                    id="launch-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="launch-end">Fim</Label>
                  <Input id="launch-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Duração:</span>
                {[1, 2, 3].map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => setEndsAt(toLocal(addMonths(new Date(fromLocal(startsAt)), m)))}
                  >
                    {m} {m === 1 ? "mês" : "meses"}
                  </Button>
                ))}
              </div>
              {preview.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-sm font-semibold">
                    Conquistas desta temporada ({preview.length}) — números da base ajustados à duração
                  </div>
                  <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {preview.map((a) => {
                      const Icon = SEASON_ICONS[a.icon] ?? SEASON_ICONS.star;
                      return (
                        <div key={a.key} className="flex items-start gap-2">
                          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span>
                            <span className="font-medium">{a.name}</span>{" "}
                            <span className="text-xs text-muted-foreground">
                              ({a.source === "tema" ? "tema" : "base"}, {RARITY_LABEL[a.rarity].toLowerCase()}
                              {a.required ? "" : ", não conta para a Lenda"}) — {a.description}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <Button
                disabled={pending || !theme}
                onClick={() =>
                  confirm(`Lançar a temporada "${theme?.name}"? As conquistas ficam travadas depois do lançamento.`) &&
                  run(
                    () => launchSeason({ themeId, startsAt: fromLocal(startsAt), endsAt: fromLocal(endsAt) }),
                    "Temporada lançada!",
                  )
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Rocket />} Lançar temporada
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Temas */}
      <Card>
        <CardHeader>
          <CardTitle>Temas</CardTitle>
          <CardDescription>
            Cada tema tem arte, cor, os títulos (Lenda e Coroa) e as conquistas temáticas. Mudar um tema não afeta
            temporadas já lançadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {themes.map((t) =>
            editing === t.id ? (
              <ThemeEditor key={t.id} initial={t} banners={banners} onDone={() => setEditing(null)} />
            ) : (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className={cn("size-3 rounded-full ring-2", themeColor(t.color).ring, themeColor(t.color).bg)} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.achievements.length} conquista(s) temática(s) · títulos “{t.title_lenda}” e “{t.title_coroa}”
                    {t.banner ? ` · arte ${t.banner}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(t.id)}>
                  <Pencil /> Editar
                </Button>
              </div>
            ),
          )}
          {editing === "new" ? (
            <ThemeEditor initial={emptyTheme()} banners={banners} onDone={() => setEditing(null)} />
          ) : (
            <Button variant="outline" onClick={() => setEditing("new")}>
              <Plus /> Novo tema
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Lista base */}
      <Card>
        <CardHeader>
          <CardTitle>Conquistas base</CardTitle>
          <CardDescription>
            Entram em toda temporada. Os números abaixo são para 13 semanas; em temporadas mais curtas ou longas, os
            marcados com ≈ se ajustam. Conquistas base novas valem a partir da próxima temporada lançada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {freezeAchievements(BASE_SEASON_ACHIEVEMENTS, [], new Date(0), new Date(13 * 7 * 86_400_000)).map((a, i) => {
              const Icon = SEASON_ICONS[a.icon] ?? SEASON_ICONS.star;
              return (
                <div key={a.key} className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{a.name}</span>
                    {BASE_SEASON_ACHIEVEMENTS[i].scale && <span className="text-xs text-muted-foreground"> ≈</span>}{" "}
                    <span className="text-xs text-muted-foreground">— {a.description}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {customBase.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="text-sm font-semibold">Criadas pelo root</div>
              {freezeAchievements(
                customBase.map((b) => b.definition),
                [],
                new Date(0),
                new Date(13 * 7 * 86_400_000),
              ).map((a, i) => (
                <div key={customBase[i].id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    <span className="font-medium">{a.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">— {a.description}</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover ${a.name}`}
                    disabled={pending}
                    onClick={() =>
                      confirm(`Remover "${a.name}" das próximas temporadas?`) &&
                      run(() => deleteBaseAchievement(customBase[i].id), "Removida das próximas temporadas.")
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {newBase ? (
            <div className="space-y-2">
              <AchievementRow value={newBase} onChange={setNewBase} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const res = await addBaseAchievement(newBase);
                      if (!res.error) setNewBase(null);
                      return res;
                    }, "Conquista base criada.")
                  }
                >
                  <Plus /> Criar conquista base
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewBase(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setNewBase(emptyAchievement())}>
              <Plus /> Nova conquista base
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
