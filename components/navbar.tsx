"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  Crown,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  Medal,
  MoreHorizontal,
  Newspaper,
  Shield,
  Sparkles,
  Swords,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_VERSION, readSeenVersion, subscribeSeenVersion } from "@/lib/changelog";
import { initials } from "@/lib/format";
import { isModerator, ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

const LINKS = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/matches", label: "Partidas", icon: Swords },
  { href: "/ranking", label: "Ranking", icon: Medal },
  { href: "/decks", label: "Decks", icon: Crown },
  { href: "/newspapers", label: "Jornais", icon: Newspaper },
  { href: "/collection", label: "Coleção", icon: Layers },
  { href: "/history", label: "Histórico", icon: History },
];

/** No celular, os 5 primeiros ficam na barra inferior e o resto vai para "Mais". */
const MOBILE_PRIMARY = 5;

/** Emblema dourado (losango facetado, lembrando a joia de uma carta). */
function Emblem() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-8 drop-shadow-[0_0_8px_oklch(0.8_0.115_78/0.35)]"
      aria-hidden
    >
      <defs>
        <linearGradient id="emblem-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e3a1" />
          <stop offset="0.5" stopColor="#d2a24c" />
          <stop offset="1" stopColor="#8a5a1c" />
        </linearGradient>
      </defs>
      <path
        d="M16 1.5 30.5 16 16 30.5 1.5 16Z"
        fill="#1b140d"
        stroke="url(#emblem-gold)"
        strokeWidth="1.6"
      />
      <path
        d="M16 7 25 16 16 25 7 16Z"
        fill="url(#emblem-gold)"
        opacity="0.9"
      />
      <path
        d="M16 7v18M7 16h18"
        stroke="#1b140d"
        strokeWidth="0.8"
        opacity="0.6"
      />
    </svg>
  );
}

export function Navbar({
  profile,
  logoutAction,
}: {
  profile: UserProfile;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  // Pontinho de "versão nova" até a pessoa abrir as novidades (no servidor, nada aparece)
  const seenVersion = useSyncExternalStore(subscribeSeenVersion, readSeenVersion, () => APP_VERSION);
  const hasNews = seenVersion !== APP_VERSION;
  const links = isModerator(profile.role)
    ? [...LINKS, { href: "/admin", label: "Admin", icon: Shield }]
    : LINKS;
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-40 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <Emblem />
            <span className="leading-none">
              <span className="font-display block text-lg font-bold tracking-[0.18em] text-primary">
                MESÃO
              </span>
              <span className="hidden text-[9px] tracking-[0.35em] text-muted-foreground uppercase sm:block">
                Commander
              </span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "font-display relative flex items-center gap-1.5 px-2 py-4 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground xl:px-2.5",
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity",
                  isActive(href) && "text-primary after:opacity-100",
                )}
              >
                <Icon className="size-3.5 opacity-80" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex-1 lg:hidden" />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={hasNews ? `Menu da conta (novidades da v${APP_VERSION})` : "Menu da conta"}
            >
              {hasNews && (
                <span className="absolute -top-0.5 -right-0.5 z-10 size-2.5 rounded-full bg-primary ring-2 ring-background" />
              )}
              <Avatar className="size-8 ring-1 ring-primary/50">
                {profile.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt={profile.name} />
                )}
                <AvatarFallback>{initials(profile.name)}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-1">
                <span>{profile.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {profile.email}
                </span>
                {profile.role !== "member" && (
                  <Badge variant="secondary" className="w-fit">
                    {ROLE_LABEL[profile.role]}
                  </Badge>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/players/${profile.id}`}>
                  <User /> Meu perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/changelog">
                  <Sparkles /> Novidades
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    {hasNews && <span className="size-2 rounded-full bg-primary" />}v{APP_VERSION}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <form action={logoutAction} className="w-full">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2"
                  >
                    <LogOut className="size-4" /> Sair
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="gold-rule opacity-70" />
      </header>

      {/* Navegação inferior no mobile — fora do <header>: o backdrop-blur dele faria o "fixed" grudar no header */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-primary/20 bg-background/90 backdrop-blur-md lg:hidden">
        {links.slice(0, MOBILE_PRIMARY).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
              isActive(href) && "text-primary",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground outline-none",
              links.slice(MOBILE_PRIMARY).some((l) => isActive(l.href)) &&
                "text-primary",
            )}
          >
            <MoreHorizontal className="size-5" />
            Mais
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="mb-2 w-48">
            {links.slice(MOBILE_PRIMARY).map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href} className={cn(isActive(href) && "bg-muted")}>
                  <Icon /> {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}
