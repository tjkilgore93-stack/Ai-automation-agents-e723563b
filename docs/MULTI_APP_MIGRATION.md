# Hyperfy multi-app migration plan

## Goal and scope

Organize the Hyperfy landing page and Supabase auth app as separate applications in the existing repository. The proposed destinations are `apps/landing/` and `apps/auth/`.

This is a plan only: the current repository still has the auth app at `auth-app/`, landing-page files at the root, and a separate root Node.js funnel. This documentation does not move application files or change CI/deploy configuration.

## Guardrails

- Preserve the root funnel (`app.js`, `server.js`, root `package.json`, lockfile, tests, environment contract, and deployment settings). Do not turn the root package into a workspace or change its start/build commands as an incidental part of this migration.
- Verify exactly which root HTML/CSS/assets belong to the Hyperfy landing page before moving them. The repository contains other files and projects; do not sweep all root contents into `apps/landing`.
- Preserve each app's own package manifest, lockfile strategy, environment example, and build configuration until an explicit workspace proposal is reviewed.
- Never copy real `.env` values into the repository or PR.
- Confirm hosting provider root directories, domains, callbacks, and deploy workflows before moving paths.

## Phase 0 — inventory (no code moves)

1. Create a migration branch from current `main`.
2. Inventory root-level web files and identify the landing app's entry point, styles, images, scripts, and any references from the root `index.html`.
3. Inspect `auth-app/README.md`, `auth-app/package.json`, its lockfile status, `.env.example`, Next.js config, Supabase migrations, and all imports.
4. Inspect `.github/workflows/*`, `render.yaml`, `deploy-production.yml`, and hosting configuration for working-directory, path-filter, build, and deploy assumptions.
5. Record the deployment owner/root directory and test commands for each app. If unclear, pause and confirm before proceeding.
6. Capture baseline checks: root `npm test`; auth app's available install/lint/typecheck/test/build commands; landing app's actual validation command.

**Exit condition:** every file to move has an owner, every deployment/workflow path is understood, and baseline behavior is recorded.

## Phase 1 — move the landing app

1. Create `apps/landing/` and move only verified landing assets and source files, preserving relative paths where practical.
2. Add an app README with its actual local run/build instructions. Do not add a framework or package manifest unless required by the existing implementation.
3. Update links, asset references, tests, workflow path filters, deployment root directory, and any static hosting configuration affected by the new location.
4. Run landing validation and root funnel tests; inspect the diff for unrelated files.
5. Deploy a preview and check the page, assets, navigation, and CTA behavior.

**Exit condition:** preview matches the pre-move behavior, CI passes, and production deployment configuration is documented.

## Phase 2 — move the auth app

1. Move `auth-app/` to `apps/auth/`, preserving the app's files, package metadata, Supabase migrations, and environment example.
2. Update auth CI working directories and path filters, hosting build/root settings, deployment configuration, documentation links, and any local scripts.
3. Verify Supabase redirect/callback URLs, site URL, cookie/session behavior, and auth email links in preview; use non-production Supabase credentials.
4. Run the app's declared lint/typecheck/test/build checks and root funnel tests.
5. Deploy a preview and exercise sign-up, confirmation, sign-in, sign-out, protected routes, and profile access.

**Exit condition:** preview auth flows work, CI passes, and the production config has an explicit, reviewed migration procedure.

## Phase 3 — documentation and optional workspace decision

1. Update root README, `SKILLS.md`, and the engineering handbook to describe the actual migrated layout and commands.
2. Keep the existing root npm project independent for now. Consider npm workspaces/Turbo only in a separate PR after evaluating lockfiles, scripts, CI, deployment tooling, and benefits.
3. Add a shared package only when both apps genuinely need shared code and ownership/testing boundaries are clear.

## Phase 4 — production rollout and cleanup

1. Confirm production secrets, Supabase project settings, domains, provider root directories, and rollback target.
2. Deploy one app at a time; verify health and critical flows before proceeding to the next.
3. Keep the old deployment/config available until the new path has been validated. Remove obsolete paths only in a follow-up reviewed change.
4. Review scratch branches separately. Delete only branches confirmed merged or no longer needed, and only when repository permissions/protection allow it.

## Pull request checklist

- [ ] Scope is limited to the intended app and required config/docs.
- [ ] Root funnel files and behavior are preserved.
- [ ] Every moved file is confirmed to belong to the app.
- [ ] Imports, asset URLs, links, and environment variable names are checked.
- [ ] CI paths and working directories match the new layout.
- [ ] Deployment root/build/output settings and callbacks are verified.
- [ ] No secrets, `.env` files, or generated artifacts are present.
- [ ] Root tests and app-specific checks pass.
- [ ] Preview deployment and critical flows have been checked.
- [ ] Rollback plan and production impact are described.
- [ ] Documentation reflects what is implemented (not just the target layout).
