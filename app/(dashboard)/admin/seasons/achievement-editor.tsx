"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { RARITY_LABEL, type Rarity } from "@/lib/achievements";
import {
  KILL_REASONS,
  SEASON_ICONS,
  TEMPLATE_BY_ID,
  TEMPLATES,
  type SeasonAchievementInput,
  type SeasonIcon,
  type TemplateId,
} from "@/lib/seasons";

const COLORS = [
  ["W", "Branco"],
  ["U", "Azul"],
  ["B", "Preto"],
  ["R", "Vermelho"],
  ["G", "Verde"],
];

export const emptyAchievement = (): SeasonAchievementInput => ({
  key: "",
  name: "",
  icon: "star",
  rarity: "uncommon",
  template: "wins",
  params: { n: 1 },
});

/** Uma conquista montada a partir de um modelo de condição. */
export function AchievementRow({
  value,
  onChange,
  onRemove,
  allowFinal = false,
}: {
  value: SeasonAchievementInput;
  onChange: (v: SeasonAchievementInput) => void;
  onRemove?: () => void;
  /** Pódio/campeão (só faz sentido na lista base). */
  allowFinal?: boolean;
}) {
  const tpl = TEMPLATE_BY_ID.get(value.template)!;
  const Icon = SEASON_ICONS[value.icon] ?? SEASON_ICONS.star;
  const set = (patch: Partial<SeasonAchievementInput>) => onChange({ ...value, ...patch });
  const setParam = (k: string, v: unknown) => set({ params: { ...value.params, [k]: v } });

  return (
    <div className="space-y-2 rounded-lg border bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
          <Icon className="size-4" />
        </span>
        <Input
          value={value.name}
          maxLength={40}
          placeholder="Nome da conquista"
          onChange={(e) => set({ name: e.target.value })}
          className="flex-1"
        />
        {onRemove && (
          <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remover conquista">
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <NativeSelect
          aria-label="Condição"
          value={value.template}
          onChange={(e) => {
            const next = TEMPLATE_BY_ID.get(e.target.value as TemplateId)!;
            set({ template: next.id, params: { ...next.defaults } });
          }}
        >
          {TEMPLATES.filter((t) => allowFinal || !t.final).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Ícone" value={value.icon} onChange={(e) => set({ icon: e.target.value as SeasonIcon })}>
          {Object.keys(SEASON_ICONS).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Raridade" value={value.rarity} onChange={(e) => set({ rarity: e.target.value as Rarity })}>
          {Object.entries(RARITY_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {tpl.params.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {tpl.params.includes("n") && (
            <label className="flex items-center gap-1.5">
              Quantidade
              <Input
                type="number"
                min={1}
                max={999}
                value={value.params.n ?? ""}
                onChange={(e) => setParam("n", e.target.value ? Number(e.target.value) : undefined)}
                className="h-9 w-20"
              />
            </label>
          )}
          {tpl.params.includes("reason") && (
            <NativeSelect
              aria-label="Tipo de abate"
              value={value.params.reason ?? ""}
              onChange={(e) => setParam("reason", e.target.value || undefined)}
              className="min-w-44"
            >
              <option value="">Qualquer tipo</option>
              {KILL_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </NativeSelect>
          )}
          {tpl.params.includes("color") && (
            <NativeSelect aria-label="Cor" value={value.params.color ?? "B"} onChange={(e) => setParam("color", e.target.value)}>
              {COLORS.map(([c, label]) => (
                <option key={c} value={c}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          )}
          {tpl.params.includes("k") && (
            <NativeSelect
              aria-label="Cores do deck"
              value={String(value.params.k ?? 0)}
              onChange={(e) => setParam("k", Number(e.target.value))}
            >
              <option value="0">Qualquer nº de cores</option>
              {[1, 2, 3, 4, 5].map((k) => (
                <option key={k} value={k}>
                  {k} {k === 1 ? "cor" : "cores"}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{tpl.describe({ ...tpl.defaults, ...value.params })}</p>
    </div>
  );
}
