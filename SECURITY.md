# Security Policy

The openSUSE slides service publishes uploaded PDFs directly to this site. To keep visitors safe, every upload is scanned before it goes live, and again after publishing.

## What gets rejected

An upload is refused if it:

- is not a PDF, is larger than 25 MB, or is not a complete, well-formed PDF file
- contains active content: JavaScript, auto-run or launch actions, forms (AcroForm/XFA), embedded files, rich media, or form submission/import actions
- is encrypted or password-protected, since encrypted files cannot be inspected
- matches a SHA-256 hash on the project's blocklist (`.pdf-blocklist.json`)

The scanner also decompresses the streams inside the PDF, so content hidden in compressed objects is caught too. To avoid rejection, export a plain, unencrypted PDF with no scripts, forms or attachments.

## After publishing

A GitHub Actions workflow scans every new or changed deck with ClamAV and `pdfid`. If anything is found, the job fails and an issue is opened automatically so maintainers can review the deck and take it down if needed.

## Hash blocklist

Maintainers can hard-block a specific file by adding its SHA-256 digest to `.pdf-blocklist.json`. This list is also how official child sexual abuse material (CSAM) hash sets (such as PhotoDNA or Thorn) will be enforced once that service is onboarded through SUSE.

## Limits

Automated scanning is not perfect. The service does not use keyword filtering or image classification, and until an official CSAM detection service is onboarded, hash blocking only catches files already known to be harmful. Human review and community reports remain essential.

## Reporting a problem or requesting a takedown

- **Harmful or inappropriate deck:** open an issue in this repository and tag **@ddemaio** so a maintainer can remove it. Do not attach or link to illegal content in the issue itself; just identify the deck by its URL or file name.
- **Security vulnerability in the upload service:** please report it privately to the maintainers rather than in a public issue.
- **Your upload was rejected and you're unsure why:** open an issue and tag **@ddemaio**.
