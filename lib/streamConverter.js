import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';

export const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NOK', 'DKK', 'HUF'
]);

export const REQUIRED_FIELDS = ['customer_id', 'amount_cents', 'currency', 'status'];

function escapeSqlString(value) {
  return String(value ?? '').replace(/'/g, "''").replace(/\0/g, '');
}

function normalizeCurrency(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(normalized) ? normalized : null;
}

function validatePaymentRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Payment record must be a JSON object.');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      throw new Error(`Payment record is missing required field: ${field}`);
    }
  }

  if (typeof record.customer_id !== 'string' || record.customer_id.trim() === '') {
    throw new Error('customer_id must be a non-empty string.');
  }

  const amount = Number(record.amount_cents);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('amount_cents must be a safe non-negative integer.');
  }

  const currency = normalizeCurrency(record.currency);
  if (!currency) {
    throw new Error('currency must be a supported ISO-like three-letter code.');
  }

  const status = String(record.status || '').trim();
  if (!status) {
    throw new Error('status must be a non-empty string.');
  }

  if (typeof record.stripe_payment_id === 'string' && record.stripe_payment_id.trim() === '') {
    throw new Error('stripe_payment_id must be empty or a non-empty string.');
  }

  if (typeof record.legacy_payment_id === 'string' && record.legacy_payment_id.trim() === '') {
    throw new Error('legacy_payment_id must be empty or a non-empty string.');
  }

  const hasStripe = typeof record.stripe_payment_id === 'string' && record.stripe_payment_id.trim() !== '';
  const hasLegacy = typeof record.legacy_payment_id === 'string' && record.legacy_payment_id.trim() !== '';
  if (!hasStripe && !hasLegacy) {
    throw new Error('A payment record must include either stripe_payment_id or legacy_payment_id.');
  }

  return {
    ...record,
    customer_id: record.customer_id.trim(),
    currency,
    status,
    amount_cents: amount
  };
}

function parseJsonArrayDocument(input) {
  const text = typeof input === 'string' ? input : Buffer.isBuffer(input) ? input.toString('utf8') : String(input ?? '');
  let i = 0;
  let state = 'expect-array';
  let objectStart = -1;
  let objectDepth = 0;
  let inString = false;
  let escaped = false;
  let seenObject = false;
  const objects = [];

  while (i < text.length) {
    const ch = text[i];

    if (state === 'expect-array') {
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch !== '[') {
        throw new Error('Input document must be a JSON array.');
      }
      state = 'expect-value';
      i += 1;
      continue;
    }

    if (state === 'expect-value') {
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === ']') {
        return objects;
      }
      if (ch !== '{') {
        throw new Error('Top-level array entries must be JSON objects.');
      }
      objectStart = i;
      objectDepth = 0;
      inString = false;
      escaped = false;
      state = 'in-object';
      i += 1;
      continue;
    }

    if (state === 'in-object') {
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        i += 1;
        continue;
      }

      if (ch === '"') {
        inString = true;
        i += 1;
        continue;
      }

      if (ch === '{') {
        objectDepth += 1;
      } else if (ch === '}') {
        objectDepth -= 1;
        if (objectDepth < 0) {
          throw new Error('Malformed JSON object: unmatched closing brace.');
        }
        if (objectDepth === 0) {
          const segment = text.slice(objectStart, i + 1);
          objects.push(JSON.parse(segment));
          objectStart = -1;
          seenObject = true;
          state = 'after-object';
        }
      }
      i += 1;
      continue;
    }

    if (state === 'after-object') {
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === ',') {
        state = 'expect-value';
        i += 1;
        continue;
      }
      if (ch === ']') {
        return objects;
      }
      throw new Error('Unexpected token after JSON object in array.');
    }
  }

  if (state === 'in-object') {
    throw new Error('Incomplete JSON document: missing closing brace.');
  }
  if (state === 'after-object' || state === 'expect-value') {
    if (seenObject) {
      throw new Error('Incomplete JSON document: array ended without closing bracket.');
    }
  }

  throw new Error('Input document ended before a valid JSON array was complete.');
}

