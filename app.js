import { autoTelemetryForRadio, canonicalizeBuildDefine, expandBuildFlags, KAACK_SOURCE_FLAGS } from './shared/build-flags.js';

const config = window.KAACK_CONFIG || {};
const DEFAULT_API_BASE = "https://kaack-cloud-builder-api.n-kitsikoudis.workers.dev";
const apiBase = (config.apiBase || DEFAULT_API_BASE).replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const GENERAL_OPTIONS_KEY = "kaack-cloud-builder.general-options";
const DEFAULT_FIRMWARE_LINE = "kaack";
const DEFAULT_KAACK_RELEASE = "kaack-4.5.3-v19";
const RACING_DEFAULT_FLAGS = new Set(["USE_LED_STRIP", "USE_LED_STRIP_64", "USE_VTX"]);
const RACING_OPTION_VALUES = new Set(["USE_LED_STRIP", "USE_LED_STRIP_64", "USE_VTX"]);
const state = { catalog: null, options: null, releases: [], targets: [], firmwareLine: DEFAULT_FIRMWARE_LINE, live: false, selected: new Set(), build: null };

const api = async (path, init) => {
  const response = await fetch(`${apiBase}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `API ${response.status}`);
  return body;
};

async function loadCatalog() {
  try {
    if (!apiBase) throw new Error("The live builder endpoint is not configured.");
    state.catalog = await api("/api/catalog");
    if (state.catalog.mode !== "live") throw new Error("The live builder did not return a live catalog.");
    state.live = true;
    renderCatalog();
    if ($('target').value) await loadTargetReleases($('target').value);
    await loadOptions($('version').value);
  } catch (error) {
    setUnavailable(error);
  }
}

function setUnavailable(error) {
  state.live = false;
  $('connectionBadge').className = "status-pill error";
  $('connectionBadge').innerHTML = "<i></i> Live builder unavailable";
  $('availabilityErrorText').textContent = `${error.message} No demo build is available.`;
  $('availabilityError').classList.remove('hidden');
  $('builderForm').classList.add('unavailable');
  $('builderForm').querySelectorAll('select, input, textarea, button').forEach((control) => { control.disabled = true; });
  setStatus('error', 'Live builder unavailable', 'The build server could not be reached. Try again later.', 0);
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
  $('targetList').innerHTML = state.targets.map((x) => `<option value="${escapeHtml(x.target)}" label="${escapeHtml(`${x.manufacturer || "Unknown"} · ${x.mcu || "MCU unknown"}`)}"></option>`).join("");
  const preferredTarget = state.targets.find((x) => x.target === "HDZERO_HALO") || state.targets.find((x) => x.target === "KAKUTEH7") || state.targets[0];
  $('target').value = preferredTarget?.target || "";
  renderTarget();
  renderReleases(line?.releases || []);
  $('connectionBadge').className = "status-pill live";
  $('connectionBadge').innerHTML = "<i></i> Live builder";
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
  state.options = await api(`/api/options?release=${encodeURIComponent(release)}`);
  renderOptions();
}
async function loadTargetReleases(target) {
  const detail = await api(`/api/targets/${encodeURIComponent(target)}?firmware=${encodeURIComponent(state.firmwareLine)}`);
  renderReleases(detail.releases || []);
}

function renderOptions() {
  const opts = state.options || {};
  const osdOptions = (opts.osdProtocols || (opts.generalOptions || []).filter((x) => x.group === "OSD")).map((x) => ({ ...x, name: x.groupedName || x.name?.replace(/^OSD \((.*)\)$/, "$1") }));
  if (!osdOptions.some((option) => option.value === "")) osdOptions.unshift({ name: "None", value: "", default: false });
  fillSelect('radioProtocol', opts.radioProtocols || [], 'USE_SERIALRX_CRSF');
  fillSelect('motorProtocol', opts.motorProtocols || [], 'USE_DSHOT');
  fillSelect('osdProtocol', osdOptions, 'USE_OSD_HD');
  renderTelemetryProtocol();
  const savedFlags = readGeneralOptions();
  const generalOptions = (opts.generalOptions || []).filter((x) => !x.group);
  const renderFlag = (x) => {
    const sourceRequired = state.firmwareLine === "kaack" && KAACK_SOURCE_FLAGS.has(x.value);
    const label = sourceRequired ? `${x.name} (included by KAACK)` : x.unsupported ? `${x.name} (not in this KAACK source)` : x.name;
    const checked = !x.unsupported && (sourceRequired || (savedFlags ? savedFlags.includes(x.value) : state.firmwareLine === "kaack" ? RACING_DEFAULT_FLAGS.has(x.value) : Boolean(x.default)));
    return `<label class="check"><input type="checkbox" data-flag="${escapeHtml(x.value)}" ${checked ? "checked" : ""} ${sourceRequired || x.unsupported ? "disabled" : ""} /><span>${escapeHtml(label)}</span></label>`;
  };
  $('racingOptions').innerHTML = generalOptions.filter((x) => RACING_OPTION_VALUES.has(x.value)).map(renderFlag).join("");
  $('additionalOptions').innerHTML = generalOptions.filter((x) => !RACING_OPTION_VALUES.has(x.value)).map(renderFlag).join("");
  state.selected = new Set([...document.querySelectorAll('[data-flag]:checked')].flatMap((x) => x.dataset.flag.split(" ")));
  document.querySelectorAll('[data-flag]').forEach((x) => { x.onchange = () => { persistGeneralOptions(); updateRecipe(); }; });
  $('radioProtocol').onchange = () => { renderTelemetryProtocol(); updateRecipe(); };
  ['telemetryProtocol','motorProtocol','osdProtocol'].forEach((id) => { $(id).onchange = updateRecipe; });
  updateRecipe();
}

function renderTelemetryProtocol() {
  const radioFlag = $('radioProtocol').value || '';
  const radioOption = (state.options?.radioProtocols || []).find((option) => option.value === radioFlag);
  const automaticTelemetry = autoTelemetryForRadio(radioFlag);
  if (radioOption?.includesTelemetry === true || automaticTelemetry) {
    $('telemetryProtocol').innerHTML = `<option value="">Automatically included</option>`;
    $('telemetryProtocol').disabled = true;
    return;
  }
  $('telemetryProtocol').disabled = false;
  fillSelect('telemetryProtocol', state.options?.telemetryProtocols || [], '');
}

function fillSelect(id, options, preferredValue) {
  const available = options.filter((option) => !option.unsupported);
  const selected = available.find((x) => x.value === preferredValue)?.value || available.find((x) => x.default)?.value || available[0]?.value;
  $(id).innerHTML = options.map((x) => `<option value="${escapeHtml(x.value)}" ${x.value === selected ? "selected" : ""} ${x.unsupported ? "disabled" : ""}>${escapeHtml(`${x.name || x.label || x.value || "None"}${x.unsupported ? " (not in this KAACK source)" : ""}`)}</option>`).join("");
}

function generalOptionsStorageKey() { return `${GENERAL_OPTIONS_KEY}.${state.firmwareLine}.${$('version').value}`; }
function readGeneralOptions() { try { const saved = JSON.parse(localStorage.getItem(generalOptionsStorageKey())); return Array.isArray(saved) ? saved : null; } catch { return null; } }
function persistGeneralOptions() { try { localStorage.setItem(generalOptionsStorageKey(), JSON.stringify([...document.querySelectorAll('[data-flag]:checked')].map((x) => x.dataset.flag))); } catch {} }

function renderTarget() {
  const target = state.targets.find((x) => x.target === $('target').value);
  $('targetMeta').innerHTML = target ? `<span>${escapeHtml(target.manufacturer || "Unknown manufacturer")} · ${escapeHtml(target.mcu || "MCU unknown")}</span><span class="supported">${target.group === "build-tested" ? "● Build-tested" : "● Catalogued"}</span>` : "";
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
  return expandBuildFlags([...values, ...custom], { firmware: state.firmwareLine, version: $('version').value });
}
function updateRecipe() {
  const flags = getFlags(); const target = $('target').value || "target"; const version = $('version').value || "version";
  const customTokens = $('customFlags').value.split(/[\s,]+/).filter(Boolean);
  const bad = customTokens.find((x) => !canonicalizeBuildDefine(x));
  const unavailable = new Set([...(state.options?.radioProtocols || []), ...(state.options?.telemetryProtocols || []), ...(state.options?.motorProtocols || []), ...(state.options?.generalOptions || [])].filter((option) => option.unsupported).map((option) => option.value));
  const unsupported = customTokens.map(canonicalizeBuildDefine).find((flag) => flag && unavailable.has(flag));
  $('customFlagHint').classList.toggle('invalid', Boolean(bad || unsupported));
  $('customFlagHint').textContent = bad ? `Invalid define: ${bad}. Use uppercase identifiers only.` : unsupported ? `${unsupported} is not implemented by this KAACK source.` : "Configurator-style uppercase defines; USE_ is optional.";
  $('flagCount').textContent = `${flags.length} flag${flags.length === 1 ? "" : "s"}`; $('recipeTitle').textContent = `${version} · ${target}`; $('recipeSummary').textContent = `${flags.slice(0, 4).join(" · ")}${flags.length > 4 ? ` · +${flags.length - 4} more` : ""}`;
  $('buildButton').disabled = Boolean(bad || unsupported || !target || !version);
}

async function submitBuild(event) {
  event.preventDefault();
  if ($('buildButton').disabled) return;
  if (!state.live) { setUnavailable(new Error("The live builder is unavailable.")); return; }
  const selectedRelease = state.releases.find((release) => release.release === $('version').value);
  const request = { firmware: $('firmware').value, version: $('version').value, sourceRef: selectedRelease?.buildRef || selectedRelease?.ref || selectedRelease?.sourceRef || "", target: $('target').value, flags: getFlags(), builderVersion: "0.2.0" };
  setStatus('running', 'Submitting build', 'Normalizing recipe and checking the configured builder…', 24);
  try { state.build = await api('/api/builds', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(request) }); pollBuild(state.build); }
  catch (error) { setStatus('error', 'Build request failed', error.message, 0); }
}

async function pollBuild(build) {
  const delays = [900, 1800, 3500, 5000, 8000, 12000, 15000, 20000];
  for (let i = 0; i < delays.length; i++) {
    await wait(delays[i]);
    try {
      const next = await api(`/api/builds/${encodeURIComponent(build.id)}`);
      setStatus(next.status === 'success' ? 'success' : 'running', next.status === 'success' ? 'Build complete' : 'Building firmware', next.message || 'GitHub Actions is compiling the requested target…', next.status === 'success' ? 100 : Math.min(92, 35 + i * 8));
      if (next.status === 'success') { showResult(next); return; }
      if (next.status === 'failure') throw new Error(next.message || 'The builder failed.');
    } catch (error) {
      if (i === delays.length - 1) setStatus('error','Build status unavailable',error.message,0);
    }
  }
}
function setStatus(kind,title,text,progress){ $('statusTitle').textContent=title;$('statusText').textContent=text;$('progressBar').style.width=`${progress}%`;$('statusIcon').className=`status-icon ${kind}`;$('statusIcon').textContent=kind==='success'?'✓':kind==='error'?'!':kind==='running'?'…':'·';$('stepQueued').className=progress>=0?'active':'';$('stepBuild').className=progress>=25?'active':'';$('stepReady').className=progress>=100?'active':'';$('buildButton').disabled=kind==='running'; }
function showResult(build) {
  const panel = $('resultPanel');
  panel.classList.remove('hidden');
  const downloadUrl = build.downloadUrl ? resolveDownloadUrl(build.downloadUrl) : '';
  const direct = build.downloadFormat === 'firmware';
  const label = direct ? 'Download firmware' : 'Download ZIP artifact';
  const note = direct ? '<div class="download-note"><strong>Checked firmware</strong> The file passed target-name, ELF-to-HEX, Intel HEX and checksum checks. Bench-test with props removed.</div>' : '<div class="download-note"><strong>ZIP artifact</strong> Unpack the ZIP and use the descriptive HEX file inside. Keep manifest.json and SHA256SUMS with it.</div>';
  panel.innerHTML = `<div class="result-meta"><span>Build ID <strong>${escapeHtml(build.id || "—")}</strong></span><span>Cache key <strong>${escapeHtml((build.cacheKey || "—").slice(0,18))}</strong></span></div>${downloadUrl ? `<a href="${escapeHtml(downloadUrl)}" download>${label} ↓</a>${note}` : '<span class="field-hint">The live worker did not return a download URL.</span>'}`;
}
function resolveDownloadUrl(url) { try { return new URL(url, apiBase || location.href).href; } catch { return url; } }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function wait(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}

$('builderForm').addEventListener('submit', submitBuild);
$('target').addEventListener('change', async () => {
  renderTarget();
  if (state.live) {
    try { await loadTargetReleases($('target').value); await loadOptions($('version').value); }
    catch (error) { setUnavailable(error); }
  }
  updateRecipe();
});
$('version').addEventListener('change', async () => {
  renderReleaseMeta();
  if (state.live) {
    try { await loadOptions($('version').value); }
    catch (error) { setUnavailable(error); }
  }
});
$('customFlags').addEventListener('input', updateRecipe);
loadCatalog();
