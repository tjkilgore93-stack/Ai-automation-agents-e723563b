# AI Agent Automation Funnel

Self-hosted Node.js funnel for the AI Agent Automation Bootcamp.

## Requirements

- Node.js 20 or newer
- npm

## Install

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` and set the values you need:

- `PORT` — optional HTTP port; defaults to `3000`
- `BASE_URL` — optional public base URL; defaults to `http://localhost:<PORT>`
- `COURSE_ACCESS_SECRET` — required for stable course and unsubscribe tokens outside local development
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` — required for live Stripe checkout and webhook verification
- `RESEND_API_KEY`, `FROM_EMAIL` — required to send lead and course-access emails

Never commit `.env` or production credentials. Use the deployment platform’s secret store for deployed environments.

## Run and test

```bash
npm start
npm test
```

## Current behavior

- When Stripe is configured, `/api/checkout` creates a Stripe Checkout session.
- Without Stripe configuration, `/api/checkout` returns a demo success URL rather than calling Stripe.
- When Resend is not configured, lead capture and order handling continue, but email delivery is skipped.

## GitHub Actions

- Node.js CI installs dependencies and runs the Node test suite on supported Node versions.
- The release workflow runs verification and attempts `npm publish` only when the package is not marked `private`. Private repositories therefore verify successfully without publishing to npm.

## Hyperfy product architecture (planned)

The repository also contains a Hyperfy landing page and a Supabase/Next.js auth app. A single repository with separate apps is the current proposed direction, but the migration is **not complete**. See [the engineering handbook](docs/ENGINEERING_HANDBOOK.md), [the multi-app migration plan](docs/MULTI_APP_MIGRATION.md), and [SKILLS.md](SKILLS.md) for current state, conventions, and staged steps. The existing root Node.js funnel remains in place during the migration; do not replace its root scripts or deployment configuration as part of the app move.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
