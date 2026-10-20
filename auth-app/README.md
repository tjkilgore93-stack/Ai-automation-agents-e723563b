# Hyperfya Auth (Next.js App Router)

This is a separate Next.js 16 App Router app alongside the existing Node.js funnel. The root application is intentionally unchanged.

## Requirements

- Node.js 22 or newer
- Supabase project `yxrspvibmnfgnytijedd`

## Run locally

```bash
cd auth-app
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from the Supabase project's publishable API keys.
npm install
npm run dev
```

Open http://localhost:3000. Routes: `/login`, `/signup`, and authenticated `/dashboard`.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL (already set in the example)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: project publishable key (required)
- `NEXT_PUBLIC_SITE_URL`: exact public base URL, with no trailing slash; use `https://hyperfya.com` only after the auth app is deployed at the root domain. Keep `http://localhost:3000` for local development.

Never add a Supabase service-role/secret key to this app or any `NEXT_PUBLIC_*` variable.

## Production deployment (Vercel)

The app lives in the `auth-app/` subdirectory. Create a separate Vercel project connected to this repository and set **Root Directory** to `auth-app`. Use Node.js 22 or newer.

Configure these Vercel environment variables for Production (and Preview separately if needed):

- `NEXT_PUBLIC_SUPABASE_URL=https://yxrspvibmnfgnytijedd.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: copy the publishable key from the Supabase project API settings
- `NEXT_PUBLIC_SITE_URL=https://hyperfya.com` only if this deployment will own the root domain

Before assigning `hyperfya.com`, verify that it is intended to serve this Next.js auth app and will not replace another live Hyperfya website. If the root domain will host another app, use a dedicated subdomain such as `https://auth.hyperfya.com` instead, and set `NEXT_PUBLIC_SITE_URL` to that exact origin. Add the chosen domain in Vercel and apply the DNS records Vercel provides; do not change existing DNS records blindly. Wait for Vercel to confirm domain and HTTPS readiness before testing production email links.

## Supabase Auth URL and email settings

In the Supabase dashboard for project `yxrspvibmnfgnytijedd`, open **Authentication → URL Configuration**:

- Set **Site URL** to the exact deployed auth app origin (for example, `https://hyperfya.com` if the root domain is assigned to this app).
- Add `http://localhost:3000/auth/confirm` to the allowed redirect URLs for local testing.
- Add the exact production callback URL, for example `https://hyperfya.com/auth/confirm` (or `https://auth.hyperfya.com/auth/confirm` if using the subdomain).

The callback route expects a `token_hash` and an allowed `type` query parameter. In **Authentication → Email Templates → Confirm signup**, configure the confirmation link to use the token-hash callback:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

Keep email confirmation enabled. Verify the template and redirect allowlist match the actual production origin exactly; do not enable broad wildcard production redirects.

## Auth and data security

- Cookie-based sessions through `@supabase/ssr`.
- Next.js `proxy.ts` refreshes sessions; `getClaims()` validates identity. Protected dashboard also checks claims server-side.
- Email/password sign-up and sign-in; email confirmation is exchanged in `/auth/confirm`; logout is a server action.
- Redirect destinations are restricted to relative same-origin paths.
- Profile rows are protected by RLS policies that bind each row to `auth.uid()`, including both `USING` and `WITH CHECK` for updates.
- No service-role key is used by the app.

The `profiles` table and row-level-security policies have been applied to project `yxrspvibmnfgnytijedd`. The SQL migration is included in `supabase/migrations/` for source control.

## Launch checklist

1. Deploy the `auth-app/` Vercel project and confirm the selected domain is serving this app over HTTPS.
2. Set the three Production environment variables and redeploy after changes.
3. Configure Supabase Site URL, allowed redirect URLs, and the confirmation email template as above.
4. Run `npm run typecheck` and `npm run build` locally or confirm the GitHub Actions workflow passes.
5. Test a new account end-to-end: signup, receive email, click confirmation, reach dashboard, save profile, log out, and verify a logged-out browser is redirected away from `/dashboard`.
6. Test login and logout again in production. Do not call the flow launch-ready until real email delivery and callback behavior have been confirmed.

The repository editing connection cannot itself configure DNS, create a Vercel project, set Supabase dashboard Auth URL settings, or verify live email delivery; those external steps require access to the respective dashboards.
