import { prisma } from "@tripeseats/database";

function envSuperAdminEmails(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** True if DB flag is set or email is listed in SUPER_ADMIN_EMAILS. */
export function isSuperAdminFromFlags(opts: {
  isSuperAdmin: boolean;
  email: string | null | undefined;
}): boolean {
  if (opts.isSuperAdmin) return true;
  const email = opts.email?.trim().toLowerCase();
  if (!email) return false;
  return envSuperAdminEmails().has(email);
}

export async function resolveIsSuperAdmin(userId: string, email: string | null | undefined) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true }
  });
  return isSuperAdminFromFlags({
    isSuperAdmin: row?.isSuperAdmin ?? false,
    email
  });
}
