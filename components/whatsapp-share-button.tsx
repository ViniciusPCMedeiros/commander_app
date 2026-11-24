"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Converte Markdown simples para a formatação do WhatsApp (*negrito*, _itálico_). */
export function toWhatsAppText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s*(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function WhatsAppShareButton({
  headline,
  content,
  edition,
  size = "sm",
}: {
  headline: string;
  content: string;
  edition?: number;
  size?: "sm" | "default";
}) {
  const share = () => {
    const header = `📰 *GAZETA DO MESÃO*${edition ? ` — Edição #${edition}` : ""}\n🗞️ *${headline}*\n\n`;
    const footer = "\n\n🃏 _Gerado pelo Mesão — Commander Tracker_";
    const text = header + toWhatsAppText(content) + footer;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Button type="button" size={size} onClick={share} className="bg-emerald-600 text-white hover:bg-emerald-500">
      <MessageCircle /> Compartilhar no WhatsApp
    </Button>
  );
}
