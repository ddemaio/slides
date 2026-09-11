const UPLOAD_ENDPOINT = "https://opensuse-slides-upload.douglasdemaio.workers.dev";
const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#slide-file");
const fileLabel = document.querySelector("#file-label");
const status = document.querySelector("#status");

const themeToggle = document.querySelector("#theme-toggle");
function syncThemeToggle() {
  themeToggle.setAttribute("aria-pressed", document.documentElement.getAttribute("data-theme") === "dark");
}
syncThemeToggle();
themeToggle.addEventListener("click", () => {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (e) {}
  syncThemeToggle();
});

fileInput.addEventListener("change", () => { fileLabel.textContent = fileInput.files[0] ? fileInput.files[0].name : "Choose your slide deck"; });

function setStatus(message, isError = false) { status.className = `status${isError ? " error" : ""}`; status.innerHTML = message; }

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll("[role='tabpanel']");
const browseStatus = document.querySelector("#browse-status");
const eventGroups = document.querySelector("#event-groups");
let browseLoaded = false;

tabs.forEach((tab) => tab.addEventListener("click", () => {
  tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
  tabs.forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
  panels.forEach((panel) => panel.classList.toggle("hidden", panel.id !== tab.getAttribute("aria-controls")));
  if (tab.id === "browse-tab" && !browseLoaded) { browseLoaded = true; loadEvents(); }
}));

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function setBrowseStatus(message, isError = false) { browseStatus.className = `status${isError ? " error" : ""}`; browseStatus.textContent = message; }

async function loadEvents() {
  setBrowseStatus("Loading published decks...");
  try {
    const response = await fetch("presentations/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error("bad response");
    const data = await response.json();
    const decks = Array.isArray(data && data.decks) ? data.decks : [];
    if (decks.length === 0) {
      setBrowseStatus("No published decks yet. Publish the first one!");
      eventGroups.innerHTML = "";
      return;
    }
    browseStatus.className = "status hidden";
    renderGroups(decks);
  } catch (error) {
    setBrowseStatus("Couldn't load the deck list yet.", true);
  }
}

function renderGroups(decks) {
  const groups = new Map();
  decks.forEach((deck) => {
    const key = deck.eventKey || "other";
    const label = deck.event || "Other";
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(deck);
  });
  const sorted = [...groups.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  eventGroups.innerHTML = sorted.map(([, group]) => {
    const items = [...group.items].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    const list = items.map((deck) => `
      <li class="deck">
        <a class="deck-link" href="${deck.url}" target="_blank" rel="noreferrer">${escapeHtml(deck.title)}</a>
        <span class="deck-meta">${escapeHtml(deck.speaker)}${deck.addedAt ? ` · ${formatDate(deck.addedAt)}` : ""}</span>
      </li>`).join("");
    return `<section class="event-group">
      <h3 class="event-title">${escapeHtml(group.label)}</h3>
      <ul class="deck-list">${list}</ul>
    </section>`;
  }).join("");
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = uploadForm.querySelector("button");
  button.disabled = true;
  button.querySelector("span").textContent = "Publishing...";
  setStatus("Your upload is being reviewed to ensure your content is suitable for publishing.");
  try {
    const formData = new FormData(uploadForm);
    const response = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The upload could not be published.");
    setStatus(`Published. <a href="${result.url}" target="_blank" rel="noreferrer">Open your slides (viewable 30 seconds after upload) ↗</a><br><small>Copy that link into your talk abstract on events.opensuse.org.</small>`);
    uploadForm.reset();
    fileLabel.textContent = "Choose your slide deck";
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Publish slides";
  }
});