export function convertJsonDocumentToSql(input) {
  const records = parseJsonArrayDocument(input);
  const seen = new Set();
  let total = 0n;
  const statements = [];

  for (const record of records) {
    const valid = validatePaymentRecord(record);
    const identityKey = [valid.stripe_payment_id || valid.legacy_payment_id, valid.customer_id].join(':');
    if (seen.has(identityKey)) {
      throw new Error(`Duplicate payment identity: ${identityKey}`);
    }
    seen.add(identityKey);
    total += BigInt(valid.amount_cents);

    const columns = [
      'customer_id',
      'stripe_payment_id',
      'legacy_payment_id',
      'amount_cents',
      'currency',
      'status',
      'payment_hash'
    ];

    const values = [
      `'${escapeSqlString(valid.customer_id)}'`,
      valid.stripe_payment_id ? `'${escapeSqlString(valid.stripe_payment_id)}'` : 'NULL',
      valid.legacy_payment_id ? `'${escapeSqlString(valid.legacy_payment_id)}'` : 'NULL',
      String(valid.amount_cents),
      `'${escapeSqlString(valid.currency)}'`,
      `'${escapeSqlString(valid.status)}'`,
      `'${createHash('sha256').update(JSON.stringify(valid)).digest('hex')}'`
    ];

    statements.push(`INSERT INTO payment_import_records (${columns.join(', ')}) VALUES (${values.join(', ')});`);
  }

  return {
    recordCount: statements.length,
    totalAmountCents: total.toString(),
    statements
  };
}

export class PaymentStreamConverter extends Transform {
  constructor(options = {}) {
    super({
      readableObjectMode: false,
      writableObjectMode: false,
      highWaterMark: options.highWaterMark ?? 16 * 1024,
      allowHalfOpen: false
    });

    this.buffer = '';
    this.recordCount = 0;
    this.totalAmount = 0n;
    this.seen = new Set();
    this.finalized = false;
    this.destroyedStream = false;
  }

  _transform(chunk, _encoding, callback) {
    if (this.finalized) {
      callback(new Error('PaymentStreamConverter received data after finalization.'));
      return;
    }

    try {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      this.buffer += text;
      const parsedRecords = parseJsonArrayDocument(this.buffer);
      this.buffer = '';

      for (const record of parsedRecords) {
        const valid = validatePaymentRecord(record);
        const identityKey = [valid.stripe_payment_id || valid.legacy_payment_id, valid.customer_id].join(':');
        if (this.seen.has(identityKey)) {
          throw new Error(`Duplicate payment identity: ${identityKey}`);
        }
        this.seen.add(identityKey);
        this.totalAmount += BigInt(valid.amount_cents);
        this.recordCount += 1;

        const sql = `INSERT INTO payment_import_records (customer_id, stripe_payment_id, legacy_payment_id, amount_cents, currency, status, payment_hash) VALUES ('${escapeSqlString(valid.customer_id)}', ${valid.stripe_payment_id ? `'${escapeSqlString(valid.stripe_payment_id)}'` : 'NULL'}, ${valid.legacy_payment_id ? `'${escapeSqlString(valid.legacy_payment_id)}'` : 'NULL'}, ${valid.amount_cents}, '${escapeSqlString(valid.currency)}', '${escapeSqlString(valid.status)}', '${createHash('sha256').update(JSON.stringify(valid)).digest('hex')}');`;
        this.push(sql);
      }

      callback();
    } catch (error) {
      this.finalized = true;
      this.destroyedStream = true;
      callback(error);
    }
  }

  _flush(callback) {
    if (this.buffer.trim() !== '') {
      callback(new Error('Incomplete JSON document at end of stream.'));
      return;
    }
    this.finalized = true;
    this.push(`-- total_rows=${this.recordCount}; total_amount_cents=${this.totalAmount.toString()};\n`);
    callback();
  }
}

export function createPaymentConverter() {
  return new PaymentStreamConverter();
}

export function parseJsonArrayFragments(input) {
  return parseJsonArrayDocument(input);
}
