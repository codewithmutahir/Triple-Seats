-- Enable RLS on all catering SaaS tables exposed in public schema
ALTER TABLE "public"."caterers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."quote_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_reminders" ENABLE ROW LEVEL SECURITY;

-- Prevent direct Data API access from public roles until explicit policies are added
REVOKE ALL ON TABLE "public"."caterers" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."guests" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."leads" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."events" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."quotes" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."quote_line_items" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."menu_items" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."tasks" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."messages" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."payment_reminders" FROM anon, authenticated;

-- Keep backend service role access for server-side APIs
CREATE POLICY "service_role_full_access_caterers"
ON "public"."caterers"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_guests"
ON "public"."guests"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_leads"
ON "public"."leads"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_events"
ON "public"."events"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_quotes"
ON "public"."quotes"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_quote_line_items"
ON "public"."quote_line_items"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_menu_items"
ON "public"."menu_items"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_tasks"
ON "public"."tasks"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_messages"
ON "public"."messages"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_payment_reminders"
ON "public"."payment_reminders"
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
