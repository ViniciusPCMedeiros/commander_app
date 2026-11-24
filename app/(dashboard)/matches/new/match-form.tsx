"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Repeat, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorPips } from "@/components/color-pips";
import { NativeSelect } from "@/components/native-select";
import { createMatch } from "@/lib/actions/matches";
import { ELIMINATION_GROUPS, ELIMINATION_REASONS, eliminationKind } from "@/lib/elimination";
import { commanderLabel, WIN_CONDITIONS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Deck } from "@/lib/types";

type Seat = { key: number; pilot_id: string; deck_id: string; elimination_reason: string; eliminated_by: string };

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function MatchForm({
  players,
  decks,
  permissions,
  currentUserId,
  isAdmin,
}: {
  players: { id: string; name: string }[];
  decks: Deck[];
  /** Quem tem permissão de usar cada deck (além do dono). */
  permissions: { deck_id: string; user_id: string }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(5);
  const allowed = useMemo(() => new Set(permissions.map((p) => `${p.deck_id}:${p.user_id}`)), [permissions]);
  const isAllowed = (deckId: string, pilotId: string) => allowed.has(`${deckId}:${pilotId}`);

  /** Sugere um deck do próprio jogador; se não tiver, um deck liberado para ele. */
  const suggestDeck = (pilotId: string, used: Set<string>) =>
    decks.find((d) => d.owner_id === pilotId && !used.has(d.id)) ??
    decks.find((d) => isAllowed(d.id, pilotId) && !used.has(d.id));

  const [seats, setSeats] = useState<Seat[]>(() =>
    [1, 2, 3, 4].map((key, i) => {
      const pilot = i === 0 ? currentUserId : "";
      const deck = pilot ? suggestDeck(pilot, new Set())?.id ?? "" : "";
      return { key, pilot_id: pilot, deck_id: deck, elimination_reason: "", eliminated_by: "" };
    }),
  );
  const [winnerKey, setWinnerKey] = useState<number | null>(null);
  const [playedAt, setPlayedAt] = useState(nowLocalInput);
  const [winCondition, setWinCondition] = useState("");
  const [notes, setNotes] = useState("");

  const playerName = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const deckById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);

  const update = (key: number, patch: Partial<Seat>) =>
    setSeats((s) => s.map((seat) => (seat.key === key ? { ...seat, ...patch } : seat)));

  const move = (index: number, dir: -1 | 1) =>
    setSeats((s) => {
      const next = [...s];
      const j = index + dir;
      if (j < 0 || j >= next.length) return s;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const onPilotChange = (seat: Seat, pilotId: string) => {
    const usedDecks = new Set(seats.filter((s) => s.key !== seat.key).map((s) => s.deck_id));
    update(seat.key, { pilot_id: pilotId, deck_id: suggestDeck(pilotId, usedDecks)?.id ?? seat.deck_id });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = seats.findIndex(
      (s) => s.key !== winnerKey && eliminationKind(s.elimination_reason) === "opponent" && !s.eliminated_by,
    );
    if (missing >= 0) {
      toast.error(`Informe quem eliminou o jogador do assento ${missing + 1}.`);
      return;
    }
    startTransition(async () => {
      const res = await createMatch({
        played_at: new Date(playedAt).toISOString(),
        win_condition: winCondition,
        notes,
        participants: seats.map((s, i) => ({
          pilot_id: s.pilot_id,
          deck_id: s.deck_id,
          seat_order: i + 1,
          is_winner: s.key === winnerKey,
          elimination_reason: s.elimination_reason,
          eliminated_by: s.eliminated_by,
        })),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.status === "approved" ? "Partida registrada e aprovada!" : "Partida enviada para moderação.");
      router.push(res.status === "approved" ? "/matches" : "/matches?tab=queue");
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="played_at">Data e hora</Label>
          <Input id="played_at" type="datetime-local" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="win_condition">Condição de vitória</Label>
          <NativeSelect id="win_condition" value={winCondition} onChange={(e) => setWinCondition(e.target.value)}>
            <option value="">Selecione…</option>
            {WIN_CONDITIONS.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Assentos (ordem de turno)</Label>
          <span className="text-xs text-muted-foreground">Toque no 🏆 para marcar o vencedor</span>
        </div>

        {seats.map((seat, i) => {
          const deck = deckById.get(seat.deck_id);
          const borrowed = deck && seat.pilot_id && deck.owner_id !== seat.pilot_id;
          const isWinner = seat.key === winnerKey;
          const usedPilots = new Set(seats.filter((s) => s.key !== seat.key).map((s) => s.pilot_id));
          const usedDecks = new Set(seats.filter((s) => s.key !== seat.key).map((s) => s.deck_id));
          const ownDecks = decks.filter((d) => d.owner_id === seat.pilot_id);
          const allowedDecks = decks.filter((d) => seat.pilot_id && isAllowed(d.id, seat.pilot_id));
          const otherDecks = decks.filter((d) => d.owner_id !== seat.pilot_id && !allowedDecks.includes(d));

          return (
            <Card key={seat.key} className={cn("gap-0 py-3 transition-colors", isWinner && "border-amber-500/60 bg-amber-500/5")}>
              <CardContent className="space-y-3 px-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {i + 1}
                  </span>
                  <NativeSelect
                    className="flex-1"
                    aria-label={`Jogador do assento ${i + 1}`}
                    value={seat.pilot_id}
                    onChange={(e) => onPilotChange(seat, e.target.value)}
                    required
                  >
                    <option value="">Jogador…</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id} disabled={usedPilots.has(p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    size="icon"
                    variant={isWinner ? "default" : "outline"}
                    className={cn("shrink-0", isWinner && "bg-amber-500 text-amber-950 hover:bg-amber-400")}
                    aria-label="Marcar como vencedor"
                    aria-pressed={isWinner}
                    onClick={() => setWinnerKey(isWinner ? null : seat.key)}
                  >
                    <Trophy />
                  </Button>
                </div>

                <NativeSelect
                  aria-label={`Deck do assento ${i + 1}`}
                  value={seat.deck_id}
                  onChange={(e) => update(seat.key, { deck_id: e.target.value })}
                  required
                >
                  <option value="">Deck…</option>
                  {ownDecks.length > 0 && (
                    <optgroup label="Decks do jogador">
                      {ownDecks.map((d) => (
                        <option key={d.id} value={d.id} disabled={usedDecks.has(d.id)}>
                          {d.name} — {commanderLabel(d.commander_name, d.partner_name)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {allowedDecks.length > 0 && (
                    <optgroup label="Liberados para o jogador">
                      {allowedDecks.map((d) => (
                        <option key={d.id} value={d.id} disabled={usedDecks.has(d.id)}>
                          {d.name} ({playerName.get(d.owner_id)}) — {commanderLabel(d.commander_name, d.partner_name)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Decks de outros membros">
                    {otherDecks.map((d) => (
                      <option key={d.id} value={d.id} disabled={usedDecks.has(d.id)}>
                        {d.name} ({playerName.get(d.owner_id)}) — {commanderLabel(d.commander_name, d.partner_name)}
                      </option>
                    ))}
                  </optgroup>
                </NativeSelect>

                <div className="flex flex-wrap items-center gap-2">
                  {deck && <ColorPips colors={deck.color_identity} />}
                  {borrowed && (
                    <Badge variant="outline" className="gap-1">
                      <Repeat className="size-3" /> Empréstimo de {playerName.get(deck.owner_id)}
                    </Badge>
                  )}
                  <div className="ml-auto flex gap-1">
                    <Button type="button" size="icon" variant="ghost" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                      <ArrowUp />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="size-8" disabled={i === seats.length - 1} onClick={() => move(i, 1)} aria-label="Descer">
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-red-400"
                      disabled={seats.length <= 2}
                      onClick={() => {
                        setSeats((s) => s.filter((x) => x.key !== seat.key));
                        if (isWinner) setWinnerKey(null);
                      }}
                      aria-label="Remover assento"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {!isWinner && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <NativeSelect
                      aria-label="Como foi eliminado"
                      value={seat.elimination_reason}
                      className={eliminationKind(seat.elimination_reason) === "opponent" ? "" : "sm:col-span-2"}
                      onChange={(e) => {
                        const reason = e.target.value;
                        const needsKiller = eliminationKind(reason) === "opponent";
                        // Sugere o vencedor como responsável (dá para trocar)
                        const winnerPilot = seats.find((s) => s.key === winnerKey)?.pilot_id ?? "";
                        update(seat.key, {
                          elimination_reason: reason,
                          eliminated_by: needsKiller
                            ? seat.eliminated_by || (winnerPilot !== seat.pilot_id ? winnerPilot : "")
                            : "",
                        });
                      }}
                    >
                      <option value="">Como foi eliminado? (opcional)</option>
                      {ELIMINATION_GROUPS.map((g) => (
                        <optgroup key={g.kind} label={g.label}>
                          {ELIMINATION_REASONS.filter((r) => r.kind === g.kind).map((r) => (
                            <option key={r.value}>{r.value}</option>
                          ))}
                        </optgroup>
                      ))}
                    </NativeSelect>
                    {eliminationKind(seat.elimination_reason) === "opponent" && (
                      <NativeSelect
                        aria-label="Eliminado por"
                        value={seat.eliminated_by}
                        onChange={(e) => update(seat.key, { eliminated_by: e.target.value })}
                        required
                      >
                        <option value="">Eliminado por…</option>
                        {seats
                          .filter((s) => s.key !== seat.key && s.pilot_id)
                          .map((s) => (
                            <option key={s.key} value={s.pilot_id}>
                              {playerName.get(s.pilot_id)}
                              {s.key === winnerKey ? " (vencedor)" : ""}
                            </option>
                          ))}
                      </NativeSelect>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {seats.length < 8 && (
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={() => {
              setSeats((s) => [...s, { key: nextKey, pilot_id: "", deck_id: "", elimination_reason: "", eliminated_by: "" }]);
              setNextKey((k) => k + 1);
            }}
          >
            <Plus /> Adicionar jogador
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas / momentos marcantes</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: Thoracle na resposta do Rhystic Study…" />
      </div>

      <div className="sticky bottom-16 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        <Button type="submit" size="lg" className="w-full" disabled={pending || winnerKey === null}>
          {pending && <Loader2 className="animate-spin" />}
          {winnerKey === null ? "Marque o vencedor" : isAdmin ? "Registrar (já aprovada)" : "Enviar para moderação"}
        </Button>
      </div>
    </form>
  );
}
