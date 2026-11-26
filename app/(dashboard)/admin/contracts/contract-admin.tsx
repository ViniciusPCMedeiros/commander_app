"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Inbox, Pencil, Plus, ScrollText, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RARITY_STYLE } from "@/components/achievement-badge";
import {
  addContractNow,
  approveClaim,
  deleteContractTemplate,
  rejectClaim,
  removeContract,
  saveContractTemplate,
  type ContractTemplateInput,
} from "@/lib/actions/contracts";
import {
  ADMIN_VOTES_NEEDED,
  CONTRACT_DESCRIPTION_MAX,
  CONTRACT_RARITIES,
  CONTRACT_RARITY_LABEL,
  CONTRACT_REWARD,
  CONTRACT_TITLE_MAX,
  REJECT_REASON_MAX,
  type ClaimStatus,
  type ContractRarity,
  type ContractStatus,
  type ContractTemplate,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface QueueClaim {
  id: string;
  title: string;
  description: string | null;
  rarity: ContractRarity;
  points: number;
  claimant: { id: string; name: string };
  /** Reivindicação de quem está vendo (não pode votar). */
  mine: boolean;
  matchId: string;
  matchLabel: string;
  matchApproved: boolean;
  note: string | null;
  voters: string[];
  votedByMe: boolean;
  status: ClaimStatus;
  rejectReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

interface InPlay {
  id: string;
  title: string;
  rarity: ContractRarity;
  reward: number;
  deadline: string;
  status: ContractStatus;
  winner: string | null;
}

const STATUS_LABEL: Record<ContractStatus, string> = { open: "Em aberto", claimed: "Cumprido", expired: "Expirado" };

const emptyTemplate = (): ContractTemplateInput => ({ title: "", description: "", rarity: "common", active: true });

export function ContractAdmin({
  root,
  queue,
  recent,
  templates,
  season,
  inPlay,
}: {
  root: boolean;
  queue: QueueClaim[];
  recent: QueueClaim[];
  templates: ContractTemplate[];
  season: { label: string } | null;
  inPlay: InPlay[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<ContractTemplateInput | null>(null);

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) return void toast.error(res.error);
      toast.success(ok);
      after?.();
      router.refresh();
    });

  const approve = (id: string) =>
    start(async () => {
      const res = await approveClaim(id);
      if (res.error) return void toast.error(res.error);
      toast.success(
        res.approved
          ? "Contrato aprovado: os pontos entraram na temporada."
          : `Voto registrado (${res.votes}/${ADMIN_VOTES_NEEDED}). Falta outro admin.`,
      );
      router.refresh();
    });

  const claimCard = (c: QueueClaim, decided = false) => (
    <div key={c.id} className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ScrollText className={cn("size-4", RARITY_STYLE[c.rarity].text)} />
        <span className="font-semibold">{c.title}</span>
        <span className="font-black text-amber-300 tabular-nums">+{c.points}</span>
        <span className="text-sm text-muted-foreground">
          por{" "}
          <Link href={`/players/${c.claimant.id}`} className="font-medium text-foreground hover:underline">
            {c.claimant.name}
          </Link>{" "}
          ·{" "}
          <Link href={`/matches/${c.matchId}`} className="hover:underline">
            partida de {c.matchLabel}
          </Link>
          {!c.matchApproved && <span className="text-amber-300"> (partida pendente)</span>}
        </span>
        {decided && (
          <Badge variant="outline" className={c.status === "approved" ? "text-emerald-300" : "text-rose-300"}>
            {c.status === "approved" ? "Aprovado" : "Recusado"}
          </Badge>
        )}
      </div>
      {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
      {c.note && <p className="rounded-md bg-muted/40 px-2 py-1 text-sm italic">“{c.note}”</p>}
      {decided ? (
        <p className="text-xs text-muted-foreground">
          {c.status === "approved" ? "Aprovado" : `Recusado: ${c.rejectReason}`}
          {c.decidedBy && ` · ${c.decidedBy}`}
          {c.decidedAt && ` · ${c.decidedAt}`}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Votos: {c.voters.length ? c.voters.join(", ") : "nenhum"} ({c.voters.length}/{ADMIN_VOTES_NEEDED} admins ou o
            root)
          </p>
          {c.mine ? (
            <p className="text-xs text-muted-foreground">É a sua reivindicação: outros admins decidem.</p>
          ) : rejecting === c.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                autoFocus
                value={reason}
                maxLength={REJECT_REASON_MAX}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo da recusa"
                className="h-8 max-w-sm flex-1"
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={pending || !reason.trim()}
                onClick={() => run(() => rejectClaim(c.id, reason), "Reivindicação recusada.", () => setRejecting(null))}
              >
                Recusar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending || c.votedByMe || !c.matchApproved}
                title={!c.matchApproved ? "Aprove a partida antes" : undefined}
                onClick={() => approve(c.id)}
              >
                <Check /> {c.votedByMe ? "Você já aprovou" : root ? "Aprovar" : "Aprovo"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-rose-300"
                disabled={pending}
                onClick={() => {
                  setRejecting(c.id);
                  setReason("");
                }}
              >
                <X /> Recusar
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="size-5" /> Reivindicações em análise ({queue.length})
          </CardTitle>
          <CardDescription>
            Confira com a mesa se aconteceu mesmo. Valem com {ADMIN_VOTES_NEEDED} admins diferentes ou com o root; o
            contrato fica travado para os outros enquanto a reivindicação está em análise; se recusar, ele volta a ficar livre.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {queue.length === 0 && <p className="text-sm text-muted-foreground">Nada esperando aprovação.</p>}
          {queue.map((c) => claimCard(c))}
          {recent.length > 0 && (
            <details className="group pt-2">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                Decididas recentemente ({recent.length}) <span className="group-open:hidden">· ver</span>
              </summary>
              <div className="mt-3 space-y-3">{recent.map((c) => claimCard(c, true))}</div>
            </details>
          )}
        </CardContent>
      </Card>

      {root && (
        <Card>
          <CardHeader>
            <CardTitle>Em jogo {season ? `· ${season.label}` : ""}</CardTitle>
            <CardDescription>
              {season
                ? "Contratos da temporada em andamento. A rotina sorteia novos toda segunda; dá para colocar um do catálogo agora ou tirar um que ninguém levou."
                : "Sem temporada em andamento: os contratos só rodam durante uma temporada."}
            </CardDescription>
          </CardHeader>
          {season && (
            <CardContent className="space-y-2">
              {inPlay.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contrato ainda.</p>}
              {inPlay.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className={cn("font-semibold", RARITY_STYLE[c.rarity].text)}>{c.title}</span>
                  <span className="font-bold text-amber-300 tabular-nums">+{c.reward}</span>
                  <Badge variant="outline">{STATUS_LABEL[c.status]}</Badge>
                  <span className="flex-1 text-xs text-muted-foreground">
                    {c.winner ? `cumprido por ${c.winner}` : `${c.status === "expired" ? "expirou em" : "até"} ${c.deadline}`}
                  </span>
                  {!c.winner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-rose-300"
                      disabled={pending}
                      onClick={() =>
                        confirm(`Tirar “${c.title}” de jogo?`) && run(() => removeContract(c.id), "Contrato retirado.")
                      }
                    >
                      <Trash2 /> Tirar
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {root && (
        <Card>
          <CardHeader>
            <CardTitle>Catálogo</CardTitle>
            <CardDescription>
              Desafios que o app não vê sozinho. Prêmio pela raridade: comum +{CONTRACT_REWARD.common}, raro +
              {CONTRACT_REWARD.rare}, mítico +{CONTRACT_REWARD.mythic}. Só os ativos entram no
              sorteio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing && !editing.id && <TemplateForm value={editing} onChange={setEditing} pending={pending} run={run} />}
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(emptyTemplate())}>
                <Plus /> Novo contrato
              </Button>
            )}
            {CONTRACT_RARITIES.map((rarity) => {
              const list = templates.filter((t) => t.rarity === rarity);
              if (!list.length) return null;
              return (
                <div key={rarity} className="space-y-2">
                  <div className={cn("text-xs font-semibold tracking-wider uppercase", RARITY_STYLE[rarity].text)}>
                    {CONTRACT_RARITY_LABEL[rarity]} · +{CONTRACT_REWARD[rarity]}
                  </div>
                  {list.map((t) =>
                    editing?.id === t.id ? (
                      <TemplateForm key={t.id} value={editing} onChange={setEditing} pending={pending} run={run} />
                    ) : (
                      <div
                        key={t.id}
                        className={cn(
                          "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
                          !t.active && "opacity-50",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {t.title} {!t.active && <span className="text-xs text-muted-foreground">(inativo)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </div>
                        {season && t.active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            disabled={pending}
                            onClick={() => run(() => addContractNow(t.id), `“${t.title}” em jogo nesta semana.`)}
                          >
                            <Plus /> Pôr em jogo
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() =>
                            setEditing({
                              id: t.id,
                              title: t.title,
                              description: t.description ?? "",
                              rarity: t.rarity,
                              active: t.active,
                            })
                          }
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-rose-300"
                          disabled={pending}
                          onClick={() =>
                            confirm(`Excluir “${t.title}” do catálogo? Os contratos já sorteados continuam.`) &&
                            run(() => deleteContractTemplate(t.id), "Excluído do catálogo.")
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ),
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Formulário do catálogo (fora do componente: senão o campo perde o foco a cada tecla). */
function TemplateForm({
  value,
  onChange,
  pending,
  run,
}: {
  value: ContractTemplateInput;
  onChange: (v: ContractTemplateInput | null) => void;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1">
          <Label>Nome</Label>
          <Input
            value={value.title}
            maxLength={CONTRACT_TITLE_MAX}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder="Centenário"
          />
        </div>
        <div className="space-y-1">
          <Label>Raridade</Label>
          <Select value={value.rarity} onValueChange={(r) => onChange({ ...value, rarity: r as ContractRarity })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_RARITIES.map((r) => (
                <SelectItem key={r} value={r}>
                  {CONTRACT_RARITY_LABEL[r]} (+{CONTRACT_REWARD[r]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>O que precisa ser feito</Label>
        <Textarea
          value={value.description}
          maxLength={CONTRACT_DESCRIPTION_MAX}
          rows={2}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="Causar 100 ou mais de dano somado numa partida."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={value.active} onCheckedChange={(v) => onChange({ ...value, active: v })} /> Entra no sorteio
        </label>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => saveContractTemplate(value), "Catálogo atualizado.", () => onChange(null))}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
