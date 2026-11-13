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
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(normalized) ? normalized : null;
}

function validatePaymentRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Payment record must be a JSON object.');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      throw new Error(`Payment record is missing required field: ${field}.`);
    }
  }

  if (typeof record.customer_id !== 'string' || record.customer_id.trim() === '') {
    throw new Error('customer_id must be a non-empty string.');
  }

  if (typeof record.amount_cents !== 'number' || !Number.isInteger(record.amount_cents) || record.amount_cents < 0) {
    throw new Error('amount_cents must be a JSON integer value in non-negative minor units.');
  }

  const currency = normalizeCurrency(record.currency);
  if (!currency) {
    throw new Error('currency must be a supported ISO-style code.');
  }

  const status = String(record.status ?? '').trim();
  if (!status) {
    throw new Error('status must be a non-empty string.');
  }

  const stripe = typeof record.stripe_payment_id === 'string' ? record.stripe_payment_id.trim() : '';
  const legacy = typeof record.legacy_order_id === 'string' ? record.legacy_order_id.trim() : '';

  if (stripe === '' && legacy === '') {
    throw new Error('A payment record must include stripe_payment_id or legacy_order_id.');
  }

  return {
    customer_id: record.customer_id.trim(),
    stripe_payment_id: stripe || null,
    legacy_order_id: legacy || null,
    amount_cents: record.amount_cents,
    currency,
    status
  };
}

class JsonArrayParser {
  constructor() {
    this.state = 'expect-array';
    this.pos = 0;
    this.buffer = '';
    this.objectStart = -1;
    this.objectDepth = 0;
    this.inString = false;
    this.escaped = false;
    this.objects = [];
    this.seenValue = false;
  }

  feed(chunk) {
    this.buffer += String(chunk ?? '');
    while (this.pos < this.buffer.length) {
      const ch = this.buffer[this.pos];

      if (this.state === 'expect-array') {
        if (/\s/.test(ch)) {
          this.pos += 1;
          continue;
        }
        if (ch !== '[') {
          throw new Error('Input document must be a JSON array.');
        }
        this.state = 'expect-value';
        this.pos += 1;
        continue;
      }

      if (this.state === 'expect-value') {
        if (/\s/.test(ch)) {
          this.pos += 1;
          continue;
        }
        if (ch === ']') {
          this.state = 'after-array-close';
          this.pos += 1;
          continue;
        }
        if (ch !== '{') {
          throw new Error('Top-level array entries must be JSON objects.');
        }
        this.objectStart = this.pos;
        this.objectDepth = 0;
        this.inString = false;
        this.escaped = false;
        this.state = 'in-object';
        this.pos += 1;
        continue;
      }

      if (this.state === 'in-object') {
        if (this.inString) {
          if (this.escaped) {
            this.escaped = false;
          } else if (ch === '\\') {
            this.escaped = true;
          } else if (ch === '"') {
            this.inString = false;
          }
          this.pos += 1;
          continue;
        }

        if (ch === '"') {
          this.inString = true;
          this.pos += 1;
          continue;
        }

        if (ch === '{') {
          this.objectDepth += 1;
        } else if (ch === '}') {
          this.objectDepth -= 1;
          if (this.objectDepth < 0) {
            throw new Error('Malformed JSON object: unmatched closing brace.');
          }
          if (this.objectDepth === 0) {
            const segment = this.buffer.slice(this.objectStart, this.pos + 1);
            this.objects.push(JSON.parse(segment));
            this.objectStart = -1;
            this.seenValue = true;
            this.state = 'after-object';
          }
        }
        this.pos += 1;
        continue;
      }

      if (this.state === 'after-object') {
        if (/\s/.test(ch)) {
          this.pos += 1;
          continue;
        }
        if (ch === ',') {
          this.state = 'expect-value';
          this.pos += 1;
          continue;
        }
        if (ch === ']') {
          this.state = 'after-array-close';
          this.pos += 1;
          continue;
        }
        throw new Error('Unexpected token after object in JSON array.');
      }

      if (this.state === 'after-array-close') {
        if (/\s/.test(ch)) {
          this.pos += 1;
          continue;
        }
        throw new Error('Trailing garbage detected after JSON array.');
      }
    }

    const complete = this.state === 'after-array-close';
    if (complete) {
      const completeObjects = this.objects.slice();
      this.objects.length = 0;
      this.resetState();
      return completeObjects;
    }

    const consumed = this.pos;
    if (consumed > 0) {
      this.buffer = this.buffer.slice(consumed);
      this.pos = 0;
    }
    return [];
  }

