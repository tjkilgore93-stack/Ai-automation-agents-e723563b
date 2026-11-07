// merkle.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MerkleEngine } from './lib/merkleEngine.js';

test('Merkle engine cryptographic correctness', async (t) => {
  const engine = new MerkleEngine();

  await t.test('returns a stable empty-input fingerprint', () => {
    const result = engine.processRecords([], 10);
    assert.equal(result.chunkCount, 0);
    assert.equal(result.root, engine.hashLeaf(''));
  });

  await t.test('produces deterministic roots across input permutations', () => {
    const listA = [
      { payment_intent_id: 'pi_abc_123', amount_cents: '5000' },
      { payment_intent_id: 'pi_xyz_789', amount_cents: '12000' }
    ];
    const listB = [...listA].reverse();

    assert.deepEqual(engine.processRecords(listA, 1), engine.processRecords(listB, 1));
  });

  await t.test('duplicates the final node when a tree layer has an odd count', () => {
    const records = [
      { payment_intent_id: 'pi_1' },
      { payment_intent_id: 'pi_2' },
      { payment_intent_id: 'pi_3' }
    ];
    const leaves = records.map((record) => engine.hashLeaf(JSON.stringify([record])));
    const expected = engine.combineHashes(
      engine.combineHashes(leaves[0], leaves[1]),
      engine.combineHashes(leaves[2], leaves[2])
    );

    const result = engine.processRecords(records, 1);
    assert.equal(result.chunkCount, 3);
    assert.equal(result.root, expected);
  });

  await t.test('changes the root when record content is mutated', () => {
    const baseline = [{ payment_intent_id: 'pi_secure_88', amount_cents: '2000' }];
    const mutated = [{ payment_intent_id: 'pi_secure_88', amount_cents: '9999' }];

    assert.notEqual(
      engine.processRecords(baseline, 1).root,
      engine.processRecords(mutated, 1).root
    );
  });

  await t.test('uses fixed chunk boundaries after sorting', () => {
    const records = [
      { payment_intent_id: 'pi_3' },
      { payment_intent_id: 'pi_1' },
      { payment_intent_id: 'pi_2' }
    ];
    const result = engine.processRecords(records, 2);
    assert.equal(result.chunkCount, 2);
    assert.equal(records[0].payment_intent_id, 'pi_3', 'input array must not be mutated');
  });

  await t.test('rejects invalid input and unsafe chunk sizes', () => {
    assert.throws(() => engine.processRecords(null), /array/);
    assert.throws(() => engine.processRecords([], 0), /positive safe integer/);
    assert.throws(() => engine.processRecords([], -1), /positive safe integer/);
    assert.throws(() => engine.processRecords([], 1.5), /positive safe integer/);
    assert.throws(() => engine.processRecords([{}]), /payment_intent_id/);
    assert.throws(() => engine.processRecords([{ payment_intent_id: 'pi_1' }, { payment_intent_id: 'pi_1' }]), /Duplicate/);
  });
});
