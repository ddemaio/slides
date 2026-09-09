# slides

A place for openSUSE Conference, Asia Summit and summit speakers to host their slides and share a link to their talk.

## How it works

- **Site** — a plain static site served by GitHub Pages from this repository.
- **Uploads** — a small Cloudflare Worker (`worker/`) accepts slide uploads from the website and commits them into `presentations/` using GitHub's Contents API. Visitors upload from the site without any GitHub account or token; the Worker holds the credential.

### The upload path

1. A speaker fills in the form on the site and picks their deck (PDF/PPT/PPTX, ≤ 25 MB).
2. The site posts the file to the Worker endpoint (`opensuse-slides-upload.douglasdemaio.workers.dev`).
3. The Worker validates the file and commits it to `presentations/<talk>-<speaker>.<ext>` in this repository.
4. The Worker returns the GitHub Pages URL for the file, which the speaker pastes into their abstract on events.opensuse.org.

## Setting up (first time)

### GitHub Pages

Go to **Settings → Pages** and deploy from the `main` branch, `/ (root)` folder.

### Upload Worker

Deploy the Worker and give it the repository credential:

```sh
cd worker
wrangler deploy                        # once
wrangler secret put GITHUB_TOKEN       # fine-grained PAT, repo: ddemaio/slides, Contents: read+write
```

The site's `UPLOAD_ENDPOINT` in `script.js` points at the Worker's `*.workers.dev` URL; update it if the Worker moves.