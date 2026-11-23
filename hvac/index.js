import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const BASE = '/api/v1/hvac';
const LIMITS = { name: 80, email: 254, phone: 32, zip: 10, message: 2000 };
const ALLOWED = new Set(Object.keys(LIMITS));
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const DEMO_NOTICE = Object.freeze({ demo: true, data: 'fictional-only', persistence: 'in-memory', outboundCommunication: false, notice: 'Fictional data only. A server restart may erase inquiries and audit entries. No email, SMS, phone calls, or other messages are sent. Do not enter real customer information.' });

export class HvacError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const clone = (value) => structuredClone(value);
const digest = (value) => createHash('sha256').update(value).digest();

export function validateInquiry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HvacError('INVALID_OBJECT', 'Inquiry must be a JSON object.');
  for (const key of Object.keys(input)) if (!ALLOWED.has(key)) throw new HvacError('UNKNOWN_FIELD', 'Inquiry contains an unsupported field.');
  const out = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    if (!Object.hasOwn(input, key)) continue;
    if (typeof input[key] !== 'string') throw new HvacError('INVALID_FIELD_TYPE', key + ' must be a string.');
    const value = input[key].trim();
    if (value.length > max || CONTROL.test(value)) throw new HvacError('INVALID_FIELD', key + ' is invalid or too long.');
    out[key] = value;
  }
  if (out.email) {
    out.email = out.email.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new HvacError('INVALID_EMAIL', 'Email address is not valid.');
  }
  if (out.phone) {
    const digits = out.phone.replace(/\D/g, '');
    if (digits.length === 10) out.phone = '+1' + digits;
    else if (digits.length === 11 && digits.startsWith('1')) out.phone = '+' + digits;
    else throw new HvacError('INVALID_PHONE', 'Phone must be a valid 10-digit US number.');
  }
  if (out.zip) {
    const digits = out.zip.replace(/-/g, '');
    if (!/^\d{5}(?:\d{4})?$/.test(digits)) throw new HvacError('INVALID_ZIP', 'ZIP code must be 5 digits or ZIP+4.');
    out.zip = digits.length === 9 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
  }
  return out;
}

export function urgencyReasons(message = '') {
  const text = String(message).toLowerCase();
  const checks = [
    ['gas_smell', /\b(?:gas\s+(?:smell|odor|leak)|smell\s+(?:of\s+)?gas)\b/],
    ['carbon_monoxide', /\bcarbon\s+monoxide\b|\bco\s+(?:alarm|detector|exposure)\b/],
    ['smoke', /\bsmoke\b/],
    ['burning_smell', /\b(?:burning\s+(?:smell|odor)|smell\s+of\s+burning)\b/],
    ['sparking', /\b(?:sparking|sparks?)\b/]
  ];
  return checks.filter((item) => item[1].test(text)).map((item) => item[0]);
}

export function serviceType(message = '') {
  const text = String(message).toLowerCase();
  if (/\b(?:no\s+(?:cooling|ac|air\s+conditioning)|not\s+cooling|ac\s+not\s+cooling|warm\s+air|blowing\s+warm)\b/.test(text)) return 'no_cooling';
  if (/\b(?:no\s+heat|not\s+heating|heater\s+(?:broken|(?:is\s+)?not\s+working)|furnace\s+(?:broken|not\s+working)|no\s+heating)\b/.test(text)) return 'no_heat';
  if (/\b(?:maintenance|tune[\s-]?up|inspection|seasonal\s+service)\b/.test(text)) return 'maintenance';
  return 'other';
}

function missingFields(value) {
  const missing = ['name', 'zip', 'message'].filter((key) => !value[key]);
  if (!value.email && !value.phone) missing.push('email_or_phone');
  return missing;
}

function fixedDraft(inquiry) {
  const label = ({ no_cooling: 'no-cooling', no_heat: 'no-heat', maintenance: 'maintenance', other: 'HVAC service' })[inquiry.serviceType];
  return 'Hello ' + inquiry.contact.name + ',\n\nThank you for contacting us about your ' + label + ' request. We have received your inquiry. A team member will review the details and determine the appropriate next step.\n\nThis is a draft for human review only. It has not been sent.\n\nThank you.';
}

