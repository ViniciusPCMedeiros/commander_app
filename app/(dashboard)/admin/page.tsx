import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { creatableRoles, isModerator, isRoot } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";
import type { PlayerStats, UserProfile } from "@/lib/types";
import { CreateUserForm } from "./create-user-form";
import { RoleSelect } from "./role-select";
import { PageHeader } from "@/components/page-header";

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

  // O root é invisível: só aparece para outro root
  const members = (users ?? []).filter((u) => u.role !== "root" || isRoot(profile.role));
  const statsById = new Map((stats ?? []).map((s) => [s.user_id, s]));
  const lastLogin = new Map((authUsers?.users ?? []).map((u) => [u.id, u.last_sign_in_at]));

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
          <Button asChild variant="outline">
            <Link href="/matches?tab=queue">
              <Hourglass /> Fila de moderação ({pending ?? 0})
            </Link>
          </Button>
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
    </div>
  );
}
