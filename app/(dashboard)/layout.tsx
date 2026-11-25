import { FanContentNotice } from "@/components/fan-content-notice";
import { Navbar } from "@/components/navbar";
import { logout } from "@/lib/actions/auth";
import { AIIssuesBanner } from "@/components/ai-issues-banner";
import { loadAIIssues } from "@/lib/ai-issues";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireUser();
  // Aviso de falha da IA na rotina semanal: só para o root
  const aiIssues = isRoot(profile.role) ? await loadAIIssues(createAdminClient()) : null;

  return (
    <>
      <Navbar profile={profile} logoutAction={logout} />
      {aiIssues && <AIIssuesBanner issues={aiIssues} />}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6">{children}</main>
      <FanContentNotice changelogLink />
    </>
  );
}
