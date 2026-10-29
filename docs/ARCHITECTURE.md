# ProofChain Evidence — Architecture

## 1. Purpose and design goals

Legal evidence handling has a recurring, unglamorous problem: once a digital file leaves
the hands of the person who collected it, every subsequent holder is asked to *trust* that
the bytes are unchanged. ProofChain Evidence replaces that trust with a checkable
fingerprint:

- **G1 — Integrity evidence.** Produce a receipt at intake that any later party can use to
  verify the file is byte-for-byte what was received.
- **G2 — Tamper-evident custody.** Record custody events in a log whose later editing is
  detectable.
- **G3 — Zero trust in infrastructure.** No server, no account, no upload. Verification must
  be reproducible by anyone with the file, the receipt, and any SHA-256 implementation.
- **G4 — Honest claims.** The design must never overstate what cryptography establishes
  (see §5, Threat model).

## 2. System overview

The app is a static site with three layers:

| Layer | File | Responsibility |
|---|---|---|
| Presentation | `index.html`, `styles.css` | Three modes: Create receipt, Chain of custody, Verify evidence |
| Wiring | `app.js` | DOM, drag-and-drop, file reading, rendering verdicts |
| Logic | `core.js` | Hashing, canonical JSON, receipt creation, custody chaining, verification |

`core.js` is environment-agnostic (UMD): the browser loads it as a script, and the Node
test suite `require()`s the identical file. There is no server component and no network
traffic at runtime; files are read with `File.arrayBuffer()` and hashed locally.

## 3. Data formats

### 3.1 Receipt

```jsonc
{
  "schema": "proofchain-evidence-receipt/v1",
  "tool": { "name": "ProofChain Evidence", "version": "1.0.0" },
  "core": {
    "fileName": "exhibit-a.pdf",
    "fileSize": 183442,
    "fileSha256": "<64 hex chars>",
    "caseId": "2026-CV-0142",
    "hashedAt": "2026-10-29T05:41:00.000Z"   // UTC, ISO 8601
  },
  "coreDigest": "<sha256 of canonical(core)>",
  "custodyLog": [ /* hash-chained events, §3.2 */ ]
}
```

### 3.2 Canonical JSON

Digests are only meaningful if every implementation serialises identically.
`canonicalStringify` produces deterministic JSON: object keys sorted recursively (UTF-16
code-unit order), arrays in order, no insignificant whitespace, strings/numbers/booleans
per `JSON.stringify`. This is a deliberately small, auditable subset of canonicalisation —
receipts contain only strings, numbers, arrays, and plain objects, so full JCS (RFC 8785)
machinery is unnecessary.

### 3.3 Custody events and the hash chain

Each event:

```jsonc
{
  "seq": 2,
  "event": "TRANSFERRED",          // INTAKE_HASHED | ACCESSED | TRANSFERRED |
                                   // STORED | COPIED | VERIFIED | OTHER
  "actor": "J. Alvarez",           // free text: who performed the action
  "at": "2026-10-29T06:15:00.000Z",
  "note": "Handed to opposing counsel's expert",
  "prevDigest": "<digest of previous event, or coreDigest for seq 1>",
  "digest": "<see below>"
}
```

```
digest(event) = SHA-256( canonical({
  coreDigest, seq, event, actor, at, note, prevDigest
}) )
```

Because each digest covers the previous digest, the log is a chain anchored in the receipt
core. Deleting an event breaks sequence numbers and links; editing an event breaks its own
digest and therefore every subsequent link; reordering breaks links and digests.
Verification recomputes the whole chain — a log that verifies is exactly the log that was
written, in the order it was written, *provided the verifier trusts the final digest they
were given out-of-band* (see §5.3).

## 4. Verification algorithm

`verifyFileAgainstReceipt(receipt, fileSha256)`:

1. Recompute `coreDigest` from `receipt.core`; compare.
2. Walk the custody log: check `seq` continuity, `prevDigest` linkage, and recompute every
   event digest.
