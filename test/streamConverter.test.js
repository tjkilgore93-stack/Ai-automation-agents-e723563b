import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentStreamConverter, convertJsonDocumentToSql, parseJsonArrayFragments } from '../lib/streamConverter.js';

function payment(overrides = {}) {
  return {
    customer_id: 'cus_test_001',
    stripe_payment_id: 'pi_test_001',
    amount_cents: 1250,
    currency: 'usd',
    status: 'paid',
    ...overrides
  };
}

function runStream(chunks) {
  const converter = new PaymentStreamConverter();
  let output = '';

  return new Promise((resolve, reject) => {
    converter.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    converter.once('error', (error) => {
      error.output = output;
      reject(error);
    });
    converter.once('end', () => resolve(output));

    for (const chunk of chunks) {
      converter.write(chunk);
    }
    converter.end();
  });
}

test('batch conversion parses valid records and calculates exact totals', () => {
  const records = [
    payment(),
    payment({
      customer_id: 'cus_test_002',
      stripe_payment_id: undefined,
      legacy_order_id: 'legacy_002',
      amount_cents: 275,
      currency: 'EUR'
    })
  ];

  const result = convertJsonDocumentToSql(JSON.stringify(records));
  assert.equal(result.recordCount, 2);
  assert.equal(result.totalAmountCents, '1525');
  assert.equal(result.statements[0], 'BEGIN;');
  assert.match(result.statements.at(-1), /total_rows=2; total_amount_cents=1525/);
  assert.equal(result.statements.filter((statement) => statement.startsWith('INSERT')).length, 2);
});

test('parser handles nested objects, arrays, escaped quotes, and braces inside strings', () => {
  const input = JSON.stringify([
    payment({ customer_id: 'cus_{"quoted"}', metadata: { nested: [1, { note: 'a } brace' }] } })
  ]);

  const records = parseJsonArrayFragments(input);
  assert.equal(records.length, 1);
  assert.equal(records[0].metadata.nested[1].note, 'a } brace');
});

test('parser rejects a trailing comma', () => {
  assert.throws(
    () => parseJsonArrayFragments(`[${JSON.stringify(payment())},]`),
    /Trailing comma/
  );
});

test('parser rejects trailing non-whitespace after the array', () => {
  assert.throws(
    () => parseJsonArrayFragments(`[${JSON.stringify(payment())}]garbage`),
    /Trailing garbage/
  );
});

test('parser rejects incomplete objects and incomplete arrays', () => {
  assert.throws(() => parseJsonArrayFragments('[{"customer_id":"cus_1"'), /missing closing brace/);
  assert.throws(() => parseJsonArrayFragments(`[${JSON.stringify(payment())}`), /missing closing array bracket/);
});

test('validation rejects unsafe integer amounts', () => {
  assert.throws(
    () => convertJsonDocumentToSql(JSON.stringify([payment({ amount_cents: Number.MAX_SAFE_INTEGER + 1 })])),
    /safe JSON integer/
  );
});

test('duplicate Stripe payment IDs are rejected even for the same customer', () => {
  const duplicate = payment({ amount_cents: 500 });
  assert.throws(
    () => convertJsonDocumentToSql(JSON.stringify([payment(), duplicate])),
    /Duplicate stripe_payment_id/
  );
});

test('duplicate legacy order IDs are rejected', () => {
  const first = payment({ stripe_payment_id: undefined, legacy_order_id: 'legacy_1' });
  const second = payment({
    customer_id: 'cus_test_002',
    stripe_payment_id: undefined,
    legacy_order_id: 'legacy_1'
  });

  assert.throws(
    () => convertJsonDocumentToSql(JSON.stringify([first, second])),
    /Conflicting legacy_order_id/
  );
});

test('SQL string values escape apostrophes and remove NUL characters', () => {
  const result = convertJsonDocumentToSql(JSON.stringify([
    payment({ customer_id: "cus_' OR 1=1 --\u0000" })
  ]));

  assert.match(result.statements[1], /'cus_'' OR 1=1 --'/);
  assert.equal(result.statements[1].includes('\u0000'), false);
});

test('stream converter accepts one-byte UTF-8 chunks and trailing whitespace in a later chunk', async () => {
  const input = JSON.stringify([payment({ customer_id: 'cus_é_日本' })]) + '  \n';
  const bytes = Buffer.from(input, 'utf8');
  const chunks = Array.from(bytes, (_byte, index) => bytes.subarray(index, index + 1));
  const output = await runStream(chunks);

  assert.match(output, /BEGIN;/);
  assert.match(output, /cus_é_日本/);
  assert.match(output, /COMMIT; -- total_rows=1; total_amount_cents=1250/);
});

test('stream converter emits inserts incrementally before the closing array bracket', async () => {
  const first = JSON.stringify(payment());
  const second = JSON.stringify(payment({
    customer_id: 'cus_test_002',
    stripe_payment_id: 'pi_test_002'
  }));

  const output = await runStream(['[', first, ',', second, ']']);
  assert.equal((output.match(/INSERT INTO payment_ledger/g) || []).length, 2);
  assert.match(output, /total_rows=2; total_amount_cents=2500/);
});

test('stream converter rolls back when the document ends before the array closes', async () => {
  const error = await runStream(['[', JSON.stringify(payment()), ',']).then(
    () => null,
    (caught) => caught
  );

  assert.ok(error);
  assert.match(error.message, /Incomplete JSON document/);
  assert.match(error.output, /BEGIN;/);
  assert.match(error.output, /INSERT INTO payment_ledger/);
  assert.match(error.output, /ROLLBACK;/);
  assert.doesNotMatch(error.output, /COMMIT;/);
});

test('empty arrays produce a committed zero-row transaction in stream mode', async () => {
  const output = await runStream(['[', ']']);
  assert.match(output, /^BEGIN;\nCOMMIT; -- total_rows=0; total_amount_cents=0;/);
});
