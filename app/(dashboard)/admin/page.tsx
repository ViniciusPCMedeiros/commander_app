import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, CalendarRange, EyeOff, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDay } from "@/lib/format";
import { creatableRoles, isModerator, isRoot } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";
import type { PlayerStats, UserProfile } from "@/lib/types";
import { loadAIIssues } from "@/lib/ai-issues";
import { AIRetryButton } from "./ai-retry-button";
import { CreateUserForm } from "./create-user-form";
import { RoleSelect } from "./role-select";
import { PageHeader } from "@/components/page-header";
import { LevelBadge } from "@/components/level-badge";
import { ELO_CALIBRATION_GAMES, ELO_K, ELO_K_CALIBRATION, ELO_START } from "@/lib/level";
import { loadLevels } from "@/lib/level-data";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const { profile } = await requireUser();
  if (!isModerator(profile.role)) redirect("/");

  // Service role: visão completa, incluindo último login vindo do Auth
  const admin = createAdminClient();
  const [{ data: users }, { data: stats }, { data: authUsers }, { count: pending }] = await Promise.all([
    admin.from("users").select("*").order("created_at").returns<UserProfile[]>(),
    admin.from("player_stats").select("user_id, total_games, total_wins").returns<PlayerStats[]>(),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("matches").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const [aiIssues, levels] = isRoot(profile.role)
    ? await Promise.all([loadAIIssues(admin), loadLevels(admin)])
    : [null, null];

  // O root é invisível: só aparece para outro root
  const members = (users ?? []).filter((u) => u.role !== "root" || isRoot(profile.role));
  const statsById = new Map((stats ?? []).map((s) => [s.user_id, s]));
  const lastLogin = new Map((authUsers?.users ?? []).map((u) => [u.id, u.last_sign_in_at]));
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  // Habilidade (Elo): só o root vê; vai servir para montar as mesas da Liga
  const skill = levels
    ? [...levels.elo]
        .map(([id, e]) => ({ id, name: nameById.get(id) ?? "?", ...e, tier: levels.levels.get(id)?.tier }))
        .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        banner="admin"
        eyebrow="Conselho"
        title="Administração"
        description={
          isRoot(profile.role)
            ? "Root: gestão completa de membros e papéis."
            : "Admin: cria membros e promove membros a admin. Demais mudanças de papel são feitas pelo root."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isRoot(profile.role) && (
              <Button asChild>
                <Link href="/admin/seasons">
                  <CalendarRange /> Temporadas
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/matches?tab=queue">
                <Hourglass /> Fila de moderação ({pending ?? 0})
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Novo membro</CardTitle>
            <CardDescription>A conta é criada já confirmada; compartilhe a senha inicial com a pessoa.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateUserForm roles={creatableRoles(profile.role)} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Membros ({members.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Último acesso</TableHead>
                  <TableHead className="text-right">V/J</TableHead>
                  <TableHead>Papel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((u) => {
                  const st = statsById.get(u.id);
                  const last = lastLogin.get(u.id);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link href={`/players/${u.id}`} className="font-medium hover:underline">
                          {u.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        {last ? formatDate(last) : "nunca"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {st?.total_wins ?? 0}/{st?.total_games ?? 0}
                      </TableCell>
                      <TableCell>
                        <RoleSelect userId={u.id} role={u.role} actorRole={profile.role} isSelf={u.id === profile.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {skill && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <EyeOff className="size-5" /> Habilidade (Elo)
            </CardTitle>
            <CardDescription>
              Só o root vê. Começa em {ELO_START}; em cada partida, cada par da mesa é um duelo (quem venceu ganha de
              quem perdeu; entre quem perdeu, ganha quem fez mais abates). K = {ELO_K_CALIBRATION} nas primeiras{" "}
              {ELO_CALIBRATION_GAMES} partidas (calibração) e {ELO_K} depois. Vai servir para montar mesas justas na
              Liga.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Elo</TableHead>
                  <TableHead className="text-right">Partidas</TableHead>
                  <TableHead className="hidden sm:table-cell">Nível</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skill.map((p, i) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <Link href={`/players/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.calibrating && <span className="ml-2 text-xs text-muted-foreground">em calibração</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{p.rating}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.games}</TableCell>
                    <TableCell className="hidden sm:table-cell">{p.tier && <LevelBadge index={p.tier.index} division={p.tier.division} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {aiIssues && (
        <Card id="ia" className={aiIssues.total ? "border-amber-500/40" : undefined}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-5" /> IA da rotina semanal
            </CardTitle>
            <CardDescription>
              A Gazeta e as análises dos jogadores saem sozinhas toda segunda à 00h. Se a IA não responder (fora do ar
              ou cota do dia esgotada), elas saem no modo local e aparecem aqui para você refazer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!aiIssues.configured && (
              <p className="text-sm text-amber-300">IA não configurada: defina AI_API_KEY no .env.local do servidor.</p>
            )}
            {aiIssues.configured && aiIssues.total === 0 && (
              <p className="text-sm text-muted-foreground">Tudo em dia: a última rotina saiu pela IA.</p>
            )}
            {aiIssues.newspapers.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="flex-1">
                  Gazeta #{n.edition} ({formatDay(n.weekStart)} a {formatDay(n.weekEnd)}) saiu no modo local
                </span>
                <AIRetryButton endpoint="/api/ai/newspaper" body={{ id: n.id }} label={`Gazeta #${n.edition}`} />
              </div>
            ))}
            {aiIssues.insights.map((i) => (
              <div key={i.userId} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="flex-1">
                  Análise de{" "}
                  <Link href={`/players/${i.userId}`} className="font-medium hover:underline">
                    {i.name}
                  </Link>{" "}
                  saiu no modo local em {formatDate(i.createdAt)}
                </span>
                <AIRetryButton
                  endpoint="/api/ai/player-insight"
                  body={{ userId: i.userId }}
                  label={`Análise de ${i.name}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
