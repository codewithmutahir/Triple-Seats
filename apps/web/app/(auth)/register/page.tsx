import { redirect } from "next/navigation";

import { RegisterClient } from "@/app/(auth)/register/register-client";
import { getServerAuthSession } from "@/lib/server-auth-session";

export default async function RegisterPage() {
  const session = await getServerAuthSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <RegisterClient />;
}
