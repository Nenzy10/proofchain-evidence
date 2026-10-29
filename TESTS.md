# ProofChain Evidence — Test Record

**Date:** 2026-10-29
**Environment:** Node.js v24.22.1 (global Web Crypto API — the same `crypto.subtle`
implementation family the browser app uses)
**Subject under test:** `core.js` — the exact file loaded by `index.html`. The test suite
requires it as a module; no logic is reimplemented for testing.
**Command:** `node tests/run-tests.mjs`
**Result: 12/12 passed.**

## Results

| # | Test | Outcome |
|---|---|---|
| 1 | SHA-256("abc") matches the FIPS 180-4 test vector `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` | PASS |
| 2 | SHA-256 of `ArrayBuffer("abc")` (the input type the browser passes) matches the same vector | PASS |
| 3 | SHA-256("") matches the known empty-input vector `e3b0c442…b7852b855` | PASS |
| 4 | Canonical JSON is independent of object key order | PASS |
| 5 | Receipt creation → receipt integrity OK → verifying the original file returns **MATCH** | PASS |
| 6 | **Tampered-file case:** one-character change ("abc" → "abd") changes the hash and returns **MISMATCH** (receipt itself still intact) | PASS |
| 7 | Appending a custody event extends the hash chain; integrity stays OK; original receipt object is not mutated | PASS |
| 8 | Editing a custody event's note after the fact breaks integrity (flagged at seq 2) | PASS |
| 9 | Editing the receipt core (case ID) breaks the core digest check | PASS |
| 10 | Reordering custody events breaks the chain | PASS |
| 11 | File matches but receipt was tampered → overall verdict **MISMATCH** with `fileMatch: true` (receipt-integrity failure is reported distinctly) | PASS |
| 12 | Receipt survives a JSON serialise/parse round-trip (as pasted into the Verify form) and still returns MATCH | PASS |

## Raw output

```
PASS  SHA-256("abc") matches the FIPS 180-4 test vector
PASS  SHA-256 of ArrayBuffer("abc") matches the same vector
PASS  SHA-256("") matches the known empty-hash vector
PASS  canonicalStringify is independent of object key order
PASS  createReceipt → integrity OK → verifyFile MATCH for the original file
PASS  tampered file content ("abd") produces MISMATCH
PASS  appendCustodyEvent extends the chain and integrity stays OK
PASS  editing a custody event note breaks integrity
PASS  editing the core case ID breaks the core digest
PASS  reordering custody events breaks the chain
PASS  file matches a tampered receipt → verdict MISMATCH with fileMatch true
PASS  receipt survives a JSON serialise/parse round-trip and still MATCHes

12/12 tests passed.
```

## Additional static checks

- `node --check core.js` and `node --check app.js` — both parse cleanly.
- DOM cross-check: every element ID referenced by `app.js` exists in `index.html`
  (including the dynamically addressed `tab-create` / `tab-custody` / `tab-verify` panels).

## Not covered

- No browser end-to-end run was performed in this pass (no live-browser session was used);
  the browser path uses the identical `core.js` and the standard `File.arrayBuffer()` →
  `crypto.subtle.digest` flow exercised in tests 2 and 5–6 via `ArrayBuffer` inputs.
- Very large files (multi-GB) are read fully into memory; streaming hashing is future work
  (see `docs/ARCHITECTURE.md` §5.3).
