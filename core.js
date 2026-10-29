/*
 * ProofChain Evidence — core logic.
 *
 * This file is deliberately shared verbatim between the browser app
 * (loaded as a classic <script>, exposes window.ProofChainCore) and the
 * Node test suite (require()'d as a CommonJS module). What the tests
 * exercise is exactly what ships in the browser — no duplicated logic.
 *
 * Everything runs client-side. Hashing uses the Web Crypto API
 * (crypto.subtle.digest), available in all modern browsers and in
 * Node.js >= 19 as globalThis.crypto.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.ProofChainCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SCHEMA = 'proofchain-evidence-receipt/v1';
  const TOOL = { name: 'ProofChain Evidence', version: '1.0.0' };

  const CUSTODY_EVENTS = [
    'INTAKE_HASHED',
    'ACCESSED',
    'TRANSFERRED',
    'STORED',
    'COPIED',
    'VERIFIED',
    'OTHER',
  ];

  /* ------------------------------------------------------------------ */
  /* Hashing                                                             */
  /* ------------------------------------------------------------------ */

  function toBytes(data) {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    throw new TypeError('sha256Hex: unsupported data type');
  }

  /** SHA-256 of a string / ArrayBuffer / typed array, as lowercase hex. */
  async function sha256Hex(data) {
    const bytes = toBytes(data);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /* ------------------------------------------------------------------ */
  /* Canonical JSON                                                      */
  /*                                                                     */
  /* Deterministic serialisation: object keys sorted recursively,      */
  /* arrays kept in order, no whitespace. Two receipts with the same   */
  /* content always canonicalise to the same string, so digests over   */
  /* canonical JSON are stable across machines and implementations.    */
  /* ------------------------------------------------------------------ */

  function canonicalStringify(value) {
    if (value === null) return 'null';
    const t = typeof value;
    if (t === 'number' || t === 'boolean') return JSON.stringify(value);
    if (t === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(canonicalStringify).join(',') + ']';
    }
    if (t === 'object') {
      const keys = Object.keys(value).sort();
      const parts = keys.map(
        (k) => JSON.stringify(k) + ':' + canonicalStringify(value[k])
      );
      return '{' + parts.join(',') + '}';
    }
    throw new TypeError('canonicalStringify: unsupported type ' + t);
  }

  /* ------------------------------------------------------------------ */
  /* Receipts                                                            */
  /*                                                                     */
  /* A receipt binds a file's SHA-256 to a case/matter ID at a point   */
  /* in time (the "core"). coreDigest = SHA-256 of the canonical core. */
  /*                                                                     */
  /* The chain-of-custody log is a hash chain: every event's digest    */
  /* covers the core digest, the event's own fields, and the previous  */
  /* event's digest. Editing, deleting, or reordering any earlier      */
  /* event invalidates every digest after it, so tampering with the    */
  /* log is detectable by anyone holding the receipt.                  */
  /* ------------------------------------------------------------------ */

  async function custodyEventDigest(coreDigest, entrySansDigest) {
    return sha256Hex(
      canonicalStringify({
        coreDigest: coreDigest,
        seq: entrySansDigest.seq,
        event: entrySansDigest.event,
        actor: entrySansDigest.actor,
        at: entrySansDigest.at,
        note: entrySansDigest.note,
        prevDigest: entrySansDigest.prevDigest,
      })
    );
  }

  /**
   * Create a receipt for a file whose SHA-256 has already been computed.
   * input: { fileName, fileSize, fileSha256, caseId, actor, at? }
   * `at` defaults to now (ISO 8601 UTC); injectable for tests.
   */
  async function createReceipt(input) {
    const at = input.at || new Date().toISOString();
    const core = {
      fileName: String(input.fileName),
      fileSize: Number(input.fileSize),
      fileSha256: String(input.fileSha256).toLowerCase(),
      caseId: String(input.caseId || ''),
      hashedAt: at,
    };
    const coreDigest = await sha256Hex(canonicalStringify(core));

    const first = {
      seq: 1,
      event: 'INTAKE_HASHED',
      actor: String(input.actor || ''),
      at: at,
      note: 'SHA-256 computed at intake; receipt created.',
      prevDigest: coreDigest,
    };
    first.digest = await custodyEventDigest(coreDigest, first);

    return {
      schema: SCHEMA,
      tool: TOOL,
      core: core,
      coreDigest: coreDigest,
      custodyLog: [first],
    };
  }

  /**
   * Append a custody event. Returns a NEW receipt object; the input is
   * not mutated. input: { event, actor, note, at? }
   */
  async function appendCustodyEvent(receipt, input) {
    assertReceiptShape(receipt);
    const event = String(input.event || 'OTHER').toUpperCase();
    if (!CUSTODY_EVENTS.includes(event)) {
      throw new Error('Unknown custody event type: ' + event);
    }
    const prev = receipt.custodyLog[receipt.custodyLog.length - 1];
    const entry = {
      seq: receipt.custodyLog.length + 1,
      event: event,
      actor: String(input.actor || ''),
      at: input.at || new Date().toISOString(),
      note: String(input.note || ''),
      prevDigest: prev.digest,
    };
    entry.digest = await custodyEventDigest(receipt.coreDigest, entry);

    const next = JSON.parse(JSON.stringify(receipt));
    next.custodyLog.push(entry);
    return next;
  }

  /* ------------------------------------------------------------------ */
  /* Verification                                                        */
  /* ------------------------------------------------------------------ */

  function assertReceiptShape(receipt) {
    if (!receipt || typeof receipt !== 'object') {
      throw new Error('Receipt is not an object.');
    }
    if (receipt.schema !== SCHEMA) {
      throw new Error('Receipt schema is not ' + SCHEMA + '.');
    }
    if (!receipt.core || typeof receipt.core !== 'object') {
      throw new Error('Receipt is missing its core.');
    }
    if (!Array.isArray(receipt.custodyLog) || receipt.custodyLog.length === 0) {
      throw new Error('Receipt custody log is missing or empty.');
    }
  }

  /**
   * Verify a receipt's internal integrity (no file needed):
   *  - coreDigest recomputes from the core, and
   *  - every custody event's digest recomputes and links to the
   *    previous event (hash chain intact).
   * Returns { ok, problems: [string] }.
   */
  async function verifyReceiptIntegrity(receipt) {
    const problems = [];
    try {
      assertReceiptShape(receipt);
    } catch (e) {
      return { ok: false, problems: [e.message] };
    }

    const recomputedCore = await sha256Hex(canonicalStringify(receipt.core));
    if (recomputedCore !== receipt.coreDigest) {
      problems.push(
        'Core digest mismatch: the receipt core (file name, size, hash, ' +
          'case ID, timestamp) has been altered since the receipt was created.'
      );
    }

    let expectedPrev = receipt.coreDigest;
    for (let i = 0; i < receipt.custodyLog.length; i++) {
      const entry = receipt.custodyLog[i];
      if (entry.seq !== i + 1) {
        problems.push(
          'Custody log sequence broken at position ' +
            (i + 1) +
            ': expected seq ' +
            (i + 1) +
            ', found ' +
            entry.seq +
            '.'
        );
      }
      if (entry.prevDigest !== expectedPrev) {
        problems.push(
          'Custody log link broken at seq ' +
            entry.seq +
            ': prevDigest does not match the previous digest.'
        );
      }
      const recomputed = await custodyEventDigest(receipt.coreDigest, entry);
      if (recomputed !== entry.digest) {
        problems.push(
          'Custody event at seq ' +
            entry.seq +
            ' has been altered since it was recorded.'
        );
      }
      expectedPrev = entry.digest;
    }

    return { ok: problems.length === 0, problems: problems };
  }

  /**
   * Verify a file against a receipt.
   * fileSha256: hex SHA-256 of the candidate file, computed by the caller.
   * Returns {
   *   verdict: 'MATCH' | 'MISMATCH',
   *   fileMatch: bool,
   *   receiptIntegrity: { ok, problems },
   *   expectedSha256, actualSha256
   * }
   * Overall verdict is MATCH only if the file hash matches AND the
   * receipt itself is internally intact.
   */
  async function verifyFileAgainstReceipt(receipt, fileSha256) {
    const integrity = await verifyReceiptIntegrity(receipt);
    const expected = receipt && receipt.core
      ? String(receipt.core.fileSha256).toLowerCase()
      : null;
    const actual = String(fileSha256).toLowerCase();
    const fileMatch = expected !== null && expected === actual;
    return {
      verdict: fileMatch && integrity.ok ? 'MATCH' : 'MISMATCH',
      fileMatch: fileMatch,
      receiptIntegrity: integrity,
      expectedSha256: expected,
      actualSha256: actual,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function formatBytes(n) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = Number(n);
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return (i === 0 ? v.toString() : v.toFixed(2)) + ' ' + units[i];
  }

  return {
    SCHEMA: SCHEMA,
    TOOL: TOOL,
    CUSTODY_EVENTS: CUSTODY_EVENTS,
    sha256Hex: sha256Hex,
    canonicalStringify: canonicalStringify,
    createReceipt: createReceipt,
    appendCustodyEvent: appendCustodyEvent,
    verifyReceiptIntegrity: verifyReceiptIntegrity,
    verifyFileAgainstReceipt: verifyFileAgainstReceipt,
    formatBytes: formatBytes,
  };
});
