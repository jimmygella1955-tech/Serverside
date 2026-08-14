/* ---------- state ---------- */
const DEFAULTS = { gameName: "My Roblox Game", universe: "", bridge: "http://localhost:8787", apiKey: "", demo: true };
const state = {
  settings: { ...DEFAULTS, ...JSON.parse(localStorage.getItem("sd_settings") || "{}") },
  logs: JSON.parse(localStorage.getItem("sd_logs") || "[]"),
  keys: JSON.parse(localStorage.getItem("sd_keys") || "[]"),
  scripts: JSON.parse(localStorage.getItem("sd_scripts") || "[]"),
};

/* ---------- auth guard ---------- */
if (!localStorage.getItem("sd_session")) location.href = "login.html";
const session = JSON.parse(localStorage.getItem("sd_session"));
document.getElementById("userEmail").textContent = session.email;
document.getElementById("avatar").textContent = (session.email[0] || "U").toUpperCase();

function logout() { localStorage.removeItem("sd_session"); location.href = "login.html"; }

/* ---------- navigation ---------- */
function go(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById("view-" + view).classList.remove("hidden");
  document.querySelectorAll(".side-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
}
document.querySelectorAll(".side-nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));

/* ---------- logs ---------- */
function log(level, text) {
  const entry = { t: new Date().toISOString(), level, text };
  state.logs.unshift(entry);
  state.logs = state.logs.slice(0, 200);
  localStorage.setItem("sd_logs", JSON.stringify(state.logs));
  renderLogs();
}
function renderLogs() {
  const fmt = e => `<div class="log-line log-${e.level}"><span class="log-time">${new Date(e.t).toLocaleTimeString()}</span>${escapeHtml(e.text)}</div>`;
  const mini = document.getElementById("miniLog"), full = document.getElementById("fullLog");
  if (mini) mini.innerHTML = state.logs.slice(0, 8).map(fmt).join("") || "<span class='muted'>No output yet.</span>";
  if (full) full.innerHTML = state.logs.map(fmt).join("") || "<span class='muted'>No output yet.</span>";
  document.getElementById("statCmds").textContent = state.logs.filter(l => l.level === "success").length;
}
function clearLogs() { state.logs = []; localStorage.setItem("sd_logs", "[]"); renderLogs(); }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------- editor ---------- */
const editor = document.getElementById("editor");
const gutter = document.getElementById("gutter");
function updateGutter() {
  const n = editor.value.split("\n").length;
  gutter.innerHTML = Array.from({ length: n }, (_, i) => i + 1).join("<br>");
}
editor.addEventListener("input", updateGutter);
editor.addEventListener("keydown", e => { if (e.ctrlKey && e.key === "Enter") executeScript(); });
updateGutter();

function clearEditor() { editor.value = ""; updateGutter(); }

/* ---------- command parsing (DSL -> JSON command) ---------- */
function parseCommand(code) {
  code = code.trim();
  if (!code) return null;
  if (code.startsWith("{")) { try { return JSON.parse(code); } catch { return null; } }
  const [cmd, ...rest] = code.split(/\s+/);
  const args = rest.join(" ").split(",").map(s => s.trim()).filter(Boolean);
  return { cmd: cmd.toLowerCase(), args };
}

/* ---------- execute ---------- */
async function executeScript() {
  const code = editor.value.trim();
  if (!code) { log("warn", "Editor is empty — nothing to execute."); return; }
  const command = parseCommand(code);
  if (!command) { log("error", "Could not parse command. Use DSL like 'announce hi' or JSON {'cmd':'kick','args':['Name']}"); return; }
  log("info", `→ Executing "${command.cmd}" on ${state.settings.gameName}…`);

  if (state.settings.demo) {           // demo mode: simulates a live server
    setTimeout(() => {
      log("success", `✔ Server accepted ${command.cmd}${command.args.length ? ": " + command.args.join(", ") : ""} (demo mode)`);
      document.getElementById("execStatus").textContent = "Last run: " + new Date().toLocaleTimeString();
    }, 500);
    return;
  }

  try {
    const res = await fetch(state.settings.bridge + "/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: state.settings.apiKey, command }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) { log("success", `✔ Server confirmed: ${body.confirmed || command.cmd}`); }
    else log("error", `✘ Bridge returned ${res.status}: ${body.error || "unknown error"}`);
  } catch (e) {
    log("error", `✘ Bridge unreachable (${state.settings.bridge}). Start bridge.js or enable Demo Mode in Settings.`);
  }
}

/* ---------- saved scripts ---------- */
function saveScript() {
  const code = editor.value.trim();
  if (!code) return;
  const name = prompt("Script name:", "script-" + (state.scripts.length + 1));
  if (!name) return;
  state.scripts.unshift({ name, code, ts: Date.now() });
  localStorage.setItem("sd_scripts", JSON.stringify(state.scripts));
  renderScripts();
  log("info", `Saved script "${name}".`);
}
function renderScripts() {
  const el = document.getElementById("scriptList");
  el.innerHTML = state.scripts.length ? state.scripts.map((s, i) => `
    <div class="script-item">
      <b>${escapeHtml(s.name)}</b>
      <span class="muted">${new Date(s.ts).toLocaleString()}</span>
      <div>
        <button class="btn ghost sm" onclick="loadScript(${i})">Load</button>
        <button class="btn ghost sm" onclick="deleteScript(${i})">Delete</button>
      </div>
    </div>`).join("") : "<p class='muted'>No saved scripts yet.</p>";
}
function loadScript(i) { editor.value = state.scripts[i].code; updateGutter(); go("executor"); }
function deleteScript(i) { state.scripts.splice(i, 1); localStorage.setItem("sd_scripts", JSON.stringify(state.scripts)); renderScripts(); }
renderScripts();

/* ---------- keys ---------- */
function generateKey() {
  const plan = (document.getElementById("keyPlan").value || "pro").toLowerCase();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "SS-";
  for (let i = 0; i < 20; i++) { key += chars[Math.floor(Math.random() * chars.length)]; if (i % 5 === 4 && i < 19) key += "-"; }
  const entry = { key, plan, active: false, created: Date.now() };
  state.keys.push(entry);
  localStorage.setItem("sd_keys", JSON.stringify(state.keys));
  renderKeys();
  log("info", `Generated ${plan.toUpperCase()} key ${key}`);
}
function renderKeys() {
  const el = document.getElementById("keyList");
  el.innerHTML = state.keys.length ? state.keys.map((k, i) => `
    <div class="key-item">
      <b>${k.key}</b>
      <span class="pill ${k.active ? "online" : ""}">${k.active ? "● Active" : "Unused"}</span>
      <span class="muted">${k.plan.toUpperCase()} · ${new Date(k.created).toLocaleDateString()}</span>
      <div>
        <button class="btn ghost sm" onclick="copyKey('${k.key}')">Copy</button>
        <button class="btn ghost sm" onclick="removeKey(${i})">Remove</button>
      </div>
    </div>`).join("") : "<p class='muted'>No keys generated yet.</p>";
  document.getElementById("statKeys").textContent = state.keys.filter(k => k.active).length;
}
function copyKey(k) { navigator.clipboard.writeText(k).then(() => log("info", "Key copied to clipboard.")); }
function removeKey(i) { state.keys.splice(i, 1); localStorage.setItem("sd_keys", JSON.stringify(state.keys)); renderKeys(); }
function activateKey() {
  const input = document.getElementById("activateInput").value.trim().toUpperCase();
  const k = state.keys.find(x => x.key === input);
  const msg = document.getElementById("activateMsg");
  if (!k) msg.textContent = "❌ Invalid key."; 
  else if (k.active) msg.textContent = "⚠ Key already active.";
  else { k.active = true; localStorage.setItem("sd_keys", JSON.stringify(state.keys)); renderKeys(); msg.textContent = "✅ Key activated!"; }
}
renderKeys();

/* ---------- settings ---------- */
function fillSettings() {
  document.getElementById("setGameName").value = state.settings.gameName;
  document.getElementById("setUniverse").value = state.settings.universe;
  document.getElementById("setBridge").value = state.settings.bridge;
  document.getElementById("setApiKey").value = state.settings.apiKey;
  document.getElementById("setDemo").checked = state.settings.demo;
}
function saveSettings() {
  state.settings = {
    gameName: document.getElementById("setGameName").value || DEFAULTS.gameName,
    universe: document.getElementById("setUniverse").value.trim(),
    bridge: document.getElementById("setBridge").value.trim() || DEFAULTS.bridge,
    apiKey: document.getElementById("setApiKey").value.trim(),
    demo: document.getElementById("setDemo").checked,
  };
  localStorage.setItem("sd_settings", JSON.stringify(state.settings));
  document.getElementById("settingsMsg").textContent = "✅ Settings saved.";
  document.getElementById("statGames").textContent = state.settings.universe ? "1" : "0";
  log("info", "Settings updated.");
}
fillSettings();
renderLogs();
