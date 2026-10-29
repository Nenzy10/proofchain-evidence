# ProofChain Evidence

**Document-integrity verification and chain-of-custody receipts for legal evidence.**

ProofChain Evidence is a fully client-side web app that fingerprints an evidence file with
**SHA-256**, issues a **canonical evidence receipt** (file name, size, hash, UTC timestamp,
case/matter ID), and maintains a **hash-chained chain-of-custody log**. Anyone holding a
receipt can later re-hash the file and get a clear **MATCH / MISMATCH** verdict — proof that
the file's contents have not changed since the moment it was hashed.

Built for the **BLI Legal Tech Hackathon 2** (Blockchain Legal Institute) on DoraHacks.
It extends [ProofReceipt](https://proofreceipt.netlify.app) — a live SHA-256
delivery-verification product — to legal evidence handling.

> **Honest scope:** a hash proves *content integrity from the moment of hashing*. It does not
> prove who created a file, when it was originally created, or that its contents are true.
> ProofChain Evidence is an integrity-verification aid. It is **not** a court certification
> and makes no claim that its receipts are legally admissible in any jurisdiction.

## Features

- **Create receipt** — drop in any file; its SHA-256 is computed in the browser (Web Crypto
  API) and bound into a receipt with the case/matter ID and timestamp. The file itself never
  leaves the device.
- **Chain of custody** — record hand-offs, access, storage, and verification events. Each
  event is hash-chained to the previous event and to the receipt core, so editing, deleting,
  or reordering log entries is detectable.
- **Verify** — paste a receipt, drop the evidence file, and get a MATCH / MISMATCH verdict,
  with the expected vs. actual hashes shown. Verification also re-checks the receipt's own
  integrity, so a tampered receipt is flagged even if the file itself matches.
- **Zero backend, zero cost** — plain HTML/CSS/JS, no build step, no APIs, no accounts.
  Works offline once loaded.

## How it works

1. **Intake hashing.** The browser reads the file and computes SHA-256 via
   `crypto.subtle.digest`. Hashing is done over the file's raw bytes.
2. **Canonical receipt.** Receipt fields are serialised with a deterministic canonical JSON
   encoding (object keys sorted recursively). `coreDigest = SHA-256(canonical(core))`
   anchors the receipt's core: file name, byte size, file hash, case ID, timestamp.
3. **Hash-chained custody log.** Each custody event's digest covers the core digest, the
   event's own fields, and the previous event's digest (`prevDigest`), forming a chain.
   Tampering with any earlier entry invalidates every later digest.
4. **Verification.** The candidate file is re-hashed and compared to the receipt; the core
   digest and every link in the custody chain are recomputed. Verdict is MATCH only if the
   file matches *and* the receipt is internally intact.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and an honestly
stated threat model.

## Run it locally

No build step and no dependencies:

```bash
# any static file server works, e.g.:
npx serve .
# or
python3 -m http.server 8000
```

Then open the served `index.html` in a browser. (Serve over HTTP rather than opening the
file via `file://` — Web Crypto requires a secure context; `localhost` counts.)

## Deploy (Netlify)

The repo deploys as-is: drag the folder into Netlify, or connect the repo — `netlify.toml`
sets the publish directory to the project root. No build command, no environment variables.

## Tests

The exact `core.js` shipped to the browser is exercised in Node (which provides the same
Web Crypto API):

```bash
node tests/run-tests.mjs
```

12 tests cover the FIPS 180-4 SHA-256 test vector (`"abc"` →
`ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`), receipt creation,
MATCH on the original file, MISMATCH on a one-character tamper, custody-chain extension,
and detection of edited/reordered custody events and edited receipt cores. Results are
recorded in [`TESTS.md`](TESTS.md).

## Project layout

```
index.html            app shell (Create / Custody / Verify modes)
styles.css            styling (no frameworks, no webfonts)
core.js               all receipt/hash/verify logic — shared by browser and tests
app.js                DOM wiring only
docs/ARCHITECTURE.md  design + threat model
tests/run-tests.mjs   Node test suite against core.js
SUBMISSION.md         DoraHacks Build form text (submission copy)
netlify.toml          Netlify config (publish root, no build)
```

## Roadmap (post-hackathon)

- Optional anchoring of receipt digests to a public blockchain timestamping service, so a
  receipt's existence at a point in time is provable to third parties without trusting the
  custodian's clock.
- Batch intake for multi-file exhibits with a single manifest receipt.
- Signed custody events (custodian key pairs) so events are attributable, not just ordered.

## Author

Nenzy Brown — self-taught AI & blockchain builder, 5+ years. Founder of ProofReceipt
(live, SHA-256 delivery verification) and other ventures. Contact: Telegram
[@NenzyBrown](https://t.me/NenzyBrown).

## License

MIT — see [`LICENSE`](LICENSE).
