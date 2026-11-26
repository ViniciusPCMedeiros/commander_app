"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Flag, Hand, Hourglass, Loader2, ScrollText, Trophy, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RARITY_STYLE } from "@/components/achievement-badge";
import { claimContract, dropContract, takeContract, withdrawClaim } from "@/lib/actions/contracts";
import {
  ADMIN_VOTES_NEEDED,
  CLAIM_NOTE_MAX,
  CONTRACT_RARITY_LABEL,
  type ClaimStatus,
  type ContractRarity,
  type ContractStatus,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

const CARD_TINT: Record<ContractRarity, string> = {
  common: "border-stone-600/70 bg-stone-800/30",
  rare: "border-amber-400/40 bg-amber-400/[0.06]",
  mythic: "border-orange-500/50 bg-orange-500/[0.07] shadow-[0_0_16px_-8px] shadow-orange-500/60",
};

export interface BoardContract {
  id: string;
  title: string;
  description: string | null;
  rarity: ContractRarity;
  reward: number;
  startsAt: string;
  endsAt: string;
  /** "até seg., 01/12 23:59" (formatado no servidor). */
  deadline: string;
  status: ContractStatus;
  winner: { userId: string; name: string; points: number } | null;
  mine: { id: string; status: ClaimStatus; votes: number; rejectReason: string | null } | null;
  /** Reivindicação em análise de outra pessoa (trava o contrato até a decisão). */
  claimedBy: { userId: string; name: string } | null;
  /** Quem pegou o contrato para tentar. */
  takers: { userId: string; name: string }[];
  /** Quem está vendo pegou o contrato. */
  taken: boolean;
}

export interface ClaimableMatch {
  id: string;
  playedAt: string;
  label: string;
}

/** Contratos da semana: o que está em aberto, quem cumpriu e a reivindicação de cada um. */
export function ContractsBoard({
  contracts,
  matches,
  canClaim,
  viewerIsRoot = false,
}: {
  contracts: BoardContract[];
  matches: ClaimableMatch[];
  canClaim: boolean;
  viewerIsRoot?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [claiming, setClaiming] = useState<BoardContract | null>(null);
  const [matchId, setMatchId] = useState("");
  const [note, setNote] = useState("");

  const open = contracts.filter((c) => c.status === "open");
  const done = contracts.filter((c) => c.status !== "open");
  const eligible = claiming
    ? matches.filter((m) => m.playedAt >= claiming.startsAt && m.playedAt < claiming.endsAt)
    : [];

  const submit = () =>
    start(async () => {
      if (!claiming) return;
      const res = await claimContract({ contractId: claiming.id, matchId, note });
      if (res.error) return void toast.error(res.error);
      toast.success("Reivindicação enviada: vale com 2 admins ou o root.");
      setClaiming(null);
      router.refresh();
    });
  const withdraw = (id: string) =>
    start(async () => {
      const res = await withdrawClaim(id);
      if (res.error) return void toast.error(res.error);
      toast.success("Reivindicação retirada.");
      router.refresh();
    });

  const act = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) return void toast.error(res.error);
      toast.success(ok);
      router.refresh();
    });

  const card = (c: BoardContract) => {
    const style = RARITY_STYLE[c.rarity];
    return (
      <div
        key={c.id}
        className={cn(
          "flex flex-col gap-2 rounded-lg border p-3",
          c.status === "open" ? CARD_TINT[c.rarity] : "opacity-80",
        )}
      >
        <div className="flex items-start gap-2">
          <ScrollText className={cn("mt-0.5 size-4 shrink-0", style.text)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold">{c.title}</span>
              <span className={cn("text-[10px] font-semibold tracking-wider uppercase", style.text)}>
                {CONTRACT_RARITY_LABEL[c.rarity]}
              </span>
            </div>
            {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
          </div>
          <span className="shrink-0 text-lg font-black text-amber-300 tabular-nums">+{c.winner?.points ?? c.reward}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {c.status === "open" && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {c.deadline}
            </span>
          )}
        </div>

        {c.takers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Users className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{c.status === "open" ? "Tentando:" : "Tentaram:"}</span>
            {c.takers.map((t, i) => (
              <span key={t.userId}>
                <Link href={`/players/${t.userId}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                {i < c.takers.length - 1 && ","}
              </span>
            ))}
          </div>
        )}

        {c.status === "open" && c.claimedBy && (
          <div className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs">
            <Hourglass className="size-3.5 text-amber-300" />
            <span>
              <Link href={`/players/${c.claimedBy.userId}`} className="font-semibold hover:underline">
                {c.claimedBy.name}
              </Link>{" "}
              reivindicou: em análise. Se for recusado, o contrato volta a ficar livre.
            </span>
          </div>
        )}

        {c.winner ? (
          <div className="flex items-center gap-1.5 text-sm">
            <Trophy className="size-4 text-amber-300" /> Cumprido por{" "}
            <Link href={`/players/${c.winner.userId}`} className="font-semibold hover:underline">
              {c.winner.name}
            </Link>
          </div>
        ) : c.status === "expired" ? (
          <div className="text-sm text-muted-foreground">Expirou sem dono.</div>
        ) : null}

        {c.mine && c.mine.status === "pending" && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs">
            <Hourglass className="size-3.5 text-amber-300" />
            <span className="flex-1">
              Sua reivindicação está em análise ({c.mine.votes}/{ADMIN_VOTES_NEEDED} admins ou o root).
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={pending} onClick={() => withdraw(c.mine!.id)}>
              <X /> Retirar
            </Button>
          </div>
        )}
        {c.mine?.status === "rejected" && (
          <p className="text-xs text-rose-300">Sua reivindicação foi recusada: {c.mine.rejectReason}</p>
        )}
        {c.mine?.status === "approved" && (
          <p className="flex items-center gap-1 text-xs text-emerald-300">
            <Check className="size-3.5" /> Aprovada: os pontos já estão na temporada.
          </p>
        )}

        {canClaim && c.status === "open" && !c.taken && (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={pending}
            onClick={() => act(() => takeContract(c.id), `Você pegou “${c.title}”. Cumpriu? Reivindique aqui.`)}
          >
            <Hand /> Pegar contrato
          </Button>
        )}
        {canClaim && c.status === "open" && c.taken && (!c.mine || c.mine.status === "rejected") && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!!c.claimedBy}
              title={c.claimedBy ? "Outra pessoa reivindicou primeiro" : undefined}
              onClick={() => {
                setClaiming(c);
                setMatchId("");
                setNote("");
              }}
            >
              <Flag /> Reivindicar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={pending}
              onClick={() => act(() => dropContract(c.id), "Contrato largado.")}
            >
              Largar
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {viewerIsRoot && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Você está como root: o root não pega nem reivindica contratos (é invisível para o grupo), só aprova em Admin →
          Contratos. Para testar, entre com a conta de um jogador.
        </p>
      )}
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum contrato em aberto agora. Os novos saem na segunda.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{open.map(card)}</div>
      )}
      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
            Cumpridos e expirados ({done.length}) <span className="group-open:hidden">· ver</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{done.map(card)}</div>
        </details>
      )}

      <Dialog open={!!claiming} onOpenChange={(v) => !v && setClaiming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reivindicar “{claiming?.title}”</DialogTitle>
            <DialogDescription>
              {claiming?.description} Vale com o “aprovo” de {ADMIN_VOTES_NEEDED} admins ou do root; o primeiro aprovado
              leva +{claiming?.reward}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Partida</Label>
              {eligible.length ? (
                <Select value={matchId} onValueChange={setMatchId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Em qual partida?" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma partida sua enquanto o contrato está aberto. Registre a partida primeiro (pode estar pendente).
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Como foi (opcional)</Label>
              <Textarea
                value={note}
                maxLength={CLAIM_NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: Atraxa bateu 112 no turno 9."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClaiming(null)}>
              Cancelar
            </Button>
            <Button disabled={pending || !matchId} onClick={submit}>
              {pending && <Loader2 className="animate-spin" />} Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
