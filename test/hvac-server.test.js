import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.HVAC_DEMO_ENABLED = 'true';
process.env.HVAC_TENANT_ID = 'server-test-tenant';
process.env.HVAC_STAFF_TOKEN = 'server-test-staff-token-0123456789-abcdef';
process.env.HVAC_APPROVER_TOKEN = 'server-test-approver-token-0123456789-abcdef';
process.env.HVAC_TOKEN_TTL_SECONDS = '3600';

const { server } = await import('../server.js');

test('root server routes the enabled HVAC demo before the generic versioned API fallback', async (t) => {
  server.listen(0);
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const noticeResponse = await fetch(origin + '/api/v1/hvac/demo');
  const notice = await noticeResponse.json();
  assert.equal(noticeResponse.status, 200);
  assert.equal(notice.persistence, 'in-memory');

  const intakeResponse = await fetch(origin + '/api/v1/hvac/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sample Person', email: 'sample@example.test', zip: '37397', message: 'The AC is not cooling.' })
  });
  const receipt = await intakeResponse.json();
  assert.equal(intakeResponse.status, 201);
  assert.equal(receipt.inquiry.state, 'draft_ready');
  assert.equal(Object.hasOwn(receipt.inquiry, 'tenantId'), false);

  const staffResponse = await fetch(origin + '/api/v1/hvac/inquiries', {
    headers: { Authorization: 'Bearer ' + process.env.HVAC_STAFF_TOKEN }
  });
  const queue = await staffResponse.json();
  assert.equal(staffResponse.status, 200);
  assert.equal(queue.inquiries.length, 1);
});