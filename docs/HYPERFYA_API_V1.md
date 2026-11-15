# Hyperfya API v1

## Status

This is the initial, additive API foundation. The first implemented route is a public, read-only health endpoint. Existing unversioned funnel routes remain unchanged.

## Base path

`/api/v1`

## Implemented endpoint

### `GET /api/v1/health`

Returns basic service identity and API version. It deliberately does not disclose environment configuration, provider credentials, customer records, payment status, or internal infrastructure details.

Example response:

```json
{
  "ok": true,
  "service": "hyperfya-api",
  "apiVersion": "v1"
}
```

Unsupported methods on this endpoint return HTTP 405. Unknown paths under `/api/v1` return a JSON HTTP 404.

## Compatibility policy

- Existing routes such as `/api/leads`, `/api/checkout`, `/api/subscription/checkout`, `/api/stripe/webhook`, and `/api/health` are preserved.
- New public API capabilities are added under `/api/v1`.
- Do not silently change the behavior or response contracts of existing checkout and webhook routes.
- Introduce breaking changes only through a new API version.

## Security gates before customer-data endpoints

The current auth app uses Supabase Auth with cookie-based SSR sessions and validates identity with `getClaims()`. The current database migration protects each user's profile row with owner-scoped RLS. That is a useful foundation, but it is not yet a tenant/organization model or a complete public API authorization design.

Before adding endpoints that read or mutate customer data, agents, workflows, or entitlements:

1. Define the tenant/organization ownership model and membership roles.
2. Define and migrate the required tables with RLS policies that enforce tenant boundaries.
3. Verify Supabase access tokens server-side; never trust a user ID, role, or entitlement supplied in the request body.
4. Keep service-role credentials and provider secrets server-only. Prefer user-scoped access and RLS; if a privileged server operation is necessary, enforce authorization before executing it.
5. Add rate limits, request validation, audit events, idempotency for mutating operations, and negative authorization tests.
6. Keep external API-key issuance and rotation separate from browser session cookies.

## Planned next endpoints (not implemented)

- `GET /api/v1/me`: authenticated caller identity.
- `GET /api/v1/agents` and `POST /api/v1/agents`: tenant-scoped agent management.
- `POST /api/v1/agents/{agentId}/runs`: authorized agent execution.
- `GET /api/v1/automations` and `POST /api/v1/automations`: tenant-scoped workflow management.
- `GET /api/v1/billing`: caller-visible billing summary, sourced from trusted billing records.
- `POST /api/v1/webhooks/voice`: signed provider event ingestion with replay protection.

These are design targets, not available routes. They must not be advertised as working until implemented and tested.

## Local verification

From the repository root:

```sh
npm test
npm start
curl -i http://localhost:3000/api/v1/health
```

The health endpoint should return HTTP 200 and the JSON response shown above.
