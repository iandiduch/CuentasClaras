import { redirect } from "next/navigation";

import { MobileShell } from "@/app/components/mobile-shell";
import { getCurrentUser } from "@/lib/server/current-user";

type MainLayoutProps = {
  children: React.ReactNode;
};

export default async function MainLayout({ children }: MainLayoutProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  return <MobileShell>{children}</MobileShell>;
}
