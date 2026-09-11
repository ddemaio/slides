const REPO_OWNER = "opensuse";
const REPO_NAME = "slides";
const REPO_BRANCH = "main";
const UPLOAD_FOLDER = "presentations";
const INDEX_FILE = "presentations/index.json";
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf"];
const MAX_INFLATED_STREAM = 64 * 1024 * 1024;
const BLOCKLIST_TTL_MS = 5 * 60 * 1000;

// Tokens that indicate active or dangerous content. This mirrors the list the
// pdfid tool flags: slide decks almost never need any of these.
const ACTIVE_TOKENS = [
  "/JavaScript",
  "/JS",
  "/OpenAction",
  "/Launch",
  "/EmbeddedFile",
  "/RichMedia",
  "/AA",
  "/AcroForm",
  "/XFA",
  "/Encrypt",
  "/GoToE",
  "/ImportData",
  "/SubmitForm",
];

let blocklistCache = null;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opensuse-slides-upload",
    "Content-Type": "application/json",
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function slugPart(value, max) {
  return slugify(value).slice(0, max).replace(/(^-|-$)/g, "");
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function looksLikePdf(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const probe = new TextDecoder().decode(bytes.subarray(0, Math.min(1024, bytes.length)));
  return probe.includes("%PDF-");
}

function stringToBase64(str) {
  return arrayBufferToBase64(new TextEncoder().encode(str));
}

function base64Decode(base64) {
  const binary = atob(String(base64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function githubFileUrl(path) {
  return `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
}

async function getFile(path, token) {
  const response = await fetch(githubFileUrl(path), {
    method: "GET",
    headers: githubHeaders(token),
  });
  if (!response.ok) return null;
  return response.json();
}

async function putFile(path, message, content, token, sha) {
  const response = await fetch(githubFileUrl(path), {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message,
      content,
      branch: REPO_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const detail = typeof result.message === "string" ? result.message : JSON.stringify(result).slice(0, 300);
    throw new Error(`GitHub returned ${response.status}: ${detail}`);
  }
}

function shareUrl(path) {
  return `https://${REPO_OWNER}.github.io/${REPO_NAME}/${path}`;
}

// --- PDF scanning ---------------------------------------------------------

function bytesToBinary(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return binary;
}

function binaryToBytes(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function isNameChar(code) {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

// Finds a token like "/JavaScript" but ignores longer names it is a prefix of
// (e.g. "/JavaScriptFoo"), which keeps false positives down.
function findToken(binary, token, start = 0) {
  let idx = start;
  while (idx !== -1) {
    const i = binary.indexOf(token, idx);
    if (i === -1) return -1;
    const next = i + token.length;
    if (!isNameChar(binary.charCodeAt(next))) return i;
    idx = next;
  }
  return -1;
}

function scanTokens(binary, origin) {
  const found = [];
  for (const token of ACTIVE_TOKENS) {
    if (findToken(binary, token) !== -1) found.push(`${token} (${origin})`);
  }
  return found;
}

// Collects the payload of every object stream that declares a FlateDecode
// filter, so the scanner can look inside compressed object and content streams.
function findFlateStreams(binary) {
  const results = [];
  const re = /\d+\s+\d+\s+obj\b([\s\S]*?)stream\r?\n/g;
  let match;
  while ((match = re.exec(binary)) !== null) {
    const dictionary = match[1];
    const isFlate = /\/FlateDecode|\/Fl\b/.test(dictionary);
    if (!isFlate) continue;
    const dataStart = re.lastIndex;
    const end = binary.indexOf("endstream", dataStart);
    if (end === -1) continue;
    results.push(binary.slice(dataStart, end));
  }
  return results;
}

async function inflateWith(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INFLATED_STREAM) throw new Error("Inflated stream too large.");
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// PDF streams are FlateDecode (RFC 1951, raw) and occasionally come with the
// zlib wrapper (RFC 1950). Try raw first; retry after stripping the EOL that
// producers commonly place before "endstream"; then try the zlib wrapper.
async function inflateFlate(bytes) {
  try {
    return await inflateWith(bytes, "deflate-raw");
  } catch {
    // fall through to retries
  }
  let end = bytes.length;
  if (end > 0 && bytes[end - 1] === 0x0a) end--;
  if (end > 0 && bytes[end - 1] === 0x0d) end--;
  if (end !== bytes.length) {
    try {
      return await inflateWith(bytes.slice(0, end), "deflate-raw");
    } catch {
      // fall through to wrapper
    }
  }
  return inflateWith(bytes, "deflate");
}

// Runs the structural and active-content checks. Returns
// { ok: true } or { ok: false, message }.
async function scanPdfActiveContent(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const binary = bytesToBinary(bytes);

  if (!/%%EOF\s*$/.test(binary)) {
    return { ok: false, message: "That file does not look like a complete, valid PDF. Please re-export your deck." };
  }
  if (!/\/Pages\b/.test(binary)) {
    return { ok: false, message: "That file does not look like a valid PDF (no page catalog). Please re-export your deck." };
  }

  const findings = scanTokens(binary, "raw");

  let decompressedBudget = 0;
  for (const data of findFlateStreams(binary)) {
    let inflated;
    try {
      inflated = await inflateFlate(binaryToBytes(data));
    } catch {
      // A stream that claims FlateDecode but cannot be inflated is suspicious,
      // but ignoring it keeps predictor-encoded streams from causing noise.
      continue;
    }
    decompressedBudget += inflated.byteLength;
    if (decompressedBudget > MAX_INFLATED_STREAM) break;
    findings.push(...scanTokens(bytesToBinary(inflated), "decompressed"));
  }

  if (findings.length > 0) {
    const unique = [...new Set(findings)];
    const joined = unique.join(", ");
    return {
      ok: false,
      message:
        "This PDF was rejected because it contains active content the site does not allow (" +
        joined +
        "). Please re-export your deck without scripts, actions or embedded files, or email the organizers for help.",
    };
  }

  return { ok: true };
}

async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Loads the repo-hosted hash blocklist and caches it briefly.
async function loadBlocklist(env) {
  const now = Date.now();
  if (blocklistCache && now - blocklistCache.fetchedAt < BLOCKLIST_TTL_MS) {
    return blocklistCache.hashes;
  }
  const path = env.BLOCKLIST_PATH || ".pdf-blocklist.json";
  const existing = await getFile(path, env.GITHUB_TOKEN);
  if (!existing) throw new Error(`Blocklist file ${path} not found.`);
  const parsed = JSON.parse(base64Decode(existing.content));
  const hashes = new Set(
    (parsed.hashes || [])
      .map((hash) => String(hash).toLowerCase().trim())
      .filter(Boolean)
  );
  blocklistCache = { fetchedAt: now, hashes };
  return hashes;
}

async function isBlocklisted(hash, env) {
  try {
    const hashes = await loadBlocklist(env);
    return hashes.has(hash);
  } catch (error) {
    if (env.REQUIRE_BLOCKLIST) {
      throw new Error("Hash blocklist is required but could not be loaded: " + error.message);
    }
    return false;
  }
}

// --- GitHub contents API --------------------------------------------------

async function updateIndex(env, entry) {
  const token = env.GITHUB_TOKEN;
  const existing = await getFile(INDEX_FILE, token);
  const index = existing
    ? JSON.parse(base64Decode(existing.content))
    : { updatedAt: new Date().toISOString(), decks: [] };

  if (!Array.isArray(index.decks)) index.decks = [];
  index.decks.push(entry);
  index.updatedAt = new Date().toISOString();

  await putFile(INDEX_FILE, "Update presentation index", stringToBase64(JSON.stringify(index, null, 2)), token, existing?.sha);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

    if (!env.GITHUB_TOKEN) return json({ error: "The upload service is not configured yet (missing token)." }, 500);

    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") return json({ error: "No file was uploaded." }, 400);

      const title = form.get("title") || "talk";
      const speaker = form.get("speaker") || "speaker";
      const event = form.get("event") || "";
      const extension = file.name.split(".").pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        return json({ error: "Only PDF files are accepted." }, 400);
      }
      if (file.size > MAX_BYTES) {
        return json({ error: "That file is over 25 MB. Please export a smaller deck." }, 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      if (!looksLikePdf(arrayBuffer)) {
        return json({ error: "Only PDF files are accepted." }, 400);
      }

      const scan = await scanPdfActiveContent(arrayBuffer);
      if (!scan.ok) return json({ error: scan.message }, 400);

      const hashHex = await sha256Hex(arrayBuffer);
      try {
        if (await isBlocklisted(hashHex, env)) {
          return json({ error: "That PDF could not be published. Please email the organizers if you believe this is an error." }, 400);
        }
      } catch (error) {
        return json({ error: error.message }, 503);
      }

      const filename = `${slugPart(event, 45) || "general"}-${slugPart(title, 45) || "talk"}-${slugPart(speaker, 30) || "slides"}.${extension}`;
      const path = `${UPLOAD_FOLDER}/${filename}`;

      const content = arrayBufferToBase64(arrayBuffer);

      const existingPdf = await getFile(path, env.GITHUB_TOKEN);
      await putFile(path, `Add presentation: ${title}`, content, env.GITHUB_TOKEN, existingPdf?.sha);

      const url = shareUrl(path);
      const addedAt = new Date().toISOString();
      const entry = {
        title,
        speaker,
        event,
        eventKey: slugify(event),
        filename,
        url,
        addedAt,
      };

      let note = null;
      try {
        await updateIndex(env, entry);
      } catch (error) {
        note = `Published, but the deck list update failed: ${error.message}`;
      }

      return json(note ? { url, filename, note } : { url, filename });
    } catch (error) {
      return json({ error: error.message || "Something went wrong during the upload." }, 500);
    }
  },
};

export { scanPdfActiveContent, sha256Hex, isBlocklisted };

// Internal hook used by the worker tests to reset the in-memory blocklist
// cache; not part of the runtime upload path.
export function resetBlocklistCache() {
  blocklistCache = null;
}