"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlayerTitle } from "@/components/player-title";
import { setDisplayTitle } from "@/lib/actions/seasons";
import type { DisplayTitle } from "@/lib/seasons";

/** O jogador escolhe qual título exibir ao lado do nome (ou nenhum). */
export function TitlePicker({ titles, current }: { titles: DisplayTitle[]; current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (key: string | null) =>
    start(async () => {
      const res = await setDisplayTitle(key);
      if (res.error) return void toast.error(res.error);
      toast.success(key ? "Título no perfil, no ranking e nas partidas." : "Título removido.");
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {titles.map((t) => (
        <div key={t.key} className="flex items-center gap-3">
          <PlayerTitle title={t} className="flex-1 text-sm" />
          {current === t.key ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => choose(null)}>
              <Check /> Exibindo
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => choose(t.key)}>
              {pending ? <Loader2 className="animate-spin" /> : null} Exibir
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
