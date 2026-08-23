const config = window.KAACK_CONFIG || {};
const apiBase = (config.apiBase || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const GENERAL_OPTIONS_KEY = "kaack-cloud-builder.general-options";
const DEFAULT_FIRMWARE_LINE = "kaack";
const DEFAULT_KAACK_RELEASE = "kaack-4.5.3-v19";
const state = { catalog: null, options: null, releases: [], targets: [], firmwareLine: DEFAULT_FIRMWARE_LINE, live: false, selected: new Set(), build: null };

const fallback = async () => (await fetch("data/catalog.json")).json();
const api = async (path, init) => { const response = await fetch(`${apiBase}${path}`, init); if (!response.ok) throw new Error(`API ${response.status}`); return response.json(); };

async function loadCatalog() {
  try { state.catalog = await api("/api/catalog"); state.live = state.catalog.mode === "live"; }
  catch { state.catalog = await fallback(); state.live = false; }
  renderCatalog();
  if (state.live && $('target').value) await loadTargetReleases($('target').value);
  await loadOptions($('version').value);
}

function firmwareLines() {
  if (Array.isArray(state.catalog?.firmwareLines)) return state.catalog.firmwareLines;
  return (state.catalog?.firmware || []).map((line) => ({
    id: String(line.id || "kaack").toLowerCase(),
    label: line.label || line.id,
    releases: state.catalog?.releases || [],
    targets: state.catalog?.targets || []
  }));
}
function selectedLine() { return firmwareLines().find((line) => line.id === state.firmwareLine) || firmwareLines()[0]; }

function renderCatalog() {
  const catalog = state.catalog;
  const lines = firmwareLines();
  state.firmwareLine = lines.find((line) => line.id === DEFAULT_FIRMWARE_LINE)?.id || lines[0]?.id || DEFAULT_FIRMWARE_LINE;
  $('firmware').innerHTML = lines.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)}</option>`).join("");
  $('firmware').value = state.firmwareLine;
  renderLine();
  $('firmware').addEventListener('change', async () => {
    state.firmwareLine = $('firmware').value;
    renderLine();
    if (state.live && $('target').value) await loadTargetReleases($('target').value);
    await loadOptions($('version').value);
    updateRecipe();
  });
}

function renderLine() {
  const line = selectedLine();
  state.targets = line?.targets || [];
  $('target').innerHTML = state.targets.map((x) => `<option value="${escapeHtml(x.target)}">${escapeHtml(x.target)} · ${escapeHtml(x.manufacturer || "Unknown")}</option>`).join("");
  const preferredTarget = state.targets.find((x) => x.target === "HDZERO_HALO") || state.targets.find((x) => x.target === "KAKUTEH7") || state.targets[0];
  $('target').value = preferredTarget?.target || "";
  renderTarget();
  renderReleases(line?.releases || []);
  $('connectionBadge').className = `status-pill ${state.live ? "live" : "demo"}`;
  $('connectionBadge').innerHTML = `<i></i> ${state.live ? "Live catalog" : "Demo mode"}`;
}

function renderReleases(releases) {
  const usable = releases.filter((x) => x.cloudBuild !== false && !x.withdrawn);
  $('version').innerHTML = usable.map((x) => `<option value="${escapeHtml(x.release)}">${escapeHtml(x.label || `${x.release} · ${x.type || "Release"}`)}</option>`).join("");
  if (!usable.length) $('version').innerHTML = `<option value="">No cloud-build releases</option>`;
  state.releases = usable;
  $('version').value = usable.find((x) => x.release === DEFAULT_KAACK_RELEASE)?.release || usable.find((x) => x.release === "4.5.3")?.release || usable[0]?.release || "";
  renderReleaseMeta();
}

async function loadOptions(release) {
  if (!release) return;
  try { state.options = await api(`/api/options?release=${encodeURIComponent(release)}`); }
  catch { state.options = state.catalog.options; }
  renderOptions();
}
async function loadTargetReleases(target) {
  try { const detail = await api(`/api/targets/${encodeURIComponent(target)}?firmware=${encodeURIComponent(state.firmwareLine)}`); renderReleases(detail.releases || []); }
  catch { renderReleases(selectedLine()?.releases || []); }
}

function renderOptions() {
  const opts = state.options || {};
  const telemetryOptions = [...(opts.telemetryProtocols || [])];
  if (!telemetryOptions.some((x) => x.value === "USE_TELEMETRY_CRSF")) telemetryOptions.unshift({ name: "Crossfire (CRSF)", value: "USE_TELEMETRY_CRSF", default: true });
  const osdOptions = (opts.osdProtocols || (opts.generalOptions || []).filter((x) => x.group === "OSD")).map((x) => ({ ...x, name: x.groupedName || x.name?.replace(/^OSD \((.*)\)$/, "$1") }));
  fillSelect('radioProtocol', opts.radioProtocols || [], 'USE_SERIALRX_CRSF');
  fillSelect('telemetryProtocol', telemetryOptions, 'USE_TELEMETRY_CRSF');
  fillSelect('motorProtocol', opts.motorProtocols || [], 'USE_DSHOT');
  fillSelect('osdProtocol', osdOptions, 'USE_OSD_HD');
  const savedFlags = readGeneralOptions();
  const generalOptions = (opts.generalOptions || []).filter((x) => !x.group);
  $('generalOptions').innerHTML = generalOptions.map((x) => { const label = x.value === "USE_RACE_PRO" ? "Race Pro (optional)" : x.name; const checked = savedFlags ? savedFlags.includes(x.value) : x.default; return `<label class="check"><input type="checkbox" data-flag="${escapeHtml(x.value)}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`; }).join("");
  state.selected = new Set([...document.querySelectorAll('[data-flag]:checked')].flatMap((x) => x.dataset.flag.split(" ")));
  document.querySelectorAll('[data-flag]').forEach((x) => x.addEventListener('change', () => { persistGeneralOptions(); updateRecipe(); }));
  ['radioProtocol','telemetryProtocol','motorProtocol','osdProtocol'].forEach((id) => $(id).addEventListener('change', updateRecipe));
  updateRecipe();
}

