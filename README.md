# openSUSE slides

A simple home for speakers at the openSUSE Conference, Asia Summit, and other openSUSE summits to host their slide decks and share a link from their talk page on [events.opensuse.org](https://events.opensuse.org).

Live site: <https://ddemaio.github.io/slides/>

## What it does

Speakers visit the site, fill in a short form (talk title, speaker, event), pick a **PDF** (up to 25 MB) and hit **Publish slides**. No account, GitHub login, or token is needed on their side. The site hands the file to a Cloudflare Worker, which commits it into the `presentations/` folder of this repository and returns a public GitHub Pages link. The speaker pastes that link into their abstract on events.opensuse.org.

### The upload path in detail

1. The speaker submits the form; the browser posts a `multipart/form-data` request to the Worker.
2. The Worker validates the upload (PDF only, ≤ 25 MB) and calls the GitHub Contents API.
3. The commit lands in `presentations/<talk-slug>-<speaker-slug>.pdf` on `main`. Re-uploading with the same talk title and speaker overwrites the existing file.
4. The Worker returns `https://ddemaio.github.io/slides/presentations/...`, which the site shows as the shareable link.

### Site features

- **Static and dependency-free** — plain HTML, CSS and JavaScript. No build step, no npm, no Ruby.
- **openSUSE branding** — follows the [openSUSE Adaptive Branding](https://douglasdemaio.github.io/opensuse-branding/) Color DNA: `#42cd42`, `#20caa3`, `#d4cb1b`, `#ff5b45`.
- **Light & dark themes** — a sun/moon toggle in the header. The choice is saved to `localStorage`; first-time visitors follow their OS preference (`prefers-color-scheme`). The dark theme switches the accent palette to `#00c8ff`, `#a498ff`, `#42cd42` and `#d4cb1b`.

## Repository layout

```
├── index.html      # the site, served by GitHub Pages
├── styles.css      # theming and layout (light + dark)
├── script.js       # form handling + theme toggle
├── presentations/  # speaker decks, committed here by the Worker
└── worker/         # Cloudflare Worker that accepts uploads
    ├── index.js
    └── wrangler.jsonc
```

## Setting up

### 1. GitHub Pages

Repository **Settings → Pages**, set **Source** to *Deploy from a branch*, select `main` and `/ (root)`, then save. The site is served at `https://<owner>.github.io/slides/`.

### 2. Upload Worker

Prerequisites: [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`) and a Cloudflare account.

```sh
cd worker
wrangler login
wrangler deploy
```

The Worker needs a GitHub token so it can commit on behalf of visitors. Create a **fine-grained personal access token**:

- GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
- Resource owner: the account that owns this repository
- Repository access: *Only select repositories* → this repository
- Permissions → Repository permissions → **Contents: Read and write**
- (Metadata is always *Read-only*, which is fine.)

Store it as a Cloudflare secret — never in code:

```sh
wrangler secret put GITHUB_TOKEN
```

Paste the token when prompted. Deploy once more so the deployed Worker carries the secret:

```sh
wrangler deploy
```

The Worker is then live (e.g. at `https://opensuse-slides-upload.douglasdemaio.workers.dev`).

### 3. Point the site at the Worker

`UPLOAD_ENDPOINT` in `script.js` holds the Worker URL. It is already set for the deployed Worker; change it if you deploy under a different account, project name, or a custom domain. The Worker allows cross-origin requests (CORS) so any Pages URL can talk to it.

## Configuration reference

| Constant | File | Meaning |
| --- | --- | --- |
| `UPLOAD_ENDPOINT` | `script.js` | URL of the upload Worker |
| `REPO_OWNER`, `REPO_NAME`, `REPO_BRANCH` | `worker/index.js` | Target repository for commits |
| `UPLOAD_FOLDER` | `worker/index.js` | Folder inside the repo where decks are stored (`presentations`) |
| `MAX_BYTES` | `worker/index.js` | Maximum file size (25 MB) |
| `ALLOWED_EXTENSIONS` | `worker/index.js` | Accepted file types (`pdf`) |
| `GITHUB_TOKEN` | Cloudflare secret | The fine-grained PAT used to commit |