function auditHash(entry) {
  return createHash('sha256').update(entry.previousHash + '\n' + JSON.stringify({ id: entry.id, tenantId: entry.tenantId, action: entry.action, actorId: entry.actorId, occurredAt: entry.occurredAt, details: entry.details })).digest('hex');
}

export const validateInquiryInput = validateInquiry;
export const detectUrgency = urgencyReasons;
export const classifyServiceType = serviceType;

export function createCredentialRegistry({ tenantId, staffToken, approverToken, tokenTtlMs = 28800000, clock = Date.now }) {
  return createAuth({ tenantId, staffToken, approverToken, ttlMs: tokenTtlMs, clock });
}

export function createMemoryStore({ clock = Date.now, maxAudit = 1000, maxInquiries = 500 } = {}) {
  const inquiries = new Map(), logs = new Map(), anchors = new Map();
  function appendAudit(tenantId, action, details = {}, actorId = null) {
    const entries = logs.get(tenantId) || [];
    const entry = { id: randomUUID(), tenantId, action, actorId, occurredAt: new Date(clock()).toISOString(), details: clone(details), previousHash: entries.at(-1)?.hash || anchors.get(tenantId) || '0'.repeat(64), hash: '' };
    entry.hash = auditHash(entry); entries.push(entry);
    if (entries.length > maxAudit) anchors.set(tenantId, entries.shift().hash);
    logs.set(tenantId, entries); return clone(entry);
  }
  function save(inquiry) {
    if (!inquiries.has(inquiry.id) && inquiries.size >= maxInquiries) throw new HvacError('DEMO_CAPACITY', 'The in-memory demonstration has reached its record limit.', 503);
    inquiries.set(inquiry.id, clone(inquiry)); return clone(inquiry);
  }
  function get(tenantId, id) { const item = inquiries.get(id); return item && item.tenantId === tenantId ? clone(item) : null; }
  function list(tenantId) { return [...inquiries.values()].filter((item) => item.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone); }
  function audit(tenantId, limit = 100) { return (logs.get(tenantId) || []).slice(-limit).map(clone); }
  function verify(tenantId) {
    let previous = anchors.get(tenantId) || '0'.repeat(64);
    for (const entry of logs.get(tenantId) || []) { if (entry.previousHash !== previous || entry.hash !== auditHash(entry)) return false; previous = entry.hash; }
    return true;
  }
  return Object.freeze({ appendAudit, save, get, list, audit, verify });
}

function createAuth({ tenantId, staffToken, approverToken, ttlMs, clock }) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) throw new Error('HVAC tenant ID is invalid.');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60000 || ttlMs > 86400000) throw new Error('HVAC token TTL must be between 60 seconds and 24 hours.');
  if (typeof staffToken !== 'string' || staffToken.length < 32 || typeof approverToken !== 'string' || approverToken.length < 32 || staffToken === approverToken) throw new Error('Separate staff and approver tokens of at least 32 characters are required.');
  const records = [
    { id: randomUUID(), hash: digest(staffToken), role: 'staff', tenantId, expiresAt: clock() + ttlMs, revokedAt: null },
    { id: randomUUID(), hash: digest(approverToken), role: 'approver', tenantId, expiresAt: clock() + ttlMs, revokedAt: null }
  ];
  function find(token) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 512) return null;
    const hash = digest(token);
    return records.find((record) => timingSafeEqual(hash, record.hash)) || null;
  }
  function authenticate(token) {
    const record = find(token);
    if (!record) return { ok: false, reason: 'invalid' };
    if (record.revokedAt) return { ok: false, reason: 'revoked' };
    if (record.expiresAt <= clock()) return { ok: false, reason: 'expired' };
    return { ok: true, principal: { credentialId: record.id, role: record.role, tenantId: record.tenantId } };
  }
  function revoke(token) { const record = find(token); if (!record || record.revokedAt) return false; record.revokedAt = new Date(clock()).toISOString(); return true; }
  return { authenticate, revoke };
}

