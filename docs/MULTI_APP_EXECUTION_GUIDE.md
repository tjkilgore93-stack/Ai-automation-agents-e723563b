# Multi-app execution guide and repository cleanup map

## Decision and important coupling

Keep the repository on npm and retain the root Node.js funnel as-is. The Hyperfy landing page is currently not an independent static site: its root `app.js` posts to same-origin `/api/leads` and `/api/checkout`, and the root `server.js` serves the HTML/assets as well as handling those API routes, Stripe webhooks, course access, and unsubscribe. The root `render.yaml` deploys that server and expects `/api/health`.

Therefore, moving `index.html`, `styles.css`, and `app.js` into a separately hosted `apps/landing` today would break its form/checkout integration unless the API origin, CORS/security policy, URLs, and deployment are deliberately addressed. Do not copy the existing landing files into a standalone deployment or change the root package scripts as part of a directory-only move.

The lowest-risk immediate architecture is:

```text
Ai-automation-agents/
├── auth-app/                 # current Next.js/Supabase app; candidate future apps/auth
├── docs/
├── .github/workflows/
├── index.html                # current Hyperfy page; served by root Node server
├── styles.css
├── app.js                     # same-origin lead/checkout API client
├── server.js                  # API + static server for the landing/funnel
├── package.json              # existing root funnel; preserve
├── package-lock.json         # existing root lockfile; preserve
├── render.yaml               # current root funnel deployment; preserve
└── SKILLS.md
```

A future `apps/landing` can be a frontend-only app if it calls the existing funnel API through a documented, secure API origin. Alternatively, keep the static page coupled to the root service and describe that as the landing/funnel app. Choose one explicitly before moving files. The auth app can be moved independently after its own CI and hosting paths are updated.

## Proposed package/script contract

These are planning examples, not files to commit blindly. Preserve the current root `package.json` exactly for the first migration: it is private, requires Node >=20, and defines `npm start` and `npm test` for the production funnel. Do not replace it with a generic workspace manifest.

### Root service (current, authoritative)

```json
{
  "name": "ai-agent-automation-bootcamp-funnel",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test server.test.js"
  },
  "engines": { "node": ">=20" }
}
```

This abbreviated contract is for orientation only; retain the checked-in manifest and lockfile rather than replacing them with this snippet.

### Auth app (current manifest; rename only as a separate reviewed change)

The existing `auth-app/package.json` identifies a private Next.js app, requires Node >=22, and supplies `dev`, `build`, `start`, and `typecheck` scripts. Its current CI runs in `auth-app/`, uses Node 22, runs `npm install --no-audit --no-fund`, typechecks, and builds. If moved to `apps/auth`, update both the workflow's path filters and `working-directory`; keep the app's dependency versions and scripts unchanged during the move.

Expected commands from its app directory are:

```bash
npm install --no-audit --no-fund
npm run dev
npm run typecheck
npm run build
npm start
```

Do not invent a lint/test script unless the app adds and validates it. Keep its `.env.example` in the app directory and use non-production Supabase settings in previews.

### Landing app (not yet independently package-managed)

The current landing page is HTML/CSS/JavaScript served by the root Node application. It has no verified independent `package.json` or build step. Do not add a Next.js/Vite/Turbo package simply to satisfy the proposed tree. If it is later decoupled, define and test the API origin and deployment contract first; then add the smallest package/build setup required by the chosen hosting arrangement.

## Staged implementation PRs

### PR 1 — auth app move (recommended first)

1. Branch from latest `main`, e.g. `chore/move-auth-app-to-apps-auth`.
2. Move `auth-app/` to `apps/auth/` without changing application logic or dependency versions.
3. Update `.github/workflows/hyperfya-auth-ci.yml` path filters from `auth-app/**` to `apps/auth/**` and set `working-directory: apps/auth`.
4. Check hosting configuration and auth setup documentation for the old path. Current auth README describes a Vercel project rooted at `auth-app/`; update that instruction only after confirming the actual deployment project and its desired root.
5. Run app typecheck/build from `apps/auth/`; run root `npm test`; inspect diff and preview auth callback behavior.
6. Merge only after CI passes and deployment owners confirm settings. Keep a rollback commit/path documented.

### PR 2 — landing/API boundary decision

