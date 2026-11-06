# Engineering Handbook

## Purpose and current state

This handbook describes the intended tools, environments, and working practices for this repository. The repository currently includes a root-level Node.js AI Agent Automation Bootcamp funnel, a Hyperfy landing page represented by root-level web files, and a Next.js/Supabase application in `auth-app/`. The proposed `apps/landing` and `apps/auth` layout is a target, **not the current checked-in layout**. No application files are moved by this documentation change.

Keep the existing root Node.js application operational throughout any restructure. Treat the landing page and auth app as separate deployable applications unless the deployment design is explicitly changed and reviewed.

## Intended architecture

```text
.
├── apps/
│   ├── landing/       # Hyperfy marketing/landing application (after migration)
│   └── auth/          # Next.js + Supabase auth application (after migration)
├── docs/              # engineering and migration documentation
├── .github/workflows/ # CI and release workflows
├── auth-app/          # current auth location until migration is reviewed
├── package.json       # current root Node.js funnel; preserve its behavior
└── SKILLS.md
```

Do not create a shared `packages/ui` package until both apps have a real shared component and tests/builds show a need. Avoid introducing a monorepo runner or changing package managers as part of the first structural move.

## Tools and environments

- **Runtime:** Node.js 20+ for the existing root service; use the version declared by each app once verified.
- **Package management:** npm is used at the root. The auth app has its own package manifest. Keep installs and lockfiles scoped to their current apps until a workspace migration is deliberately designed; do not mix npm and pnpm lockfiles.
- **Web app:** Next.js/TypeScript for the auth app. Confirm the landing implementation and framework before changing its structure.
- **Identity/data:** Supabase for auth app flows. Use separate Supabase projects/configuration for non-production and production where available.
- **Payments/email:** Existing root funnel uses Stripe and Resend; its credentials and runtime are independent of Supabase.
- **Source control/review:** GitHub, pull requests, protected `main` branch, and focused feature branches.
- **CI:** GitHub Actions. Keep existing workflows working; add or adjust path filters only after verifying their working directories and deployment expectations.
- **Deployment:** Maintain separate deploy targets/configuration for the landing app, auth app, and root funnel unless an intentional consolidation is approved.

## Environments and secrets

Use `local`, `preview` (or staging), and `production` distinctly. Preview deployments must not use production credentials or production data by default.

- Root funnel: follow `.env.example` for `PORT`, `BASE_URL`, `COURSE_ACCESS_SECRET`, Stripe variables, and Resend variables.
- Auth app: use `auth-app/.env.example` as the source of truth for Supabase public URL/key and any other required variables. Verify actual variable names there before configuring deployments.
- Never commit `.env`, service-role keys, Stripe secrets, webhook secrets, or email-provider API keys.
- Put deployment secrets in the hosting provider or GitHub Actions secrets. Limit access and use least-privilege tokens.
- Keep public client variables distinct from server-only secrets. A `NEXT_PUBLIC_` prefix makes a value available to browser code; never use it for a secret.
- Rotate credentials if they are accidentally committed or exposed.

## Local development

Root Node.js funnel:

```bash
npm install
cp .env.example .env
npm start
npm test
```

Auth app (current directory; inspect its README and package scripts first):

```bash
cd auth-app
cp .env.example .env.local
npm install
npm run dev
```

Landing page: use the implementation-specific instructions after confirming its files, assets, and build method. Do not assume it is a Next.js app just because the auth app is.

## Quality gates

Before merging, run the checks relevant to changed paths:

1. Root funnel: `npm test` and the existing CI workflow.
2. Auth app: its declared lint/typecheck/test/build scripts and the auth CI workflow.
3. Landing app: the verified build and checks for its actual framework.
4. Review changed environment variable names, asset paths, workflow paths, deployment root directories, redirects, callback URLs, and Supabase auth URL allowlists.
5. Confirm no secrets or generated build artifacts were added.

Do not claim production readiness solely because a branch merged or a build passed. Exercise critical auth and payment flows in a non-production environment.

## Branches and pull requests

- `main` is the canonical, protected branch.
- Use short-lived `feature/*`, `fix/*`, or `docs/*` branches and pull requests.
- Keep PRs focused and describe affected app(s), migration steps, test evidence, deployment impact, and rollback approach.
- Do not merge unrelated experiments together. Review existing `copilot/*` and `codespace/*` branches before deleting them; preserve valuable commits and respect branch protection.
- Avoid force-pushing shared branches. Use normal review and CI gates.

## Deployment and rollback

Deploy each app from its intended working directory, using its own build command, environment variables, domain, and preview configuration. Confirm the provider's configured root directory before moving files. Roll out structural changes in small PRs, deploy previews first, and retain a rollback path to the previous commit/configuration. Do not delete the old app path until the new deployment and callbacks have been verified.

## Change discipline

- Documentation should distinguish current implementation from intended architecture.
- Preserve the root funnel's behavior and release workflow unless a separate task specifically changes them.
- Make moves and config changes in reviewable increments; update CI/deployment paths in the same PR as each move.
- Keep secrets out of examples; use placeholder values only.
- Update this handbook and `SKILLS.md` when architecture or conventions materially change.
