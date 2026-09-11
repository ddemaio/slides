# openSUSE slides

A simple home for speakers at the openSUSE Conference, openSUSEAsia Summit, and other openSUSE events to host your slide deck and share a link on your [events.opensuse.org](https://events.opensuse.org) abstract.

Live site: <https://opensuse.github.io/slides/>

## What it does

Speakers visit the site, fill in a short form (talk title, speaker, event), pick a **PDF** (up to 25 MB) and hit **Publish slides**. No account, GitHub login, or token is needed on their side. The site hands the file, which commits it into the `/presentations` folder of this repository and returns a public GitHub Pages link. Speaker can pastes that link into their abstract on events.opensuse.org.

### The upload path in detail

1. The speaker submits the form; the browser posts a request to the Worker.
2. The Worker validates the upload (PDF only, ≤ 25 MB) and calls the GitHub Contents API.
3. The commit lands in `/presentations/<event-slug>-<talk-slug>-<speaker-slug>.pdf` on `main`, and the deck is added to the browseable list in `presentations/index.json`. 

### Site features

- **openSUSE branding** Color DNA: `#42cd42`, `#20caa3`, `#d4cb1b`, `#ff5b45`.
- **Light & dark themes** The dark theme switches the accent palette to `#00c8ff`, `#a498ff`, `#42cd42` and `#d4cb1b`.

## Publishing & scanning policy

Every deck is checked before it is published and scanned again in CI.

### What gets rejected at upload

The Worker rejects a PDF before it is committed if it:

- is encrypted (`/Encrypt`) — automated checks cannot see inside it;
- does not look like a complete, valid PDF (missing `%%EOF` or a page catalog);
- contains active or dangerous content, including any of:
  `/JavaScript`, `/JS`, `/OpenAction`, `/Launch`, `/EmbeddedFile`, `/RichMedia`,
  `/AA`, `/AcroForm`, `/XFA`, `/Encrypt`, `/GoToE`, `/ImportData`, `/SubmitForm`.
  Compressed object and content streams are inflated and scanned as well, so
  tokens hidden in `FlateDecode` streams are still caught;
- matches a SHA-256 hash in `.pdf-blocklist.json`.

If your deck is rejected, re-export it without scripts, actions or encryption,
or email the organizers.

### Deep scan in CI

A GitHub Actions workflow (`.github/workflows/scan-decks.yml`) runs ClamAV and
Didier Stevens' `pdfid.py` against every changed PDF on pushes to `main` and on
pull requests. If anything is flagged, the job fails and a report is filed in
the repository's issues so a maintainer can act.

### Reporting & takedown

To report an uploaded deck (illegal content, copyright, defamation, a broken
embed, …), open an issue on this repository or email the organizers. Reporting
and removal are the fastest way to fix a live problem; the automated checks are
a safety net, not a substitute for human review.

### Blocklist

`.pdf-blocklist.json` holds SHA-256 hex digests (one per string in `hashes`) of
files that must never be published. The Worker refuses any upload whose hash is
listed. This is also where official CSAM hash sets (e.g. PhotoDNA or Thorn,
once onboarded through the openSUSE/SUSE process) get loaded.

## Honest limits

Automated **CSAM / illegal-content detection** is not reliably automatable from
the upload endpoint alone. Providers such as Microsoft PhotoDNA, Thorn's Safer,
or Cloudflare's CSAM Scanning Tool require an organization application (or that
images are served through Cloudflare) and reliably only hash-match. Until such a
service is onboarded through the openSUSE/SUSE process, the controls are:
required human review of uploads, the hash blocklist above, and the takedown
path. No image-classification or keyword moderation runs on this site today.
