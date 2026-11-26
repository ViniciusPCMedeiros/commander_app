import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";
import { loadCustomBase, loadSeasons, loadThemes, suggestedStart } from "@/lib/seasons-data";
import { SeasonAdmin } from "./season-admin";

export const metadata: Metadata = { title: "Temporadas — Admin" };

export default async function SeasonAdminPage() {
  const { supabase, profile } = await requireUser();
  if (!isRoot(profile.role)) redirect("/admin");

  const [seasons, themes, customBase] = await Promise.all([
    loadSeasons(supabase),
    loadThemes(supabase),
    loadCustomBase(supabase),
  ]);
  // Artes disponíveis para os temas (colocadas em public/banners)
  const banners = fs
    .readdirSync(path.join(process.cwd(), "public", "banners"))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();

  return (
    <div className="space-y-6">
      <PageHeader
        banner="admin"
        eyebrow="Conselho"
        title="Temporadas"
        description="Lance e encerre temporadas, monte os temas e as conquistas base."
        actions={
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Admin
          </Link>
        }
      />
      <SeasonAdmin
        seasons={seasons}
        themes={themes.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description ?? "",
          color: t.color,
          banner: t.banner ?? "",
          banner_credit: t.banner_credit ?? "",
          title_lenda: t.title_lenda,
          title_coroa: t.title_coroa,
          achievements: t.achievements,
        }))}
        customBase={customBase}
        banners={banners}
        defaultStartIso={suggestedStart(seasons).toISOString()}
      />
    </div>
  );
}
