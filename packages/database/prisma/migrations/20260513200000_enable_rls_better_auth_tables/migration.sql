-- Better Auth tables: same pattern as catering SaaS (RLS on; block anon/authenticated; service_role full access).
-- Prisma/Better Auth use the database owner role, which bypasses RLS unless FORCE ROW LEVEL SECURITY is set.

ALTER TABLE "public"."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."user" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."session" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."account" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."verification" FROM anon, authenticated;

CREATE POLICY "service_role_full_access_user"
ON "public"."user"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_session"
ON "public"."session"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_account"
ON "public"."account"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_verification"
ON "public"."verification"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
