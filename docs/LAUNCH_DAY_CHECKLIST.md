# Launch-Day Owner Checklist — AI Agent Automation Bootcamp

**Purpose:** launch the existing root Node.js funnel without a repo restructure. The landing page uses same-origin API endpoints served by the root app; keep `index.html`, `styles.css`, `app.js`, `server.js`, `package.json`, `package-lock.json`, and `render.yaml` together.

**Launch owner:** ____________________  **Date/time (UTC):** ____________________  **Production URL:** ____________________

> Do not paste secrets into this checklist, issues, or commits. Configure them only in the hosting/provider secret stores. Use Stripe test mode for end-to-end QA; do not make a live charge just to verify deployment.

## A. Before deployment

- [ ] Confirm the offer, price, course contents/access delivery, support contact, refund/cancellation terms, and privacy/consent language are accurate.
- [ ] Confirm `main` contains the intended launch code; no unfinished restructuring is in the deployment diff.
- [ ] Review the production diff and repository status; root funnel files and `render.yaml` are present.
- [ ] Run locally: `npm install`, `npm test`, then `npm start`; check the landing page and health route.
- [ ] Verify `render.yaml` service/build/start/health-check settings match the current root Node app.
- [ ] Prepare production secrets in Render: `COURSE_ACCESS_SECRET`, Stripe live credentials/price/webhook secret, and Resend API key/from address. Set `BASE_URL` to the final HTTPS origin. Never use example or local-development secrets.
- [ ] Confirm Stripe live product and price match the advertised offer. Keep test and live keys/prices/webhook secrets separate.
- [ ] Verify the Resend sender/domain and the content/links of lead and course-access emails.
- [ ] Confirm domain ownership/DNS plan and avoid replacing records for any existing site without authorization.

## B. Deploy and smoke-test

- [ ] Deploy the root service to Render using the existing configuration.
- [ ] Confirm deployment succeeds and service logs show a clean start (no secrets in logs).
- [ ] Confirm `https://<production-host>/api/health` returns a healthy response.
- [ ] Confirm the homepage, CSS, JavaScript, and mobile layout load over HTTPS.
- [ ] Confirm the production `BASE_URL` matches the canonical URL and redirects/HTTPS work.
- [ ] Confirm Render persistent disk/storage configuration is appropriate for the app's local JSON store; verify persistence after a restart if the design depends on it. If unsure, pause launch and decide on durable storage before taking orders.

## C. Test-mode transaction and email validation

- [ ] Use Stripe **test mode** credentials and a test price in a non-production/preview deployment where possible. If testing the production host, switch credentials carefully and do not accept real orders until switched back and re-verified.
- [ ] Submit a consented lead with a controlled test inbox; verify the response and expected email. Confirm no duplicate or unintended email.
- [ ] Complete a Stripe test checkout; confirm correct amount, currency, product, customer email, success/cancel URLs, and no secret leakage in the browser.
- [ ] Send a signed Stripe test webhook to the deployed `/api/stripe/webhook` endpoint; confirm signature verification succeeds and the completion event is handled once. Confirm invalid signatures are rejected and retries do not create duplicate access/orders.
- [ ] Confirm the order/access record survives an app restart if local persistence is used.
- [ ] Verify course-access email arrives, sender is correct, link uses the HTTPS production/preview URL, and a valid token grants access while an invalid token is denied.
- [ ] Verify unsubscribe behavior and that it does not expose private data or grant course access.
- [ ] Check logs for 4xx/5xx errors and provider dashboards for delivery/webhook failures.

## D. Switch to live configuration

- [ ] Confirm test-mode QA passed and record the evidence/time: ____________________
- [ ] Set the live Stripe secret, live price ID, and live webhook signing secret in Render; set verified Resend production credentials and sender.
- [ ] Ensure test credentials are removed from the production environment and production credentials are not present in preview.
- [ ] Configure the Stripe live webhook endpoint as `https://<production-host>/api/stripe/webhook` for the event(s) the app handles; copy the endpoint-specific signing secret into Render.
- [ ] Re-deploy/restart and verify `/api/health` reports the expected payment/email configuration status without revealing credentials.
- [ ] Inspect a checkout session creation in Stripe live mode and verify the displayed amount/product before public promotion. Avoid completing a live payment unless the owner explicitly intends to purchase; if a live payment is used for verification, document refund/accounting steps first.
- [ ] Send a controlled production email only to an authorized test inbox and verify links.

## E. Go/no-go decision

**GO only if all are true:**

- [ ] Render deployment is healthy on the intended HTTPS domain.
- [ ] Stripe live checkout creates the correct offer/amount and uses the correct success/cancel URLs.
- [ ] The live webhook endpoint/signing secret are configured; test webhook processing and idempotency were verified.
- [ ] Resend sender/domain and production email links are verified.
- [ ] Course access is delivered and token validation works.
- [ ] Durable order/access storage is confirmed for the current deployment design.
- [ ] Offer, price, support, refund, privacy, and consent details are ready for customers.
- [ ] No unresolved critical failures or exposed credentials remain.

**Decision:** ☐ GO  ☐ NO-GO   **Owner:** ____________________  **Timestamp (UTC):** ____________________

**NO-GO / rollback triggers:** unhealthy service, incorrect amount/product, failed or duplicate webhook processing, missing order/access record, undelivered or broken access email, invalid token granting access, lost data after restart, or unexpected production errors. Pause promotion/checkout as appropriate, preserve logs without secrets, restore the last known-good deployment/configuration, and resolve before reopening sales.

## F. First 24 hours after launch

- [ ] Check Render health/logs and Stripe webhook delivery at least morning/evening.
- [ ] Check Resend delivery/bounces and reply to customer support messages.
- [ ] Verify the first genuine order's payment, order record, and access delivery; do not expose customer data in public notes.
- [ ] Record incidents and fixes; avoid unrelated app migrations or branch cleanup during launch monitoring.

**Runbook note:** The repository connection can edit GitHub files but cannot configure Render, Stripe, Resend, DNS, or verify live external services. The launch owner must complete those dashboard steps and make the GO/NO-GO decision.
