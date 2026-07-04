import { redirect } from "next/navigation";

import { LoginClient } from "@/app/(auth)/login/login-client";
import { getServerAuthSession } from "@/lib/server-auth-session";

export default async function LoginPage() {
  const session = await getServerAuthSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <LoginClient />;
}