  resetState() {
    this.state = 'expect-array';
    this.pos = 0;
    this.buffer = '';
    this.objectStart = -1;
    this.objectDepth = 0;
    this.inString = false;
    this.escaped = false;
    this.objects = [];
    this.seenValue = false;
  }

  end() {
    if (this.state === 'in-object') {
      throw new Error('Incomplete JSON document: missing closing brace.');
    }
    if (this.state === 'expect-array' || this.state === 'expect-value' || this.state === 'after-object') {
      throw new Error('Incomplete JSON document: missing closing array bracket.');
    }
    if (this.state === 'after-array-close') {
      return this.objects;
    }
    return this.objects;
  }
}

export function parseJsonArrayFragments(input) {
  const parser = new JsonArrayParser();
  return parser.feed(input);
}

export function convertJsonDocumentToSql(input) {
  const records = parseJsonArrayFragments(input);
  const seenStripe = new Map();
  const seenLegacy = new Map();
  let totalAmount = 0n;
  const statements = ['BEGIN;'];

  for (const record of records) {
    const valid = validatePaymentRecord(record);

    if (valid.stripe_payment_id) {
      const existingCustomer = seenStripe.get(valid.stripe_payment_id);
      if (existingCustomer && existingCustomer !== valid.customer_id) {
        throw new Error(`Conflicting stripe_payment_id for customer ${valid.customer_id}: ${valid.stripe_payment_id}`);
      }
      seenStripe.set(valid.stripe_payment_id, valid.customer_id);
    }

    if (valid.legacy_order_id) {
      const existingCustomer = seenLegacy.get(valid.legacy_order_id);
      if (existingCustomer && existingCustomer !== valid.customer_id) {
        throw new Error(`Conflicting legacy_order_id for customer ${valid.customer_id}: ${valid.legacy_order_id}`);
      }
      seenLegacy.set(valid.legacy_order_id, valid.customer_id);
    }

    totalAmount += BigInt(valid.amount_cents);
    const hash = createHash('sha256').update(JSON.stringify(valid)).digest('hex');
    statements.push(
      `INSERT INTO payment_ledger (customer_id, stripe_payment_id, legacy_order_id, amount_cents, currency, status, payment_hash) VALUES (` +
      `'${escapeSqlString(valid.customer_id)}', ` +
      `${valid.stripe_payment_id ? `'${escapeSqlString(valid.stripe_payment_id)}'` : 'NULL'}, ` +
      `${valid.legacy_order_id ? `'${escapeSqlString(valid.legacy_order_id)}'` : 'NULL'}, ` +
      `${valid.amount_cents}, '${escapeSqlString(valid.currency)}', '${escapeSqlString(valid.status)}', '${hash}');`
    );
  }

  statements.push(`COMMIT; -- total_rows=${records.length}; total_amount_cents=${totalAmount.toString()};`);
  return { recordCount: records.length, totalAmountCents: totalAmount.toString(), statements };
}

export class PaymentStreamConverter extends Transform {
  constructor(options = {}) {
    super({
      readableObjectMode: false,
      writableObjectMode: false,
      highWaterMark: options.highWaterMark ?? 16 * 1024
    });
    this.parser = new JsonArrayParser();
    this.seenStripe = new Map();
    this.seenLegacy = new Map();
    this.totalAmount = 0n;
    this.recordCount = 0;
    this.startedTransaction = false;
  }