3. Compare the candidate file's SHA-256 with `core.fileSha256`.
4. Verdict is **MATCH** only if (1)–(3) all pass. Otherwise **MISMATCH**, with the specific
   failure surfaced (file differs vs. receipt altered vs. both) — the UI distinguishes
   "file matches but receipt was tampered" from "file differs", because the operational
   response to each is different.

## 5. Threat model — stated honestly

### 5.1 What the receipt proves

- **Integrity since hashing.** If a file's SHA-256 equals the receipt's, the file is
  byte-for-byte identical to the file that was hashed at intake (up to the collision
  resistance of SHA-256, which remains unbroken for this purpose).
- **Log tamper evidence.** A custody log that verifies is unaltered since its events were
  appended, relative to the receipt copy being checked.

### 5.2 What it does NOT prove

- **Not authorship.** The receipt does not establish who created the file.
- **Not original creation time.** `hashedAt` is the *intake* time, taken from the
  custodian's device clock. A file created yesterday and hashed today receipts as today.
  Anyone can hash an old or fabricated file and obtain a perfectly valid receipt — the
  receipt attests to the bytes, not to their provenance or truth.
- **Not content truth.** A doctored document hashes just as cleanly as a genuine one. The
  tool detects changes *after* intake; it cannot detect fabrication *before* intake.
- **Not legal admissibility.** No certification is claimed. Whether a receipt is given
  weight is a question for the relevant court and jurisdiction, and for qualified legal
  professionals — not for this software.

### 5.3 Trust assumptions and known weaknesses

- **Receipt substitution.** The hash chain is self-referential: an attacker who holds a
  file can regenerate a *complete, internally valid* receipt for a modified file. The
  defence is procedural, and standard in evidence handling: the original receipt (or at
  least its `coreDigest`) must be preserved through a channel the attacker doesn't control
  — filed with the court, emailed to opposing parties at intake, or anchored to a public
  timestamp. Verification compares against *that* receipt, not one supplied later by an
  interested party. (Public blockchain anchoring of `coreDigest` is on the roadmap
  precisely to strengthen this point.)
- **Clock trust.** Timestamps come from the local device clock and can be wrong or set
  back. They are ordering aids within the log, not trusted time. Trusted timestamping
  (RFC 3161 or blockchain anchoring) is future work.
- **Actor fields are claims.** `actor` and `note` are free text recorded by whoever appends
  the event; the chain proves the text wasn't changed afterwards, not that it was true when
  written. Signed events (custodian key pairs) are future work.
- **Client-side only.** There is no server to compromise and no evidence database to leak —
  but also no backup: losing the receipt means losing the ability to verify. Receipts
  should be stored with the case file, in at least two places.
- **File size.** Files are read fully into memory for hashing; extremely large files
  (multi-GB) may strain browser memory. Streaming/chunked hashing is future work.

### 5.4 Why SHA-256

SHA-256 is the fingerprint already used by the companion product ProofReceipt, is
implemented natively in every browser via Web Crypto, and has standard test vectors
(FIPS 180-4) that let independent parties confirm an implementation is correct — the test
suite pins the implementation to the `"abc"` vector for exactly this reason.

## 6. Testing

`tests/run-tests.mjs` runs the shipped `core.js` in Node against the same Web Crypto API:
known-answer hash vectors, receipt creation, MATCH on the original file, MISMATCH on a
one-character tamper, custody-chain extension, and detection of edited notes, edited core
fields, reordered events, and tampered receipts presented with a matching file. Current
results: [`../TESTS.md`](../TESTS.md).

## 7. Future work

1. **Public timestamp anchoring** of `coreDigest` (blockchain or RFC 3161 TSA) to remove
   clock trust and receipt-substitution risk.
2. **Signed custody events** with custodian key pairs for attributable hand-offs.
3. **Manifest receipts** for multi-file exhibits.
4. **Streaming hashing** for very large files.
