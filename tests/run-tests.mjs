/*
 * ProofChain Evidence — test suite.
 *
 * Runs the SHIPPED core.js (the same file the browser loads) in Node,
 * using Node's global Web Crypto implementation. No reimplemented logic.
 *
 * Run:  node tests/run-tests.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire(import.meta.url);
const Core = require('../core.js');

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log('PASS  ' + name);
  } catch (e) {
    results.push(['FAIL', name + ' — ' + e.message]);
    console.log('FAIL  ' + name + '\n      ' + e.message);
  }
}

const ABC_SHA256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const FIXED_TIME = '2026-10-29T00:00:00.000Z';

/* 1 — Known SHA-256 test vector, string input (FIPS 180-4 example). */
await test('SHA-256("abc") matches the FIPS 180-4 test vector', async () => {
  assert.strictEqual(await Core.sha256Hex('abc'), ABC_SHA256);
});

/* 2 — Same vector via ArrayBuffer: the exact input type the browser uses. */
await test('SHA-256 of ArrayBuffer("abc") matches the same vector', async () => {
  const buf = new TextEncoder().encode('abc').buffer;
  assert.strictEqual(await Core.sha256Hex(buf), ABC_SHA256);
});

/* 3 — Empty input vector. */
await test('SHA-256("") matches the known empty-hash vector', async () => {
  assert.strictEqual(await Core.sha256Hex(''), EMPTY_SHA256);
});

/* 4 — Canonical JSON is key-order independent. */
await test('canonicalStringify is independent of object key order', async () => {
  const a = Core.canonicalStringify({ b: 1, a: { d: 4, c: 3 } });
  const b = Core.canonicalStringify({ a: { c: 3, d: 4 }, b: 1 });
  assert.strictEqual(a, b);
});

/* 5 — Receipt creation + integrity + file MATCH (happy path). */
let receipt;
await test('createReceipt → integrity OK → verifyFile MATCH for the original file', async () => {
  const fileHash = await Core.sha256Hex('abc');
  receipt = await Core.createReceipt({
    fileName: 'exhibit-a.txt',
    fileSize: 3,
    fileSha256: fileHash,
    caseId: '2026-CV-0142',
    actor: 'Test Custodian',
    at: FIXED_TIME,
  });
  assert.strictEqual(receipt.core.fileSha256, ABC_SHA256);
  assert.strictEqual(receipt.custodyLog.length, 1);
  assert.strictEqual(receipt.custodyLog[0].event, 'INTAKE_HASHED');
  const integrity = await Core.verifyReceiptIntegrity(receipt);
  assert.deepStrictEqual(integrity, { ok: true, problems: [] });
  const verdict = await Core.verifyFileAgainstReceipt(receipt, fileHash);
  assert.strictEqual(verdict.verdict, 'MATCH');
  assert.strictEqual(verdict.fileMatch, true);
});

/* 6 — Tampered file: one changed character must produce MISMATCH. */
await test('tampered file content ("abd") produces MISMATCH', async () => {
  const tamperedHash = await Core.sha256Hex('abd');
  assert.notStrictEqual(tamperedHash, ABC_SHA256);
  const verdict = await Core.verifyFileAgainstReceipt(receipt, tamperedHash);
  assert.strictEqual(verdict.verdict, 'MISMATCH');
  assert.strictEqual(verdict.fileMatch, false);
  assert.strictEqual(verdict.receiptIntegrity.ok, true);
});

/* 7 — Custody chain: appending events keeps integrity valid. */
await test('appendCustodyEvent extends the chain and integrity stays OK', async () => {
  const r2 = await Core.appendCustodyEvent(receipt, {
    event: 'TRANSFERRED',
    actor: 'Test Custodian',
    note: 'Handed to expert for inspection',
    at: '2026-10-29T01:00:00.000Z',
  });
  assert.strictEqual(r2.custodyLog.length, 2);
  assert.strictEqual(receipt.custodyLog.length, 1, 'original receipt must not be mutated');
  assert.strictEqual(r2.custodyLog[1].prevDigest, r2.custodyLog[0].digest);
  const integrity = await Core.verifyReceiptIntegrity(r2);
  assert.deepStrictEqual(integrity, { ok: true, problems: [] });
  receipt = r2; // continue with the extended receipt below
});

/* 8 — Tampered custody note is detected. */
await test('editing a custody event note breaks integrity', async () => {
  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.custodyLog[1].note = 'Handed to someone else entirely';
  const integrity = await Core.verifyReceiptIntegrity(tampered);
  assert.strictEqual(integrity.ok, false);
  assert.ok(integrity.problems.some((p) => p.includes('seq 2')));
});

/* 9 — Tampered core field (case ID) is detected. */
await test('editing the core case ID breaks the core digest', async () => {
  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.core.caseId = '2026-CV-9999';
  const integrity = await Core.verifyReceiptIntegrity(tampered);
  assert.strictEqual(integrity.ok, false);
  assert.ok(integrity.problems.some((p) => p.includes('Core digest mismatch')));
});

/* 10 — Reordered custody events are detected. */
await test('reordering custody events breaks the chain', async () => {
  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.custodyLog.reverse();
  const integrity = await Core.verifyReceiptIntegrity(tampered);
  assert.strictEqual(integrity.ok, false);
});

/* 11 — File matches but receipt was tampered → overall verdict MISMATCH. */
await test('file matches a tampered receipt → verdict MISMATCH with fileMatch true', async () => {
  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.custodyLog[0].actor = 'Mallory';
  const verdict = await Core.verifyFileAgainstReceipt(tampered, ABC_SHA256);
  assert.strictEqual(verdict.fileMatch, true);
  assert.strictEqual(verdict.receiptIntegrity.ok, false);
  assert.strictEqual(verdict.verdict, 'MISMATCH');
});

/* 12 — A round-trip through JSON (as pasted into the verify form) still verifies. */
await test('receipt survives a JSON serialise/parse round-trip and still MATCHes', async () => {
  const roundTripped = JSON.parse(JSON.stringify(receipt));
  const verdict = await Core.verifyFileAgainstReceipt(roundTripped, ABC_SHA256);
  assert.strictEqual(verdict.verdict, 'MATCH');
});

const failed = results.filter(([s]) => s === 'FAIL');
console.log(
  '\n' + (results.length - failed.length) + '/' + results.length + ' tests passed.'
);
if (failed.length > 0) process.exit(1);
