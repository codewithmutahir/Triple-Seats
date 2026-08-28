import { prisma } from "@tripeseats/database";

/** True when the user has a local email/password credential (not magic-link-only). */
export async function userHasPassword(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      password: { not: null }
    },
    select: { id: true }
  });
  return Boolean(account);
}
