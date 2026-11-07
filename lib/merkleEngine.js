// lib/merkleEngine.js
import crypto from 'node:crypto';

export class MerkleEngine {
  /**
   * Generates a SHA-256 hash from a string payload.
   * @param {string} data
   * @returns {string}
   */
  hashLeaf(data) {
    if (typeof data !== 'string') {
      throw new TypeError('Merkle leaf payload must be a string.');
    }
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Combines and hashes a pair of tree nodes.
   * @param {string} left
   * @param {string} right
   * @returns {string}
   */
  combineHashes(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') {
      throw new TypeError('Merkle nodes must be hexadecimal hash strings.');
    }
    return crypto.createHash('sha256').update(left + right, 'utf8').digest('hex');
  }

  /**
   * Sorts records by payment_intent_id, hashes fixed-size chunks, and
   * combines chunk hashes into a balanced Merkle root. Odd nodes are
   * paired with a duplicate of themselves at each tree level.
   *
   * This is an in-memory integrity fingerprint, not a streaming parser,
   * database migration, or proof that records were durably persisted.
   *
   * @param {Array<object>} records
   * @param {number} chunkSize
   * @returns {{root: string, chunkCount: number}}
   */
  processRecords(records, chunkSize = 1000) {
    if (!Array.isArray(records)) {
      throw new TypeError('Records must be an array.');
    }
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('Chunk size must be a positive safe integer.');
    }
    if (records.length === 0) {
      return { root: this.hashLeaf(''), chunkCount: 0 };
    }

    const seenIds = new Set();
    const sortedRecords = records.map((record, index) => {
      if (record === null || typeof record !== 'object' || Array.isArray(record)) {
        throw new TypeError(`Record at index ${index} must be an object.`);
      }
      if (typeof record.payment_intent_id !== 'string' || record.payment_intent_id.length === 0) {
        throw new TypeError(`Record at index ${index} must have a non-empty payment_intent_id.`);
      }
      if (seenIds.has(record.payment_intent_id)) {
        throw new Error(`Duplicate payment_intent_id: ${record.payment_intent_id}`);
      }
      seenIds.add(record.payment_intent_id);
      return record;
    });

    // Use code-point ordering rather than locale-dependent collation.
    sortedRecords.sort((a, b) => (
      a.payment_intent_id < b.payment_intent_id ? -1 :
      a.payment_intent_id > b.payment_intent_id ? 1 : 0
    ));

    const chunkHashes = [];
    for (let i = 0; i < sortedRecords.length; i += chunkSize) {
      const chunk = sortedRecords.slice(i, i + chunkSize);
      const serializedChunk = JSON.stringify(chunk);
      if (typeof serializedChunk !== 'string') {
        throw new TypeError('Payment records must be JSON-serializable.');
      }
      chunkHashes.push(this.hashLeaf(serializedChunk));
    }

    const chunkCount = chunkHashes.length;
    let currentLayer = chunkHashes;

    while (currentLayer.length > 1) {
      const nextLayer = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = currentLayer[i + 1] ?? left;
        nextLayer.push(this.combineHashes(left, right));
      }
      currentLayer = nextLayer;
    }

    return { root: currentLayer[0], chunkCount };
  }
}
