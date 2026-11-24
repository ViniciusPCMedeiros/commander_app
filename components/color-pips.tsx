/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde", C: "Incolor" };

/** Identidade de cor com os símbolos de mana oficiais (SVGs da Scryfall em /public/mana). */
export function ColorPips({ colors, className }: { colors: string[] | null | undefined; className?: string }) {
  const list = colors?.length ? colors : ["C"];
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {list.map((c) => (
        <img
          key={c}
          src={`/mana/${LABEL[c] ? c : "C"}.svg`}
          alt={LABEL[c] ?? c}
          title={LABEL[c] ?? c}
          className="size-[1.15em] min-h-4 min-w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
        />
      ))}
    </span>
  );
}
