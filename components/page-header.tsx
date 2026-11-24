/* eslint-disable @next/next/no-img-element */
import { resolveBanner, type BannerName } from "@/lib/banners";

/**
 * Cabeçalho das páginas. A arte da rota cobre o fundo da página inteira (fixa
 * atrás do conteúdo enquanto ele rola), escurecida para manter cards e textos
 * legíveis. Título e ações ficam no topo, à esquerda, e o crédito do artista
 * discreto à direita. Sem o arquivo do banner, o fundo é só um gradiente
 * radial dourado/obsidiana.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  banner,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Arte da rota (arquivo em public/banners); sem ela, usa o gradiente de fallback. */
  banner?: BannerName;
  /** Conteúdo extra abaixo da descrição (ex.: legenda, filtros). */
  children?: React.ReactNode;
}) {
  const art = resolveBanner(banner);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {art ? (
          <img
            src={art.src}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-60"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse at top right, rgba(212,175,55,0.12), transparent 65%)" }}
          />
        )}
        {/* Mais claro no topo (onde fica o título) e mais escuro embaixo, onde está o conteúdo */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0b0a]/25 via-[#0c0b0a]/60 via-[45%] to-[#0c0b0a]/85" />
        {/* Leitura do título à esquerda */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0b0a]/75 via-[#0c0b0a]/25 to-[#0c0b0a]/40" />
      </div>

      <header className="relative z-10 flex min-h-[200px] flex-col justify-end gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between md:min-h-[240px]">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 text-[11px] font-semibold tracking-[0.28em] text-primary uppercase">{eyebrow}</div>
          )}
          <h1 className="font-display text-engraved text-3xl leading-tight font-semibold sm:text-4xl">{title}</h1>
          {description && <div className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</div>}
          {children}
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {art?.credit && <p className="relative z-10 shrink-0 text-xs text-white/40 italic">{art.credit}</p>}
      </header>
    </>
  );
}
