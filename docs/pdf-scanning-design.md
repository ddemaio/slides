# Design: PDF scanning & rejection for the slides upload service

Date: 2026-09-11
Status: Approved

## Goal

Reject uploaded slide decks before they are published if they contain
malicious/active content or match a blocklisted SHA-256 hash (the mechanism
through which official CSAM hash sets can be enforced once a provider like
PhotoDNA or Thorn is onboarded).

Uploads are committed straight to `main` by the Worker via the GitHub Contents
API, so rejecting checks must run inside the Worker before that commit. CI
provides a deeper, signature-based safety net after the fact.

## Architecture

### 1. Worker-side scan (primary gate, `worker/index.js`)

Runs after the existing checks (PDF extension, ≤ 25 MB, `%PDF-` magic):

- **Structural checks**: require `%%EOF` trailer and a `/Pages` catalog entry;
  reject anything that does not look like a complete PDF.
- **Active-content token scan** (pdfid-equivalent, pure JS). Scans both the raw
  bytes and every inflated `FlateDecode` stream (via the Workers-native
  `DecompressionStream("deflate-raw")` API) for:
  `/JavaScript`, `/JS`, `/OpenAction`, `/Launch`, `/EmbeddedFile`, `/RichMedia`,
  `/AA`, `/AcroForm`, `/XFA`, `/Encrypt`, `/GoToE`, `/ImportData`, `/SubmitForm`.
  Any match → reject with a message naming the reason (JS/actions/embedded
  files/encryption). Inflating streams also defeats tokens hidden inside
  compressed object streams (`/ObjStm`).
- **Encrypted PDFs** (`/Encrypt`) are rejected outright: automated inspection
  cannot see inside them.
- **SHA-256 blocklist**: hash the file with `crypto.subtle` and compare against
  a repo-hosted `.pdf-blocklist.json`, cached in-memory with a short TTL.
  Load failure fails open (structural scan still applies) unless `REQUIRE_BLOCKLIST`
  is set. Reject with a neutral message on match.

### 2. GitHub Actions deep scan (safety net, `.github/workflows/scan-decks.yml`)

Runs on push to `main` and on PRs that touch `presentations/**` PDFs:

- `clamscan` (ClamAV) for known malwares; `pdfid.py -e` (decompresses object
  streams) for active content; `gs` check is not run (sanitization out of scope).
- Collects findings across all changed PDFs into a report; fails the job and
  opens a GitHub issue with the report so maintainers can take a deck down.

### 3. Hash blocklist file (`.pdf-blocklist.json`)

`{ version, updatedAt, note, hashes: ["sha256hex", ...] }`. Maintainers append
SHA-256 digests to hard-block a file. Official CSAM hash sets (PhotoDNA/Thorn,
when the process is onboarded via SUSE) are loaded into this list.

### 4. Content policy & docs (`README.md`)

A "Publishing & scanning" section covering: what gets rejected, how to report
or request a takedown, how to append blocklist hashes, and the honest limits of
automated CSAM detection (hash blocking + required human review until an
official service is onboarded).

## Explicit non-goals

- No brute-force text keyword or image-classification moderation.
- No upload rate limiting / authn changes.
- No change to the no-sign-in direct-publish UX (upload → live deck).
- No PR-based review flow.
- No Ghostscript sanitisation/re-distillation.

## Testing

Scanner logic is exercised in Node (Node's `DecompressionStream` matches
Workers' API) with hand-built PDF fixtures:

- clean minimal PDF → accepted
- PDF with raw `/JavaScript` / `/OpenAction` → rejected
- PDF with `/Encrypt` → rejected
- PDF with `/EmbeddedFile` hidden inside a FlateDecode object stream → rejected
- hash-blocklisted file → rejected