const REPO_OWNER = "ddemaio";
const REPO_NAME = "slides";
const REPO_BRANCH = "main";
const UPLOAD_FOLDER = "presentations";
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
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
      const extension = file.name.split(".").pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        return json({ error: "Only PDF files are accepted." }, 400);
      }
      if (file.size > MAX_BYTES) {
        return json({ error: "That file is over 25 MB. Please export a smaller deck." }, 400);
      }

      const filename = `${slugify(title) || "talk"}-${slugify(speaker) || "slides"}.${extension}`;
      const path = `${UPLOAD_FOLDER}/${filename}`;
      const endpoint = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;

      const arrayBuffer = await file.arrayBuffer();
      const content = arrayBufferToBase64(arrayBuffer);

      const sha = await getExistingSha(endpoint, env.GITHUB_TOKEN);
      const commitBody = {
        message: `Add presentation: ${title}`,
        content,
        branch: REPO_BRANCH,
        ...(sha ? { sha } : {}),
      };

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "opensuse-slides-upload",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commitBody),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        const detail = typeof result.message === "string" ? result.message : JSON.stringify(result).slice(0, 300);
        return json({ error: `GitHub returned ${response.status}: ${detail}` }, response.status);
      }

      const shareUrl = `https://${REPO_OWNER}.github.io/${REPO_NAME}/${path}`;
      return json({ url: shareUrl, filename });
    } catch (error) {
      return json({ error: error.message || "Something went wrong during the upload." }, 500);
    }
  },
};

async function getExistingSha(endpoint, token) {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "opensuse-slides-upload" },
  });
  if (!response.ok) return null;
  const result = await response.json();
  return result.sha || null;
}