function fillSelect(id, options, preferredValue) {
  const selected = options.find((x) => x.value === preferredValue)?.value || options.find((x) => x.default)?.value || options[0]?.value;
  $(id).innerHTML = options.map((x) => `<option value="${escapeHtml(x.value)}" ${x.value === selected ? "selected" : ""}>${escapeHtml(x.name || x.label || x.value || "None")}</option>`).join("");
}

function readGeneralOptions() { try { const saved = JSON.parse(localStorage.getItem(GENERAL_OPTIONS_KEY)); return Array.isArray(saved) ? saved : null; } catch { return null; } }
function persistGeneralOptions() { try { localStorage.setItem(GENERAL_OPTIONS_KEY, JSON.stringify([...document.querySelectorAll('[data-flag]:checked')].map((x) => x.dataset.flag))); } catch {} }

function renderTarget() {
  const target = state.targets.find((x) => x.target === $('target').value);
  $('targetMeta').innerHTML = target ? `<span>${escapeHtml(target.manufacturer || "Unknown manufacturer")} · ${escapeHtml(target.mcu || "MCU unknown")}</span><span class="supported">${target.group === "supported" ? "● Supported" : "● Catalogued"}</span>` : "";
}
function renderReleaseMeta() {
  const r = state.releases.find((x) => x.release === $('version').value);
  const line = selectedLine();
  $('releaseMeta').textContent = r ? `${line?.label || "Firmware"} · ${r.type || "Release"} · ${r.date || "Catalogued"} · cloud build ${r.cloudBuild === false ? "unavailable" : "available"}` : "";
  const disclaimer = $('versionDisclaimerText');
  if (!disclaimer) return;
  const isCommunity = r?.type === "Community" || r?.release?.toLowerCase().startsWith("kaack-");
  if (isCommunity) {
    const label = r.label || r.release;
    const officialVersion = r.release.replace(/^kaack-/, "").replace(/-v\d+$/i, "");
    if (officialVersion === "4.5.3") {
      disclaimer.textContent = `${label} is not the same as Betaflight 4.5.3. It is a separate firmware based on an older Betaflight 4.5 line, with its own extra features. The 4.5.3 number in the KAACK name does not mean that all fixes from official Betaflight 4.5.3 are included. If you need all official 4.5.3 fixes, use official Betaflight 4.5.3.`;
    } else {
      disclaimer.textContent = `${label} is not the same as official Betaflight ${officialVersion}. It is a separate KAACK firmware with its own version number and extra features. The name does not mean that all fixes from official Betaflight ${officialVersion} are included. If you need official fixes, use official Betaflight ${officialVersion}.`;
    }
  } else {
    disclaimer.textContent = "This is an official Betaflight release. It is separate from the KAACK community builds; switch Firmware line to KAACK Community for KAK versions.";
  }
}

function getFlags() {
  const values = [];
  for (const id of ['radioProtocol','telemetryProtocol','motorProtocol','osdProtocol']) values.push(...($(id).value || '').split(/\s+/).filter(Boolean));
  document.querySelectorAll('[data-flag]:checked').forEach((x) => values.push(...x.dataset.flag.split(/\s+/).filter(Boolean)));
  const custom = $('customFlags').value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return [...new Set([...values, ...custom])].sort();
}
function updateRecipe() {
  const flags = getFlags(); const target = $('target').value || "target"; const version = $('version').value || "version";
  const bad = $('customFlags').value.split(/[\s,]+/).filter(Boolean).find((x) => !/^USE_[A-Z0-9_]+$/.test(x));
  $('customFlagHint').classList.toggle('invalid', Boolean(bad)); $('customFlagHint').textContent = bad ? `Invalid define: ${bad}. Use uppercase USE_* names only.` : "Uppercase USE_* defines only.";
  $('flagCount').textContent = `${flags.length} flag${flags.length === 1 ? "" : "s"}`; $('recipeTitle').textContent = `${version} · ${target}`; $('recipeSummary').textContent = `${flags.slice(0, 4).join(" · ")}${flags.length > 4 ? ` · +${flags.length - 4} more` : ""}`;
  $('buildButton').disabled = Boolean(bad || !target || !version);
}

