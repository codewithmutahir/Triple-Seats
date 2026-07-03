# CaterPro Deployment Checklist

## Before Every Deploy

- [ ] `pnpm build` passes locally
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Web and API deployed from the same commit (batch routes require API `/api/meta`)
- [ ] `LEAD_INTAKE_CATERER_ID` set to real caterer ID
- [ ] `BETTER_AUTH_URL` set to production domain
- [ ] `WEB_ORIGIN` set to production domain
- [ ] `RESEND_FROM_EMAIL` uses verified domain
- [ ] Database migrations run: `pnpm db:migrate:deploy`
- [ ] Supabase pause disabled (Settings → Database)

## Environment Variables Checklist

### API (required)

- [ ] `DATABASE_URL`
- [ ] `DIRECT_URL`
- [ ] `BETTER_AUTH_SECRET` (32+ chars)
- [ ] `BETTER_AUTH_URL`
- [ ] `WEB_ORIGIN`
- [ ] `LEAD_INTAKE_CATERER_ID`
- [ ] `API_PORT`

### API (optional but recommended)

- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_EMAIL`
- [ ] `BETTER_AUTH_API_KEY`

### Web (required)

- [ ] `INTERNAL_API_URL`
- [ ] `NEXT_PUBLIC_ROOT_DOMAIN`

## Post Deploy Verify

- [ ] `/health/live` returns 200
- [ ] `/health/ready` returns 200
- [ ] Can register new account
- [ ] Can login
- [ ] Lead form submits successfully
- [ ] Dashboard shows data
- [ ] Email sending works (check Resend logs)