  _transform(chunk, _encoding, callback) {
    try {
      const records = this.parser.feed(chunk);
      if (records.length === 0) {
        callback();
        return;
      }

      if (!this.startedTransaction) {
        this.push('BEGIN;\n');
        this.startedTransaction = true;
      }

      for (const record of records) {
        const valid = validatePaymentRecord(record);

        if (valid.stripe_payment_id) {
          const existingCustomer = this.seenStripe.get(valid.stripe_payment_id);
          if (existingCustomer && existingCustomer !== valid.customer_id) {
            throw new Error(`Conflicting stripe_payment_id for customer ${valid.customer_id}: ${valid.stripe_payment_id}`);
          }
          this.seenStripe.set(valid.stripe_payment_id, valid.customer_id);
        }

        if (valid.legacy_order_id) {
          const existingCustomer = this.seenLegacy.get(valid.legacy_order_id);
          if (existingCustomer && existingCustomer !== valid.customer_id) {
            throw new Error(`Conflicting legacy_order_id for customer ${valid.customer_id}: ${valid.legacy_order_id}`);
          }
          this.seenLegacy.set(valid.legacy_order_id, valid.customer_id);
        }

        this.totalAmount += BigInt(valid.amount_cents);
        this.recordCount += 1;
        const hash = createHash('sha256').update(JSON.stringify(valid)).digest('hex');
        this.push(`INSERT INTO payment_ledger (customer_id, stripe_payment_id, legacy_order_id, amount_cents, currency, status, payment_hash) VALUES ('${escapeSqlString(valid.customer_id)}', ${valid.stripe_payment_id ? `'${escapeSqlString(valid.stripe_payment_id)}'` : 'NULL'}, ${valid.legacy_order_id ? `'${escapeSqlString(valid.legacy_order_id)}'` : 'NULL'}, ${valid.amount_cents}, '${escapeSqlString(valid.currency)}', '${escapeSqlString(valid.status)}', '${hash}');\n`);
      }

      callback();
    } catch (error) {
      this.push('ROLLBACK;\n');
      callback(error);
    }
  }

  _flush(callback) {
    try {
      const records = this.parser.end();
      if (records.length > 0) {
        if (!this.startedTransaction) {
          this.push('BEGIN;\n');
          this.startedTransaction = true;
        }
        for (const record of records) {
          const valid = validatePaymentRecord(record);
          if (valid.stripe_payment_id) {
            const existingCustomer = this.seenStripe.get(valid.stripe_payment_id);
            if (existingCustomer && existingCustomer !== valid.customer_id) {
              throw new Error(`Conflicting stripe_payment_id for customer ${valid.customer_id}: ${valid.stripe_payment_id}`);
            }
            this.seenStripe.set(valid.stripe_payment_id, valid.customer_id);
          }
          if (valid.legacy_order_id) {
            const existingCustomer = this.seenLegacy.get(valid.legacy_order_id);
            if (existingCustomer && existingCustomer !== valid.customer_id) {
              throw new Error(`Conflicting legacy_order_id for customer ${valid.customer_id}: ${valid.legacy_order_id}`);
            }
            this.seenLegacy.set(valid.legacy_order_id, valid.customer_id);
          }
          this.totalAmount += BigInt(valid.amount_cents);
          this.recordCount += 1;
          const hash = createHash('sha256').update(JSON.stringify(valid)).digest('hex');
          this.push(`INSERT INTO payment_ledger (customer_id, stripe_payment_id, legacy_order_id, amount_cents, currency, status, payment_hash) VALUES ('${escapeSqlString(valid.customer_id)}', ${valid.stripe_payment_id ? `'${escapeSqlString(valid.stripe_payment_id)}'` : 'NULL'}, ${valid.legacy_order_id ? `'${escapeSqlString(valid.legacy_order_id)}'` : 'NULL'}, ${valid.amount_cents}, '${escapeSqlString(valid.currency)}', '${escapeSqlString(valid.status)}', '${hash}');\n`);
        }
      }
      if (this.startedTransaction) {
        this.push(`COMMIT; -- total_rows=${this.recordCount}; total_amount_cents=${this.totalAmount.toString()};\n`);
      }
      callback();
    } catch (error) {
      this.push('ROLLBACK;\n');
      callback(error);
    }
  }
}

export function createPaymentConverter() {
  return new PaymentStreamConverter();
}
