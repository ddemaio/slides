const REPOSITORY = { owner: "ddemaio", name: "slides", branch: "main", folder: "slides" };
const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#slide-file");
const fileLabel = document.querySelector("#file-label");
const status = document.querySelector("#status");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll("[role='tabpanel']");

tabs.forEach((tab) => tab.addEventListener("click", () => {
  tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
  tabs.forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
  panels.forEach((panel) => panel.classList.toggle("hidden", panel.id !== tab.getAttribute("aria-controls")));
}));

fileInput.addEventListener("change", () => { fileLabel.textContent = fileInput.files[0] ? fileInput.files[0].name : "Choose your slide deck"; });
function slugify(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70); }
function setStatus(message, isError = false) { status.className = `status${isError ? " error" : ""}`; status.innerHTML = message; }
function encodeBase64(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); });
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(uploadForm); const file = formData.get("file"); const title = formData.get("title");
  const filename = `${slugify(title) || "talk"}-${slugify(formData.get("speaker")) || "slides"}.${file.name.split(".").pop().toLowerCase()}`;
  const path = `${REPOSITORY.folder}/${filename}`; const endpoint = `https://api.github.com/repos/${REPOSITORY.owner}/${REPOSITORY.name}/contents/${path}`; const button = uploadForm.querySelector("button");
  if (file.size > 25 * 1024 * 1024) { setStatus("That file is over 25 MB. Please export a smaller deck.", true); return; }
  button.disabled = true; button.querySelector("span").textContent = "Publishing..."; setStatus("Uploading your deck securely to GitHub...");
  try {
    const content = await encodeBase64(file);
    const response = await fetch(endpoint, { method: "PUT", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${formData.get("token")}` }, body: JSON.stringify({ message: `Add slides: ${title}`, content, branch: REPOSITORY.branch }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message || "GitHub could not publish that file.");
    const shareUrl = `https://${REPOSITORY.owner}.github.io/${REPOSITORY.name}/${path}`;
    setStatus(`Published. <a href="${shareUrl}" target="_blank" rel="noreferrer">Open your slides ↗</a><br><small>Copy that link into your talk abstract on events.opensuse.org.</small>`); uploadForm.reset(); fileLabel.textContent = "Choose your slide deck";
  } catch (error) { setStatus(error.message, true); } finally { button.disabled = false; button.querySelector("span").textContent = "Publish slides"; }
});

document.querySelector("#find-form").addEventListener("submit", (event) => { event.preventDefault(); const link = new FormData(event.currentTarget).get("link"); window.open(link, "_blank", "noopener,noreferrer"); });