async function submitBuild(event) {
  event.preventDefault(); if ($('buildButton').disabled) return;
  const selectedRelease = state.releases.find((release) => release.release === $('version').value);
  const request = { firmware: $('firmware').value, version: $('version').value, sourceRef: selectedRelease?.ref || selectedRelease?.sourceRef || "", target: $('target').value, flags: getFlags(), builderVersion: "0.2.0" };
  setStatus('running', 'Submitting build', 'Normalizing recipe and checking the configured builder…', 24);
  try { state.build = state.live ? await api('/api/builds', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(request) }) : await demoBuild(request); pollBuild(state.build); }
  catch (error) { setStatus('error', 'Build request failed', error.message, 0); }
}

async function demoBuild(request) { await wait(500); return { id:`demo-${Date.now().toString(36)}`, mode:'demo', status:'queued', request, cacheKey:await digest(JSON.stringify(request)), downloadUrl:null }; }
async function pollBuild(build) {
  const delays = state.live ? [900, 1800, 3500, 5000] : [1100, 1500];
  for (let i = 0; i < delays.length; i++) { await wait(delays[i]); if (!state.live) { setStatus('success','Demo package ready','The workflow seam is working. This package is intentionally not flashable.',100); showResult({...build,status:'success',downloadUrl:createDemoDownload(build.request)}); return; } try { const next = await api(`/api/builds/${encodeURIComponent(build.id)}`); setStatus(next.status === 'success' ? 'success' : 'running', next.status === 'success' ? 'Build complete' : 'Building firmware', next.message || 'GitHub Actions is compiling the requested target…', next.status === 'success' ? 100 : 35 + i * 17); if (next.status === 'success') { showResult(next); return; } if (next.status === 'failure') throw new Error(next.message || 'The builder failed.'); } catch (error) { if (i === delays.length - 1) setStatus('error','Build status unavailable',error.message,0); } }
}
function setStatus(kind,title,text,progress){ $('statusTitle').textContent=title;$('statusText').textContent=text;$('progressBar').style.width=`${progress}%`;$('statusIcon').className=`status-icon ${kind}`;$('statusIcon').textContent=kind==='success'?'✓':kind==='error'?'!':kind==='running'?'…':'·';$('stepQueued').className=progress>=0?'active':'';$('stepBuild').className=progress>=25?'active':'';$('stepReady').className=progress>=100?'active':'';$('buildButton').disabled=kind==='running'; }
function showResult(build) { const panel=$('resultPanel');panel.classList.remove('hidden');const downloadUrl=build.downloadUrl ? resolveDownloadUrl(build.downloadUrl) : '';const label=build.mode === 'demo' ? 'Download demo package' : downloadUrl.endsWith('/download') ? 'Download firmware HEX' : 'Download Actions artifact';panel.innerHTML=`<div class="result-meta"><span>Build ID <strong>${escapeHtml(build.id || "—")}</strong></span><span>Cache key <strong>${escapeHtml((build.cacheKey || "—").slice(0,18))}</strong></span></div>${downloadUrl ? `<a href="${escapeHtml(downloadUrl)}" download>${label} ↓</a>` : '<span class="field-hint">Artifact URL will be returned by the live worker.</span>'}`; }
function resolveDownloadUrl(url) { try { return new URL(url, apiBase || location.href).href; } catch { return url; } }
function createDemoDownload(request) { const payload=`KAACK DEMO PACKAGE\nNOT FLASHABLE\n\n${JSON.stringify(request,null,2)}\n`; return URL.createObjectURL(new Blob([payload],{type:'text/plain'})); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function wait(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}
async function digest(value){if(!crypto.subtle)return 'local-demo';const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(hash)].map((x)=>x.toString(16).padStart(2,'0')).join('');}

$('builderForm').addEventListener('submit', submitBuild); $('target').addEventListener('change', async () => { renderTarget(); if (state.live) { await loadTargetReleases($('target').value); await loadOptions($('version').value); } updateRecipe(); }); $('version').addEventListener('change', async () => { renderReleaseMeta(); await loadOptions($('version').value); }); $('customFlags').addEventListener('input', updateRecipe); loadCatalog();
