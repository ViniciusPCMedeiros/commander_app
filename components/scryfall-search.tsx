"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { autocompleteCards } from "@/lib/scryfall";
import { cn } from "@/lib/utils";

/** Campo com autocomplete da Scryfall (/cards/autocomplete), com debounce e navegação por teclado. */
export function ScryfallSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Buscar carta na Scryfall…",
  name,
  id,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (name: string) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const skipNext = useRef(false);
  const listId = useId();
  // Abaixo de 2 caracteres não há busca: oculta sugestões antigas
  const visible = value.trim().length >= 2 ? suggestions : [];

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await autocompleteCards(q, controller.signal);
        setSuggestions(data.slice(0, 10));
        setOpen(true);
        setHighlight(-1);
      } catch {
        // abortado ou offline
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [value]);

  const choose = (name: string) => {
    skipNext.current = true;
    onChange(name);
    onSelect?.(name);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        name={name}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        className="pl-8"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => visible.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !visible.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % visible.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h <= 0 ? visible.length - 1 : h - 1));
          } else if (e.key === "Enter" && highlight >= 0 && highlight < visible.length) {
            e.preventDefault();
            choose(visible[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && visible.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {visible.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              className={cn(
                "cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-muted",
                i === highlight && "bg-muted",
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
