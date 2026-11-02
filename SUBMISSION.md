# DoraHacks Build Submission — BLI Legal Tech Hackathon 2
## ProofChain Evidence

Paste-ready text for the DoraHacks "Create new Build" form. Fields marked
⬜ PLACEHOLDER must be filled in at submission time.

---

## Logo

⬜ PLACEHOLDER — upload a logo image if available; otherwise use the form's default / letter option ("P").

## Project name

```
ProofChain Evidence
```

## Brief description (short tagline field)

```
SHA-256 document-integrity verification for legal evidence: fingerprint a file in the browser, issue a canonical evidence receipt with a hash-chained chain-of-custody log, and verify any file later with a clear MATCH / MISMATCH verdict. Files never leave the device.
```

## Tags

```
legaltech, evidence, sha256, document-integrity, chain-of-custody, web-crypto, privacy, open-source
```

## Project / demo URL field

⬜ PLACEHOLDER — DEMO URL: paste the live demo link here once deployed (e.g. the Netlify URL). The project also runs from any static host or local server; see the repo README.

## Add-on links (all optional in the form)

- **GitHub Repo:** ⬜ PLACEHOLDER — REPO URL: paste the public GitHub repository URL here once created (e.g. `https://github.com/Nenzy10/proofchain-evidence`).
- **Video:** ⬜ PLACEHOLDER — VIDEO URL: optional demo video link; leave empty if none.
- **Website:** https://proofreceipt.netlify.app  ← the live ProofReceipt product this entry extends. (If a dedicated ProofChain demo URL exists, prefer putting the demo in the field above and this link here.)
- **X:** *(leave empty — not used)*
- **LinkedIn:** *(leave empty unless desired)*

## Description (Markdown editor — paste everything between the fences)

```markdown
# ProofChain Evidence

**Document-integrity verification and chain-of-custody receipts for legal evidence.**

When a digital exhibit changes hands — intake, storage, expert inspection, opposing counsel — every holder is asked to trust that the bytes are unchanged. ProofChain Evidence replaces that trust with a checkable fingerprint.

## What it does

- **Create a receipt.** Drop in any file. Its SHA-256 is computed **in the browser** (Web Crypto API) and bound into a canonical evidence receipt: file name, byte size, hash, UTC timestamp, and case/matter ID. The file itself is never uploaded — there is no server at all.
- **Chain of custody.** Record each hand-off, access, storage, or verification event. Every event is **hash-chained** to the previous event and to the receipt's core digest, so editing, deleting, or reordering log entries is detectable by anyone.
- **Verify.** Paste a receipt, drop in the file, and get a clear **MATCH / MISMATCH** verdict with expected vs. actual hashes. Verification also re-checks the receipt's own integrity, so a tampered receipt is flagged even when the file itself still matches.

## How it works

1. The file is read locally and hashed with SHA-256 over its raw bytes.
2. Receipt fields are serialised with a deterministic canonical JSON encoding (keys sorted recursively), and `coreDigest = SHA-256(canonical(core))` anchors the receipt.
3. Each custody event's digest covers the core digest, the event's fields, and the previous event's digest — a hash chain anchored in the receipt.
4. Verification recomputes the file hash, the core digest, and every link in the chain. MATCH requires all of them to check out.

The codebase is small and auditable on purpose: `core.js` contains all hashing/receipt/verification logic and is shared verbatim between the browser app and the test suite. Tests pin the hash implementation to the FIPS 180-4 `"abc"` test vector, prove MATCH on an original file, MISMATCH on a one-character tamper, and detection of edited or reordered custody logs (12/12 passing).

## Honest limits

A hash proves **content integrity from the moment of hashing**. It does not prove who created a file, when it was originally created, or that its contents are true — and a receipt generated for a fabricated file is just as "valid" as one for a genuine file, because the receipt attests to bytes, not provenance. Timestamps come from the custodian's device clock. ProofChain Evidence is an **integrity-verification aid, not a court certification**, and claims no legal admissibility in any jurisdiction. The full threat model is documented in the repository (`docs/ARCHITECTURE.md`), including the receipt-substitution risk and why the original receipt must be preserved through an independent channel (public timestamp anchoring is on the roadmap).

## Why this matters

Chain-of-custody disputes and "was this document altered?" questions burn time in litigation, audits, insurance, and compliance. A zero-cost, zero-install, privacy-preserving verifier — no uploads, no accounts, reproducible by anyone with a SHA-256 tool — lowers the barrier to good evidence hygiene for small firms, solo practitioners, legal-aid organisations, and experts who today rely on trust and screenshots.

## Background

ProofChain Evidence extends **ProofReceipt** (https://proofreceipt.netlify.app), a live product that applies the same SHA-256 receipt model to delivery verification, to the legal-evidence workflow: case/matter binding, custody chaining, and adversarial verification (assume the receipt itself may be tampered with, and check it too).

## Tech

Plain HTML/CSS/JS — no build step, no backend, no paid services or APIs. Deploys as-is to any static host. MIT licensed.

## Roadmap

- Public timestamp anchoring of receipt digests (blockchain / RFC 3161) to remove clock trust and mitigate receipt substitution.
- Signed custody events with custodian key pairs.
- Manifest receipts for multi-file exhibits; streaming hashing for very large files.
```

## Team info

```
Solo project — Nenzy Brown.

Self-taught AI & blockchain builder with 5+ years of hands-on experience, based in Dubai, UAE. Founder of ProofReceipt (live SHA-256 delivery-verification product — this entry extends its receipt model to legal evidence), Cryptohost USD, Turbo USD, and PlateWallet.
```

Teammates question on the submission form: **No**.

## Contact info (private panel — required fields starred in the form)

- **Primary contact — Telegram:** `@NenzyBrown`
- **Backup contact — Email:** `njakoiemmanuel10@gmail.com`

(Discord / WhatsApp / WeChat: leave empty — not provided.)

## Terms / Participant agreement checkbox

Tick at submission.

---

## Submission checklist (not part of the form)

- [ ] Owner creates the public GitHub repo and pushes this folder (branch `main`).
- [ ] Optional: deploy the folder to Netlify (drag-and-drop or repo connect; `netlify.toml` included) and paste the demo URL above.
- [ ] Optional: record a short demo video and paste its URL above.
- [ ] Fill the three ⬜ PLACEHOLDERs (logo choice, demo URL, repo URL), paste all fields, tick the agreement, "Submit for Review".
- [ ] Safe deadline: **Oct 31, 2026** (page timeline shows Nov 1, 05:01 Dubai; organizer stated Oct 31 — submit by Oct 31).