export function createHvacService({ tenantId, store = createMemoryStore(), clock = Date.now }) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId || '')) throw new Error('HVAC tenant ID is invalid.');
  const audit = (action, details, actorId = null) => store.appendAudit(tenantId, action, details, actorId);
  function owned(id) { const item = store.get(tenantId, id); if (!item) throw new HvacError('NOT_FOUND', 'Inquiry not found.', 404); return item; }
  function create(input, channel = 'web') {
    if (!['web', 'email'].includes(channel)) throw new HvacError('INVALID_CHANNEL', 'Inquiry channel is not supported.');
    const value = validateInquiry(input), missing = missingFields(value), reasons = urgencyReasons(value.message || ''), urgent = reasons.length > 0, type = serviceType(value.message || '');
    const state = urgent ? 'urgent_review' : missing.length ? 'needs_info' : 'draft_ready';
    const now = new Date(clock()).toISOString();
    const item = { id: randomUUID(), tenantId, channel, createdAt: now, updatedAt: now, contact: { name: value.name || '', email: value.email || '', phone: value.phone || '', zip: value.zip || '' }, message: value.message || '', serviceType: type, urgent, urgencyReasons: reasons, missingFields: missing, state, draft: null, approval: null, rejection: null, urgentHandling: null, closedAt: null, closedBy: null };
    if (state === 'draft_ready') item.draft = { text: fixedDraft(item), version: 1 };
    store.save(item); audit('inquiry_created', { inquiryId: item.id, state, serviceType: type, urgent, missingFields: missing, channel });
    return store.get(tenantId, item.id);
  }
  function update(id, patch, actor) {
    const old = owned(id);
    if (!['needs_info', 'draft_ready', 'approved'].includes(old.state)) throw new HvacError('INVALID_TRANSITION', 'This inquiry cannot be edited in its current state.', 409);
    const value = validateInquiry(patch); if (!Object.keys(value).length) throw new HvacError('EMPTY_UPDATE', 'At least one inquiry field must be supplied.');
    const contact = { ...old.contact }; for (const key of ['name', 'email', 'phone', 'zip']) if (Object.hasOwn(value, key)) contact[key] = value[key];
    const message = Object.hasOwn(value, 'message') ? value.message : old.message;
    const missing = missingFields({ ...contact, message });
    const reasons = [...new Set([...old.urgencyReasons, ...urgencyReasons(message)])], urgent = old.urgent || reasons.length > 0, type = serviceType(message);
    const state = urgent ? 'urgent_review' : missing.length ? 'needs_info' : 'draft_ready';
    const version = (old.draft?.version || 0) + 1, now = new Date(clock()).toISOString();
    const item = { ...old, contact, message, serviceType: type, urgent, urgencyReasons: reasons, missingFields: missing, state, draft: state === 'draft_ready' ? { text: fixedDraft({ contact, serviceType: type }), version } : null, approval: null, rejection: null, updatedAt: now };
    store.save(item);
    if (old.state === 'needs_info' && state === 'draft_ready') {
      audit('inquiry_information_supplied', { inquiryId: id, previousState: 'needs_info', state: 'new', changedFields: Object.keys(value) }, actor.credentialId);
      audit('inquiry_classified', { inquiryId: id, previousState: 'new', state: 'draft_ready', draftVersion: version }, actor.credentialId);
    } else audit('inquiry_updated', { inquiryId: id, previousState: old.state, state, changedFields: Object.keys(value), draftVersion: item.draft?.version || null, urgent }, actor.credentialId);
    return store.get(tenantId, id);
  }
  function revise(id, text, actor) {
    const old = owned(id);
    if (old.urgent || !['draft_ready', 'approved'].includes(old.state) || !old.draft) throw new HvacError('INVALID_TRANSITION', 'This inquiry does not have an editable non-urgent draft.', 409);
    if (typeof text !== 'string' || !text.trim() || text.length > 2000 || CONTROL.test(text)) throw new HvacError('INVALID_DRAFT', 'Draft must be non-empty text of at most 2,000 characters.');
    const item = { ...old, state: 'draft_ready', draft: { text: text.trim(), version: old.draft.version + 1 }, approval: null, rejection: null, updatedAt: new Date(clock()).toISOString() };
    store.save(item); audit('draft_revised', { inquiryId: id, draftVersion: item.draft.version, approvalInvalidated: Boolean(old.approval) }, actor.credentialId); return store.get(tenantId, id);
  }
  function decide(id, input, actor) {
    const old = owned(id);
    if (old.urgent || old.state !== 'draft_ready' || !old.draft) throw new HvacError('INVALID_TRANSITION', 'Only a current non-urgent draft can be approved or rejected.', 409);
    if (!Number.isSafeInteger(input.draftVersion) || input.draftVersion !== old.draft.version) throw new HvacError('STALE_DRAFT', 'The draft version has changed. Reload before deciding.', 409);
    if (!['approve', 'reject'].includes(input.action)) throw new HvacError('INVALID_DECISION', 'Decision must be approve or reject.');
    const now = new Date(clock()).toISOString(), approved = input.action === 'approve';
    const item = { ...old, state: approved ? 'approved' : 'rejected', approval: approved ? { inquiryId: id, draftVersion: input.draftVersion, approverId: actor.credentialId, approvedAt: now } : null, rejection: approved ? null : { inquiryId: id, draftVersion: input.draftVersion, approverId: actor.credentialId, rejectedAt: now }, updatedAt: now };
    store.save(item); audit(approved ? 'draft_approved' : 'draft_rejected', { inquiryId: id, draftVersion: input.draftVersion, state: item.state }, actor.credentialId); return store.get(tenantId, id);
  }
  function handleUrgent(id, input, actor) {
    const old = owned(id);
    if (!old.urgent || old.state !== 'urgent_review') throw new HvacError('INVALID_TRANSITION', 'Only an urgent-review inquiry can receive a human-handling record.', 409);
    if (!['escalated', 'human_contacted', 'reviewed_no_emergency'].includes(input.outcome) || typeof input.note !== 'string' || !input.note.trim() || input.note.length > 500 || CONTROL.test(input.note)) throw new HvacError('INVALID_URGENT_HANDLING', 'A supported outcome and human-handling note are required.');
    const now = new Date(clock()).toISOString(), item = { ...old, state: 'urgent_handled', urgentHandling: { inquiryId: id, outcome: input.outcome, note: input.note.trim(), handledBy: actor.credentialId, handledAt: now }, updatedAt: now };
    store.save(item); audit('urgent_handling_recorded', { inquiryId: id, outcome: input.outcome, urgentFlagRetained: true }, actor.credentialId); return store.get(tenantId, id);
  }
  function close(id, actor) {
    const old = owned(id);
    if (!['approved', 'urgent_handled'].includes(old.state)) throw new HvacError('INVALID_TRANSITION', 'Only an approved or human-handled urgent inquiry can be closed.', 409);
    if (old.state === 'approved' && old.approval?.draftVersion !== old.draft?.version) throw new HvacError('STALE_APPROVAL', 'The current draft does not have a valid approval.', 409);
    const now = new Date(clock()).toISOString(), item = { ...old, state: 'closed', closedAt: now, closedBy: actor.credentialId, updatedAt: now };
    store.save(item); audit('inquiry_closed', { inquiryId: id, previousState: old.state }, actor.credentialId); return store.get(tenantId, id);
  }
  const get = (id) => store.get(tenantId, id);
  const list = () => store.list(tenantId);
  const listAudit = (limit) => store.audit(tenantId, limit);
  const verifyAudit = () => store.verify(tenantId);
  const failure = (action, details, actorId) => audit(action, details, actorId);
  return { tenantId, create, update, revise, decide, handleUrgent, close, get, list, audit: listAudit, verifyAudit, failure,
    createInquiry: create, updateInquiry: update, reviseDraft: revise, recordUrgentHandling: handleUrgent, closeInquiry: close,
    getInquiry: get, listInquiries: list, listAudit, recordFailure: failure };
}

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); }
function limiter(max, windowMs, clock) {
  const buckets = new Map();
  return (key) => { const now = clock(); for (const [k, b] of buckets) if (now - b.at >= windowMs) buckets.delete(k); let b = buckets.get(key); if (!b) { b = { at: now, n: 0 }; buckets.set(key, b); } b.n += 1; if (buckets.size > 1000) buckets.delete(buckets.keys().next().value); return b.n <= max; };
}
async function readBody(req) {
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new HvacError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.', 415);
  const chunks = []; let bytes = 0, large = false;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) { large = true; chunks.length = 0; } else if (!large) chunks.push(chunk); }
  if (large) { const error = new HvacError('BODY_TOO_LARGE', 'Request body is too large.', 413); error.inputBytes = bytes; throw error; }
  let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { const error = new HvacError('INVALID_JSON', 'Invalid JSON body.'); error.inputBytes = bytes; throw error; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HvacError('INVALID_OBJECT', 'Request body must be a JSON object.');
  return { value, bytes };
}
function tokenFrom(req) { const match = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(req.headers.authorization || ''); return match ? match[1] : null; }
function client(req) { return req.socket?.remoteAddress || 'unknown'; }

