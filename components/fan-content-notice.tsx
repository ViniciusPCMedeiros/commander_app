import Link from "next/link";
import { APP_VERSION } from "@/lib/changelog";

/** Aviso exigido pela Fan Content Policy da Wizards of the Coast, com a versão do app. */
export function FanContentNotice({ changelogLink = false }: { changelogLink?: boolean }) {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pt-10 pb-24 text-center text-[11px] leading-relaxed text-muted-foreground/70 lg:pb-8">
      <div className="gold-rule mb-4 opacity-50" />
      <div className="mb-2 font-medium tracking-wide">
        {changelogLink ? (
          <Link href="/changelog" className="hover:text-primary">
            Mesão v{APP_VERSION} · Novidades
          </Link>
        ) : (
          <>Mesão v{APP_VERSION}</>
        )}
      </div>
      O Mesão é Fan Content não oficial, permitido pela{" "}
      <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
        Fan Content Policy
      </a>
      . Não é aprovado nem endossado pela Wizards. Partes dos materiais usados são propriedade da Wizards of the Coast. ©Wizards
      of the Coast LLC. Imagens e dados de cartas via{" "}
      <a href="https://scryfall.com" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
        Scryfall
      </a>
      ; artes de seus respectivos artistas.
    </footer>
  );
}
