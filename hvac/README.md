# HVAC Intake & Human Approval MVP — Stage A

Local fictional-data demonstration only. It is disabled by default and uses bounded in-memory storage. Restarting the process erases inquiries, audit entries, credentials, and revocations. It is not approved for customer operations.

## Enable locally

Set these variables in the shell used to start the existing Node.js app:

- HVAC_DEMO_ENABLED=true
- HVAC_TENANT_ID=hyperfya-demo
- HVAC_STAFF_TOKEN — unique high-entropy secret, at least 32 characters
- HVAC_APPROVER_TOKEN — a different high-entropy secret, at least 32 characters
- HVAC_TOKEN_TTL_SECONDS — optional; defaults to 28,800 and must be between 60 and 86,400

Keep secrets in a secure local environment or secret manager. Never commit them or enter real customer data. When enabled, startup fails if credentials are missing, too short, or identical. When disabled (the default), the existing funnel starts normally and HVAC API routes return 404.

Run npm start and open /hvac/demo.html on the same local origin. The page keeps credentials only in memory and does not use browser storage.

## Boundaries

- Web-form intake only. No email provider/webhook, telephony, SMS, outbound call, email-send, or automatic messaging integration exists.
- Deterministic classification; urgent indicators take precedence over missing information. Urgent inquiries receive no draft and cannot be approved as ordinary drafts.
- Fixed initial response template. Staff edits create a new draft version; any prior approval is invalidated.
- Staff can read/update. The separate approver credential can approve/reject, record urgent handling, and close eligible inquiries.
- Tokens are SHA-256 hashed in memory and expire. Trusted in-process code can revoke a credential through the exported server.hvacHandler.revokeCredential(token) hook; there is no public revocation endpoint. Restarting clears revocations, so rotate configured credentials before restarting if revocation must persist.
- Audit events are append-only through this application interface, bounded, and linked by an in-memory SHA-256 chain. This is not database-enforced protection and does not protect against a process owner or memory modification.
- No database, hosted service, dependency, production deployment, or persistent customer data is used.

Urgency indicators create a human-review flag only. The demo intentionally contains no emergency advice. Any customer-facing safety wording requires review by a qualified HVAC professional before real use.