export function createHvacHandler({ enabled = false, tenantId = 'hyperfya-demo', staffToken, approverToken, tokenTtlMs = 28800000, clock = Date.now, store = createMemoryStore(), publicRateLimit = 10 } = {}) {
  const service = createHvacService({ tenantId, store, clock });
  const auth = enabled ? createAuth({ tenantId, staffToken, approverToken, ttlMs: tokenTtlMs, clock }) : null;
  const publicLimit = limiter(publicRateLimit, 60000, clock), authLimit = limiter(30, 60000, clock);
  const failure = (action, details, actor) => service.failure(action, { ...details, source: details.source || 'hvac_api' }, actor);
  function authorize(req, roles, route) {
    if (!authLimit(client(req))) { failure('rate_limited', { route, reason: 'auth_rate_limit', source: 'staff_api' }); throw new HvacError('RATE_LIMITED', 'Too many requests. Try again later.', 429); }
    const result = auth.authenticate(tokenFrom(req));
    if (!result.ok) { failure('authentication_failed', { route, reason: result.reason, source: 'staff_api' }); throw new HvacError('UNAUTHORIZED', 'Authentication is required.', 401); }
    if (!roles.includes(result.principal.role) || result.principal.tenantId !== tenantId) { failure('authorization_denied', { route, role: result.principal.role, source: 'staff_api' }, result.principal.credentialId); throw new HvacError('FORBIDDEN', 'You are not authorized to perform this action.', 403); }
    return result.principal;
  }
  async function handle(req, res, url = new URL(req.url, 'http://localhost')) {
    if (!enabled) return json(res, 404, { error: 'Not found.' });
    const route = url.pathname.slice(BASE.length) || '/'; let inputBytes = 0;
    try {
      if (url.pathname !== BASE && !url.pathname.startsWith(BASE + '/')) return json(res, 404, { error: 'Not found.' });
      if (route === '/demo' && req.method === 'GET') return json(res, 200, DEMO_NOTICE);
      if (route === '/inquiries' && req.method === 'POST') {
        if (!publicLimit(client(req))) { failure('rate_limited', { route, reason: 'public_intake_rate_limit', source: 'public_form' }); return json(res, 429, { error: 'Too many requests. Try again later.' }); }
        const body = await readBody(req); inputBytes = body.bytes; const item = service.create(body.value, 'web');
        return json(res, 201, { inquiry: { id: item.id, createdAt: item.createdAt, state: item.state, serviceType: item.serviceType, urgent: item.urgent, missingFields: item.missingFields, message: 'Your fictional inquiry was received. No message was sent.' }, demo: DEMO_NOTICE });
      }
      if (route === '/inquiries' && req.method === 'GET') { authorize(req, ['staff', 'approver'], route); if (url.searchParams.has('tenantId')) throw new HvacError('TENANT_SELECTOR_NOT_ALLOWED', 'Tenant selection is not supported.'); return json(res, 200, { inquiries: service.list(), demo: DEMO_NOTICE }); }
      if (route === '/audit' && req.method === 'GET') {
        authorize(req, ['staff', 'approver'], route); if (url.searchParams.has('tenantId')) throw new HvacError('TENANT_SELECTOR_NOT_ALLOWED', 'Tenant selection is not supported.');
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 100;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new HvacError('INVALID_LIMIT', 'Audit limit must be between 1 and 100.');
        return json(res, 200, { events: service.audit(limit), integrity: { ok: service.verifyAudit(), algorithm: 'sha256-chain' }, demo: DEMO_NOTICE });
      }
      const match = /^\/inquiries\/([^/]+)(?:\/(draft|decision|urgent-handling|close))?$/.exec(route);
      if (!match) return json(res, 404, { error: 'Not found.' });
      let id; try { id = decodeURIComponent(match[1]); } catch { throw new HvacError('INVALID_ID', 'Inquiry ID is invalid.'); }
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 404, { error: 'Inquiry not found.' });
      const action = match[2] || null;
      if (!action && req.method === 'GET') { authorize(req, ['staff', 'approver'], route); const item = service.get(id); return item ? json(res, 200, { inquiry: item, demo: DEMO_NOTICE }) : json(res, 404, { error: 'Inquiry not found.' }); }
      if (!action && req.method === 'PATCH') { const actor = authorize(req, ['staff'], route); const body = await readBody(req); inputBytes = body.bytes; return json(res, 200, { inquiry: service.update(id, body.value, actor), demo: DEMO_NOTICE }); }
      if (action && req.method === 'PATCH' && action === 'draft') { const actor = authorize(req, ['staff'], route); const body = await readBody(req); inputBytes = body.bytes; if (Object.keys(body.value).some((k) => k !== 'draftText')) throw new HvacError('UNKNOWN_FIELD', 'Draft contains an unsupported field.'); return json(res, 200, { inquiry: service.revise(id, body.value.draftText, actor), demo: DEMO_NOTICE }); }
      if (action === 'decision' && req.method === 'POST') { const actor = authorize(req, ['approver'], route); const body = await readBody(req); inputBytes = body.bytes; if (Object.keys(body.value).some((k) => !['action', 'draftVersion'].includes(k))) throw new HvacError('UNKNOWN_FIELD', 'Decision contains an unsupported field.'); return json(res, 200, { inquiry: service.decide(id, body.value, actor), demo: DEMO_NOTICE }); }
      if (action === 'urgent-handling' && req.method === 'POST') { const actor = authorize(req, ['approver'], route); const body = await readBody(req); inputBytes = body.bytes; if (Object.keys(body.value).some((k) => !['outcome', 'note'].includes(k))) throw new HvacError('UNKNOWN_FIELD', 'Urgent-handling record contains an unsupported field.'); return json(res, 200, { inquiry: service.handleUrgent(id, body.value, actor), demo: DEMO_NOTICE }); }
      if (action === 'close' && req.method === 'POST') { const actor = authorize(req, ['approver'], route); const body = await readBody(req); inputBytes = body.bytes; if (Object.keys(body.value).length) throw new HvacError('UNKNOWN_FIELD', 'Close request must be empty.'); return json(res, 200, { inquiry: service.close(id, actor), demo: DEMO_NOTICE }); }
      return json(res, 405, { error: 'Method not allowed.' });
    } catch (error) {
      const source = route === '/inquiries' && req.method === 'POST' ? 'public_form' : 'staff_api';
      if (error instanceof HvacError) { failure(error.status === 409 ? 'transition_rejected' : 'request_rejected', { route, reason: error.code, inputBytes: error.inputBytes || inputBytes, source }); return json(res, error.status, { error: error.message, code: error.code }); }
      failure('operation_failed', { route, reason: 'internal_error', inputBytes, source }); return json(res, 500, { error: 'The request could not be completed.' });
    }
  }
  return Object.freeze({ handle, revokeCredential: (token) => auth ? auth.revoke(token) : false });
}
