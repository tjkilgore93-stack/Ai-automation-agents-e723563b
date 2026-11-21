import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';

export const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NOK', 'DKK', 'HUF'
]);

export const REQUIRED_FIELDS = Object.freeze([
  'customer_id',
  'amount_cents',
  'currency',
  'status'
]);

function escapeSqlString(value) {
  // SQL-standard single-quoted string literal escaping. NUL is not valid in
  // PostgreSQL text values, so remove it before quoting.
  return String(value ?? '').replace(/\0/g, '').replace(/'/g, "''");
}

function sqlStringLiteral(value) {
  return `'${escapeSqlString(value)}'`;
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
    if (!Object.hasOwn(record, field)) {
      throw new Error(`Payment record is missing required field: ${field}.`);
    }
  }

  if (typeof record.customer_id !== 'string' || record.customer_id.trim() === '') {
    throw new Error('customer_id must be a non-empty string.');
  }

  if (
    typeof record.amount_cents !== 'number' ||
    !Number.isSafeInteger(record.amount_cents) ||
    record.amount_cents < 0
  ) {
    throw new Error('amount_cents must be a safe JSON integer in non-negative minor units.');
  }

  const currency = normalizeCurrency(record.currency);
  if (!currency) {
    throw new Error('currency must be a supported ISO-style code.');
  }

  if (typeof record.status !== 'string' || record.status.trim() === '') {
    throw new Error('status must be a non-empty string.');
  }

  for (const field of ['stripe_payment_id', 'legacy_order_id']) {
    if (record[field] !== undefined && record[field] !== null && typeof record[field] !== 'string') {
      throw new Error(`${field} must be a string when provided.`);
    }
  }

  const stripe = typeof record.stripe_payment_id === 'string'
    ? record.stripe_payment_id.trim()
    : '';
  const legacy = typeof record.legacy_order_id === 'string'
    ? record.legacy_order_id.trim()
    : '';

  if (stripe === '' && legacy === '') {
    throw new Error('A payment record must include stripe_payment_id or legacy_order_id.');
  }

  return {
    customer_id: record.customer_id.trim(),
    stripe_payment_id: stripe || null,
    legacy_order_id: legacy || null,
    amount_cents: record.amount_cents,
    currency,
    status: record.status.trim()
  };
}

/**
 * Incrementally parses exactly one JSON array containing JSON objects.
 * Completed objects are returned as soon as their closing brace is read;
 * only the current object is retained in memory.
 */
class JsonArrayParser {
  constructor() {
    this.state = 'expect-array';
    this.objectText = '';
    this.objectDepth = 0;
    this.inString = false;
    this.escaped = false;
    this.canCloseArray = true;
  }

  feed(chunk) {
    const input = String(chunk ?? '');
    const records = [];

    for (let index = 0; index < input.length; index += 1) {
      const ch = input[index];

      if (this.state === 'expect-array') {
        if (/\s/.test(ch)) continue;
        if (ch !== '[') {
          throw new Error('Input document must be a JSON array.');
        }
        this.state = 'expect-value';
        this.canCloseArray = true;
        continue;
      }

      if (this.state === 'expect-value') {
        if (/\s/.test(ch)) continue;

        if (ch === ']') {
          if (!this.canCloseArray) {
            throw new Error('Trailing comma is not allowed in the JSON array.');
          }
          this.state = 'after-array-close';
          continue;
        }

        if (ch !== '{') {
          throw new Error('Top-level array entries must be JSON objects.');
        }

        this.objectText = '{';
        this.objectDepth = 1;
        this.inString = false;
        this.escaped = false;
        this.canCloseArray = false;
        this.state = 'in-object';
        continue;
      }

      if (this.state === 'in-object') {
        this.objectText += ch;

        if (this.inString) {
          if (this.escaped) {
            this.escaped = false;
          } else if (ch === '\\\\') {
            this.escaped = true;
          } else if (ch === '"') {
            this.inString = false;
          }
          continue;
        }

        if (ch === '"') {
          this.inString = true;
        } else if (ch === '{') {
          this.objectDepth += 1;
        } else if (ch === '}') {
          this.objectDepth -= 1;
          if (this.objectDepth === 0) {
            records.push(JSON.parse(this.objectText));
            this.objectText = '';
            this.state = 'after-object';
          }
        }
        continue;
      }

      if (this.state === 'after-object') {
        if (/\s/.test(ch)) continue;

        if (ch === ',') {
          this.state = 'expect-value';
          this.canCloseArray = false;
          continue;
        }

        if (ch === ']') {
          this.state = 'after-array-close';
          continue;
        }

        throw new Error('Unexpected token after object in JSON array.');
      }

      if (this.state === 'after-array-close') {
        if (/\s/.test(ch)) continue;
        throw new Error('Trailing garbage detected after JSON array.');
      }
    }

    return records;
  }

