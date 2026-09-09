# openSUSE slides

A simple home for speakers at the openSUSE Conference, openSUSEAsia Summit, and other openSUSE events to host your slide deck and share a link on your [events.opensuse.org](https://events.opensuse.org) abstract.

Live site: <https://ddemaio.github.io/slides/>

## What it does

Speakers visit the site, fill in a short form (talk title, speaker, event), pick a **PDF** (up to 25 MB) and hit **Publish slides**. No account, GitHub login, or token is needed on their side. The site hands the file, which commits it into the `/presentations` folder of this repository and returns a public GitHub Pages link. Speaker can pastes that link into their abstract on events.opensuse.org.

### The upload path in detail

1. The speaker submits the form; the browser posts a request to the Worker.
2. The Worker validates the upload (PDF only, ≤ 25 MB) and calls the GitHub Contents API.
3. The commit lands in `/presentations/<talk-slug>-<speaker-slug>.pdf` on `main`. 

### Site features

- **openSUSE branding** Color DNA: `#42cd42`, `#20caa3`, `#d4cb1b`, `#ff5b45`.
- **Light & dark themes** The dark theme switches the accent palette to `#00c8ff`, `#a498ff`, `#42cd42` and `#d4cb1b`.
