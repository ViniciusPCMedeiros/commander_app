/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { FanContentNotice } from "@/components/fan-content-notice";
import { resolveBanner } from "@/lib/banners";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  const art = resolveBanner("painel");

  return (
    <>
      {/* Mesmo tratamento do banner das páginas, ocupando a tela toda */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {art ? (
          <img src={art.src} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-center opacity-60" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse at top right, rgba(212,175,55,0.12), transparent 65%)" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0b0a]/20 via-[#0c0b0a]/45 to-[#0c0b0a]" />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <div className="text-center">
          <div className="text-[11px] font-semibold tracking-[0.4em] text-primary uppercase">Playgroup de Commander</div>
          <h1 className="font-display text-engraved mt-1 text-5xl font-bold tracking-[0.12em] text-primary sm:text-6xl">MESÃO</h1>
          <div className="gold-rule mx-auto mt-3 w-48" />
        </div>
        <Card className="w-full max-w-sm">
          <CardContent>
            <LoginForm />
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Ainda não tem conta? Peça para um Admin do grupo criar a sua.
            </p>
          </CardContent>
        </Card>
        {art?.credit && <p className="text-xs text-white/40 italic">{art.credit}</p>}
      </main>
      <FanContentNotice />
    </>
  );
}