  end() {
    if (this.state === 'after-array-close') {
      return;
    }

    if (this.state === 'in-object') {
      throw new Error('Incomplete JSON document: missing closing brace.');
    }

    if (this.state === 'expect-array') {
      throw new Error('Input document must be a JSON array.');
    }

    throw new Error('Incomplete JSON document: missing closing array bracket.');
  }
}

export function parseJsonArrayFragments(input) {
  const parser = new JsonArrayParser();
  const records = parser.feed(input);
  parser.end();
  return records;
}

class PaymentRecordTracker {
  constructor() {
    this.seenStripe = new Map();
    this.seenLegacy = new Map();
    this.totalAmount = 0n;
    this.recordCount = 0;
  }

  accept(record) {
    const valid = validatePaymentRecord(record);

    if (valid.stripe_payment_id) {
      if (this.seenStripe.has(valid.stripe_payment_id)) {
        const existingCustomer = this.seenStripe.get(valid.stripe_payment_id);
        if (existingCustomer !== valid.customer_id) {
          throw new Error(
            `Conflicting stripe_payment_id for customer ${valid.customer_id}: ${valid.stripe_payment_id}`
          );
        }
        throw new Error(`Duplicate stripe_payment_id: ${valid.stripe_payment_id}`);
      }
      this.seenStripe.set(valid.stripe_payment_id, valid.customer_id);
    }

    if (valid.legacy_order_id) {
      if (this.seenLegacy.has(valid.legacy_order_id)) {
        const existingCustomer = this.seenLegacy.get(valid.legacy_order_id);
        if (existingCustomer !== valid.customer_id) {
          throw new Error(
            `Conflicting legacy_order_id for customer ${valid.customer_id}: ${valid.legacy_order_id}`
          );
        }
        throw new Error(`Duplicate legacy_order_id: ${valid.legacy_order_id}`);
      }
      this.seenLegacy.set(valid.legacy_order_id, valid.customer_id);
    }

    this.totalAmount += BigInt(valid.amount_cents);
    this.recordCount += 1;
    return valid;
  }
}

function createInsertStatement(valid) {
  const hash = createHash('sha256')
    .update(JSON.stringify(valid))
    .digest('hex');

  return `INSERT INTO payment_ledger (customer_id, stripe_payment_id, legacy_order_id, amount_cents, currency, status, payment_hash) VALUES (` +
    `${sqlStringLiteral(valid.customer_id)}, ` +
    `${valid.stripe_payment_id ? sqlStringLiteral(valid.stripe_payment_id) : 'NULL'}, ` +
    `${valid.legacy_order_id ? sqlStringLiteral(valid.legacy_order_id) : 'NULL'}, ` +
    `${valid.amount_cents}, ${sqlStringLiteral(valid.currency)}, ${sqlStringLiteral(valid.status)}, ${sqlStringLiteral(hash)});`;
}

export function convertJsonDocumentToSql(input) {
  const records = parseJsonArrayFragments(input);
  const tracker = new PaymentRecordTracker();
  const statements = ['BEGIN;'];

  for (const record of records) {
    statements.push(createInsertStatement(tracker.accept(record)));
  }

  statements.push(
    `COMMIT; -- total_rows=${tracker.recordCount}; total_amount_cents=${tracker.totalAmount.toString()};`
  );

  return {
    recordCount: tracker.recordCount,
    totalAmountCents: tracker.totalAmount.toString(),
    statements
  };
}

export class PaymentStreamConverter extends Transform {
  constructor(options = {}) {
    super({
      readableObjectMode: false,
      writableObjectMode: false,
      highWaterMark: options.highWaterMark ?? 16 * 1024
    });

    this.parser = new JsonArrayParser();
    this.decoder = new StringDecoder('utf8');
    this.tracker = new PaymentRecordTracker();
    this.startedTransaction = false;
    this.rolledBack = false;
  }

  writeRecords(records) {
    if (records.length === 0) return;

    if (!this.startedTransaction) {
      this.push('BEGIN;\n');
      this.startedTransaction = true;
    }

    for (const record of records) {
      const valid = this.tracker.accept(record);
      this.push(`${createInsertStatement(valid)}\n`);
    }
  }

  writeRollback() {
    if (this.startedTransaction && !this.rolledBack) {
      this.push('ROLLBACK;\n');
      this.rolledBack = true;
    }
  }

  _transform(chunk, _encoding, callback) {
    try {
      this.writeRecords(this.parser.feed(this.decoder.write(chunk)));
      callback();
    } catch (error) {
      this.writeRollback();
      callback(error);
    }
  }

  _flush(callback) {
    try {
      this.writeRecords(this.parser.feed(this.decoder.end()));
      this.parser.end();

      if (!this.startedTransaction) {
        this.push('BEGIN;\n');
        this.startedTransaction = true;
      }

      this.push(
        `COMMIT; -- total_rows=${this.tracker.recordCount}; total_amount_cents=${this.tracker.totalAmount.toString()};\n`
      );
      callback();
    } catch (error) {
      this.writeRollback();
      callback(error);
    }
  }
}

export function createPaymentConverter(options) {
  return new PaymentStreamConverter(options);
}
