"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { deleteTheme, saveTheme, type ThemeInput } from "@/lib/actions/seasons";
import { THEME_COLORS } from "@/lib/seasons";
import { AchievementRow, emptyAchievement } from "./achievement-editor";

export const emptyTheme = (): ThemeInput => ({
  name: "",
  description: "",
  color: "amber",
  banner: "",
  banner_credit: "",
  title_lenda: "",
  title_coroa: "",
  achievements: [emptyAchievement()],
});

/** Cria ou edita um tema (nome, arte, títulos e conquistas temáticas). */
export function ThemeEditor({
  initial,
  banners,
  onDone,
}: {
  initial: ThemeInput;
  banners: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState(initial);
  const [pending, start] = useTransition();
  const set = (patch: Partial<ThemeInput>) => setTheme((t) => ({ ...t, ...patch }));

  const save = () =>
    start(async () => {
      const res = await saveTheme(theme);
      if (res.error) return void toast.error(res.error);
      toast.success(initial.id ? "Tema atualizado." : "Tema criado.");
      onDone();
      router.refresh();
    });

  const remove = () => {
    if (!initial.id || !confirm(`Excluir o tema "${initial.name}"? Temporadas já lançadas com ele não mudam.`)) return;
    start(async () => {
      const res = await deleteTheme(initial.id!);
      if (res.error) return void toast.error(res.error);
      toast.success("Tema excluído.");
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-card/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="theme-name">Nome do tema</Label>
          <Input
            id="theme-name"
            value={theme.name}
            maxLength={60}
            placeholder="Festas, Nauctis…"
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-color">Cor</Label>
          <NativeSelect id="theme-color" value={theme.color} onChange={(e) => set({ color: e.target.value })}>
            {Object.entries(THEME_COLORS).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="theme-desc">Descrição (aparece na página da temporada)</Label>
          <Textarea
            id="theme-desc"
            value={theme.description}
            maxLength={500}
            rows={2}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-lenda">Título da Lenda (completar tudo)</Label>
          <Input
            id="theme-lenda"
            value={theme.title_lenda}
            maxLength={40}
            placeholder="Espírito das Festas"
            onChange={(e) => set({ title_lenda: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-coroa">Título da Coroa (1º lugar)</Label>
          <Input
            id="theme-coroa"
            value={theme.title_coroa}
            maxLength={40}
            placeholder="Coroa das Festas"
            onChange={(e) => set({ title_coroa: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-banner">Arte de fundo (arquivo em public/banners)</Label>
          <NativeSelect id="theme-banner" value={theme.banner} onChange={(e) => set({ banner: e.target.value })}>
            <option value="">Sem arte (gradiente)</option>
            {banners.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-credit">Crédito da arte</Label>
          <Input
            id="theme-credit"
            value={theme.banner_credit}
            placeholder="Carta — Artista"
            onChange={(e) => set({ banner_credit: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Os títulos levam o número da temporada (ex.: “{theme.title_lenda || "Espírito das Festas"} · T1”). Use nomes que
        sirvam para qualquer pessoa.
      </p>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Conquistas temáticas ({theme.achievements.length}/12)</div>
        {theme.achievements.map((a, i) => (
          <AchievementRow
            key={i}
            value={a}
            onChange={(v) => set({ achievements: theme.achievements.map((x, j) => (j === i ? v : x)) })}
            onRemove={() => set({ achievements: theme.achievements.filter((_, j) => j !== i) })}
          />
        ))}
        {theme.achievements.length < 12 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => set({ achievements: [...theme.achievements, emptyAchievement()] })}
          >
            <Plus /> Conquista temática
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar tema
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        {initial.id && (
          <Button type="button" variant="ghost" className="ml-auto text-rose-300" onClick={remove} disabled={pending}>
            <Trash2 /> Excluir tema
          </Button>
        )}
      </div>
    </div>
  );
}
