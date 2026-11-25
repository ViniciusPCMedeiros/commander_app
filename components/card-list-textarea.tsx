"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { CARD_LIST_MAX } from "@/lib/format";
import { parseDecklist } from "@/lib/scryfall";
import { cn } from "@/lib/utils";

/**
 * Caixa para colar uma lista de cartas ("1 Sol Ring" por linha): altura limitada
 * com barra de rolagem e contador de cartas. Funciona controlada (value/onChange)
 * ou solta dentro de um <form> (name/defaultValue).
 */
export function CardListTextarea({
  value,
  onChange,
  defaultValue = "",
  max = CARD_LIST_MAX,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "defaultValue"> & {
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  /** Máximo de caracteres (padrão: CARD_LIST_MAX, o limite de um deck). */
  max?: number;
}) {
  const [own, setOwn] = useState(defaultValue);
  const text = value ?? own;
  const cards = parseDecklist(text).reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="space-y-1">
      <Textarea
        {...props}
        value={text}
        maxLength={max}
        onChange={(e) => {
          setOwn(e.target.value);
          onChange?.(e.target.value);
        }}
        className={cn("max-h-72 resize-none overflow-y-auto font-mono text-xs", className)}
      />
      <div className="flex justify-end gap-3 text-xs text-muted-foreground tabular-nums">
        <span>
          {cards} {cards === 1 ? "carta" : "cartas"}
        </span>
        {text.length > max * 0.9 && (
          <span className="text-amber-400">
            {text.length}/{max} caracteres
          </span>
        )}
      </div>
    </div>
  );
}
