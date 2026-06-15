DO $$
BEGIN
  IF to_regclass('public."Profile"') IS NOT NULL THEN
    -- Enable RLS on Profile table to protect Data API access
    EXECUTE 'ALTER TABLE "public"."Profile" ENABLE ROW LEVEL SECURITY';

    -- Remove direct table grants from public API roles
    EXECUTE 'REVOKE ALL ON TABLE "public"."Profile" FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE "public"."Profile" FROM authenticated';

    -- Keep privileged backend access for service role
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'Profile'
        AND policyname = 'service_role_full_access_profile'
    ) THEN
      EXECUTE 'CREATE POLICY "service_role_full_access_profile" ON "public"."Profile" FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
  END IF;
END $$;
