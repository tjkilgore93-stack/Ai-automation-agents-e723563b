# Skills and Project Architecture

## Repository skills

This repository currently combines a root Node.js AI Agent Automation Bootcamp funnel with Hyperfy product work. It also contains a Next.js/Supabase auth application. The Hyperfy landing page and auth app are intended to become separate apps in a single repository, but that directory migration is still planned; see `docs/MULTI_APP_MIGRATION.md`.

## Current state versus target

Current relevant paths include:

- Root `package.json`, `app.js`, `server.js`, and tests: existing Node.js funnel. Preserve these independently.
- Root web files: landing-page candidates that must be inventoried before moving.
- `auth-app/`: current Next.js/Supabase auth application.
- `docs/` and `.github/workflows/`: documentation and CI configuration.

Target layout after a reviewed migration:

```text
Ai-automation-agents/
├── apps/
│   ├── landing/       # Hyperfy marketing site
│   └── auth/          # Next.js + Supabase auth app
├── docs/
├── .github/workflows/
├── auth-app/          # removed only after validated move to apps/auth
├── package.json       # existing root funnel, retained
└── SKILLS.md
```

## Project capabilities and tools

- Node.js 20+ and npm for the existing root funnel.
- Next.js/TypeScript and Supabase for the auth application (consult its own manifest and README for exact scripts/configuration).
- Stripe and Resend are used by the root funnel; credentials remain server-side.
- GitHub Actions provides CI/release automation.
- Separate preview and production configuration should be maintained for each deployed app.

## Working rules

- `main` is canonical; make focused changes through pull requests.
- Keep the root funnel isolated from the Hyperfy app restructuring.
- Verify the landing implementation before assigning a framework or moving root files.
- Keep environment secrets in deployment secret stores; never commit them.
- Test each app and inspect its preview deployment before production rollout.
- Treat `apps/landing` and `apps/auth` as planned paths until the migration is actually complete.

## Documentation

- `README.md`: repository overview and existing root app usage.
- `docs/ENGINEERING_HANDBOOK.md`: tools, environments, quality gates, branching, security, and deployment practices.
- `docs/MULTI_APP_MIGRATION.md`: staged migration plan and PR checklist.
