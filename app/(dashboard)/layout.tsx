import { FanContentNotice } from "@/components/fan-content-notice";
import { Navbar } from "@/components/navbar";
import { logout } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireUser();

  return (
    <>
      <Navbar profile={profile} logoutAction={logout} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6">{children}</main>
      <FanContentNotice />
    </>
  );
}