1. Decide whether the landing page stays on the root Node service or becomes a separate frontend.
2. If it stays coupled, document it as the root funnel/landing app and do not claim a standalone `apps/landing` deployable exists.
3. If decoupling, define a server-side/API deployment origin and configure client requests. Review CORS, CSRF/origin handling, rate limits, privacy/consent, checkout return URLs, webhook handling, email links, and preview-vs-production secrets. Use a preview environment to test leads and Stripe test-mode checkout before production.
4. Only then move the verified landing assets, update paths and hosting roots, and validate all flows end-to-end.

### PR 3 — optional tooling/workspace

Do not add npm workspaces, Turbo, a second package manager, or shared packages until both apps have independent package/build needs and CI/deploy paths are stable. If adopted later, use a separate design PR and preserve root funnel `start`, `test`, deployment, and lockfile behavior.

## Branch map (last API inventory)

`main` is protected and contains the merged Supabase auth and Hyperfy landing feature work, plus the documentation commit. The branch API also marked the listed branches protected. Protection and commit ancestry mean this guide does **not** delete branches.

| Branch | Observed state | Recommended action |
|---|---|---|
| `main` | Canonical protected branch; current documentation and app changes | Keep |
| `feat/hyperfy-gold-landing-page` | Its work was merged in PR #14 | Check whether branch still exists; if so, archive/delete only after confirming no later commits and protection rules permit |
| `feat/supabase-nextjs-auth` | Its work was merged in PR #7 | Check for later commits; then archive/delete if redundant and allowed |
| `docs/hyperfya-production-auth-setup` | Has production auth/deployment docs not present in the earlier inspected `main` history; likely useful work | Preserve; compare against current `auth-app/README.md` and selectively merge/update docs before considering cleanup |
| `copilot/add-modal-component` | Head commit changed the old root `index.html`; may be superseded by later landing page work, but needs full comparison | Review diff against `main`; preserve unique useful changes, then delete only if redundant and permitted |
| `copilot/on-my-gitbutler-repo` | Shares a head with another Copilot branch; head records a `.gitignore` addition | Compare complete branch diff; likely consolidate/clean after review |
| `copilot/share-pull-request-link` | Same recorded head as `copilot/on-my-gitbutler-repo` | Verify whether refs are identical and whether any PR/work depends on it before cleanup |
| `codespace-silver-capybara-wvw546x6xvgcg7j9` | Head corresponds to work whose changes were merged through PR #6; branch may be redundant | Check for commits after merged point and open PRs; clean only if confirmed redundant and allowed |
| `codespace-vigilant-space-carnival-vpg5qv4g9jq72wr46` | Head is a package-lock line-ending-only change based on the commit inspected | Review full diff; likely safe to close/remove only after checking no PR/work depends on it |

Branch inventory is time-sensitive. Refresh it before any action. For each candidate, compare it with `main`, inspect open PRs, and look for commits not reachable from `main`. Do not infer merge status from a branch name or a single commit. Because the branch API reported protection, use repository settings/authorized review to change protection or delete refs; do not force-push.

## Actionable PR checklist

- [ ] Scope states which app(s) are affected and does not accidentally move unrelated root projects.
- [ ] Root `package.json`, `package-lock.json`, API behavior, `render.yaml`, and health check remain intact unless explicitly in scope.
- [ ] Every moved file is verified as belonging to the intended app.
- [ ] App-specific lockfiles/manifests and Node versions are preserved.
- [ ] Imports, asset URLs, same-origin API paths, callback/redirect URLs, and environment variable names are checked.
- [ ] GitHub Actions path filters and working directories follow the move.
- [ ] Hosting provider root directory, build command, output directory, domain, and secrets are reviewed with the deployment owner.
- [ ] No `.env` files, production credentials, or generated artifacts are added.
- [ ] Root `npm test` and app-specific typecheck/build pass.
- [ ] Preview verifies landing assets, lead capture, test checkout, auth signup/confirmation/login/logout, and protected routes as applicable.
- [ ] Rollback plan and production impact are described.
- [ ] README, `SKILLS.md`, handbook, and migration docs distinguish implemented state from target state.

## Branch cleanup procedure

1. Refresh branch and pull request lists.
2. For each branch, compare its head to `main` and review commits/files unique to the branch.
3. Confirm any useful changes are merged or saved in a replacement branch; confirm there is no open PR or deployment dependency.
4. Check branch protection/rulesets and repository policy. Preserve protected branches until an authorized maintainer deliberately changes the rule.
5. Delete only confirmed redundant branches, one at a time; retain `main` and the useful production-auth docs until reconciled.
