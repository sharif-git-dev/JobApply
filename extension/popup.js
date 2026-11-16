const DEFAULT_BASE = "http://localhost:3000";
const $ = (id) => document.getElementById(id);
const status = (text, isError = false) => {
  $("status").textContent = text;
  $("status").className = isError ? "error" : "";
};

let data = null;

const selected = () => data?.applications.find((a) => a.id === $("application").value) ?? null;

async function load() {
  const { base = DEFAULT_BASE } = await chrome.storage.local.get("base");
  $("base").value = base;
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/autofill`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    data = null;
    $("fill").disabled = true;
    status(`Can't reach JobApply at ${base}.\nStart it with "npm run dev" in the project folder, then reopen this popup.`, true);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const select = $("application");
  select.length = 1;
  for (const app of data.applications) {
    const option = new Option(`${app.title}${app.company ? ` — ${app.company}` : ""}`, app.id);
    select.add(option);
  }
  // Preselect the application whose posting lives on this site.
  try {
    const host = new URL(tab.url).hostname;
    const match = data.applications.find((a) => a.url && new URL(a.url).hostname === host);
    if (match) select.value = match.id;
  } catch {
    // Not a normal web page; leave the default.
  }
  $("fill").disabled = false;
  $("copy").disabled = !selected()?.coverLetter;
  status(data.fields.fullName ? `Ready — filling as ${data.fields.fullName}.` : "Your JobApply profile is empty. Upload your resume there first.");
}

$("application").addEventListener("change", () => {
  $("copy").disabled = !selected()?.coverLetter;
});

$("base").addEventListener("change", async () => {
  await chrome.storage.local.set({ base: $("base").value.trim() || DEFAULT_BASE });
  status("Connecting to JobApply…");
  load();
});

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(selected()?.coverLetter ?? "");
  status("Cover letter copied.");
});

$("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const target = { tabId: tab.id, allFrames: true };
  try {
    await chrome.scripting.executeScript({ target, files: ["fill.js"] });
    const results = await chrome.scripting.executeScript({
      target,
      func: (fields, coverLetter) => window.__jobApplyFill(fields, coverLetter),
      args: [data.fields, selected()?.coverLetter ?? ""],
    });
    const filled = results.flatMap((r) => r.result?.filled ?? []);
    const skipped = results.flatMap((r) => r.result?.skipped ?? []);
    if (!filled.length) {
      status("No matching empty fields found on this page. If the form is further along, open that step and try again.");
      return;
    }
    status(
      `Filled ${filled.length} field${filled.length === 1 ? "" : "s"} (outlined in green). Check them, attach your resume, then submit.` +
        (skipped.length ? `\n\nLeft for you: ${[...new Set(skipped)].slice(0, 6).join("; ")}` : ""),
    );
  } catch (err) {
    status(`Couldn't fill this page: ${err.message}`, true);
  }
});

load();
