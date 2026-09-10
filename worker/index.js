const REPO_OWNER = "opensuse";
const REPO_NAME = "slides";
const REPO_BRANCH = "main";
const UPLOAD_FOLDER = "presentations";
const INDEX_FILE = "presentations/index.json";
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf"];

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