# slides
A place for speakers to host their slides and share a link to them.

## How it works

This is a plain static site. Publish the repository with GitHub Pages, then open the site and use **Publish slides**. The form commits the selected deck into `slides/` using GitHub's Contents API and returns a GitHub Pages link that can be pasted into an events.opensuse.org abstract.

Before publishing, update the `REPOSITORY` object in `script.js` if the site moves to another GitHub owner or repository. Speakers need a GitHub fine-grained personal access token scoped to this repository with **Contents: write** permission. The token is used in the browser for one request and is not stored.

For a simple GitHub Pages setup, go to the repository's **Settings → Pages**, select the `main` branch and the `/ (root)` folder, then save.
