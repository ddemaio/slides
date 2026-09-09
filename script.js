const UPLOAD_ENDPOINT = "https://opensuse-slides-upload.douglasdemaio.workers.dev";
const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#slide-file");
const fileLabel = document.querySelector("#file-label");
const status = document.querySelector("#status");

fileInput.addEventListener("change", () => { fileLabel.textContent = fileInput.files[0] ? fileInput.files[0].name : "Choose your slide deck"; });

function setStatus(message, isError = false) { status.className = `status${isError ? " error" : ""}`; status.innerHTML = message; }

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = uploadForm.querySelector("button");
  button.disabled = true;
  button.querySelector("span").textContent = "Publishing...";
  setStatus("Uploading your deck...");
  try {
    const formData = new FormData(uploadForm);
    const response = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The upload could not be published.");
    setStatus(`Published. <a href="${result.url}" target="_blank" rel="noreferrer">Open your slides ↗</a><br><small>Copy that link into your talk abstract on events.opensuse.org.</small>`);
    uploadForm.reset();
    fileLabel.textContent = "Choose your slide deck";
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Publish slides";
  }
});
