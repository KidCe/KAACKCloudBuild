const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

const upstream = (env) => (env.UPSTREAM_BUILD_API || "https://build.betaflight.com").replace(/\/$/, "");
const sourceRepository = (env) => String(env.FIRMWARE_REPOSITORY || "").trim();
const officialRepository = (env) => String(env.BETAFLIGHT_REPOSITORY || "betaflight/betaflight").trim();
const configRepository = (env) => String(env.FIRMWARE_CONFIG_REPOSITORY || "betaflight/config").trim();
const hasBuilder = (env) => Boolean(env.GITHUB_TOKEN && env.GITHUB_REPOSITORY && sourceRepository(env) && officialRepository(env));
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
const validToken = (value) => typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value) && (value.startsWith("USE_") || value === "CLOUD_BUILD");

const DEFAULT_OPTIONS = {
  radioProtocols: [
    { name: "CRSF", value: "USE_SERIALRX_CRSF", default: true },
    { name: "SBUS", value: "USE_SERIALRX_SBUS", default: false },
    { name: "FPORT", value: "USE_SERIALRX_FPORT", default: false },
    { name: "GHOST", value: "USE_SERIALRX_GHST", default: false },
    { name: "IBUS", value: "USE_SERIALRX_IBUS", default: false },
    { name: "JETIEXBUS", value: "USE_SERIALRX_JETIEXBUS", default: false },
    { name: "MAVLINK", value: "USE_SERIALRX_MAVLINK", default: false },
    { name: "PPM", value: "USE_RX_PPM", default: false },
    { name: "SPEKTRUM", value: "USE_SERIALRX_SPEKTRUM", default: false },
    { name: "SRXL2", value: "USE_SERIALRX_SRXL2", default: false },
    { name: "SUMD", value: "USE_SERIALRX_SUMD", default: false },
    { name: "SUMH", value: "USE_SERIALRX_SUMH", default: false },
    { name: "XBUS", value: "USE_SERIALRX_XBUS", default: false }
  ],
  telemetryProtocols: [
    { name: "Crossfire (CRSF)", value: "USE_TELEMETRY_CRSF", default: true },
    { name: "[None]", value: "", default: false },
    { name: "FRSKY_HUB", value: "USE_TELEMETRY_FRSKY_HUB", default: false },
    { name: "HOTT", value: "USE_TELEMETRY_HOTT", default: false },
    { name: "IBUS EXTENDED", value: "USE_TELEMETRY_IBUS_EXTENDED", default: false },
    { name: "LTM", value: "USE_TELEMETRY_LTM", default: false },
    { name: "SMARTPORT", value: "USE_TELEMETRY_SMARTPORT", default: false },
    { name: "MAVLINK", value: "USE_TELEMETRY_MAVLINK", default: false },
    { name: "SRXL", value: "USE_TELEMETRY_SRXL", default: false }
  ],
  motorProtocols: [
    { name: "BRUSHED", value: "USE_BRUSHED", default: false },
    { name: "DSHOT", value: "USE_DSHOT", default: true },
    { name: "MULTISHOT", value: "USE_MULTISHOT", default: false },
    { name: "ONESHOT", value: "USE_ONESHOT", default: false },
    { name: "PROSHOT", value: "USE_PROSHOT", default: false },
    { name: "PWM", value: "USE_PWM_OUTPUT", default: false }
  ],
  osdProtocols: [
    { name: "None", value: "", default: false },
    { name: "Analog", value: "USE_OSD_SD", default: false },
    { name: "Digital", value: "USE_OSD_HD", default: true },
    { name: "Analog + Digital", value: "USE_OSD_SD USE_OSD_HD", default: false }
  ],
  generalOptions: [
    { name: "Acro Trainer", value: "USE_ACRO_TRAINER", default: false },
    { name: "AKK (SA FIX)", value: "USE_AKK_SMARTAUDIO", default: false },
    { name: "Altitude Hold", value: "USE_ALTITUDE_HOLD", default: false },
    { name: "Batt. Continue", value: "USE_BATTERY_CONTINUE", default: false },
    { name: "Camera Control", value: "USE_CAMERA_CONTROL", default: false },
    { name: "Chirp", value: "USE_CHIRP", default: false },
    { name: "Dashboard", value: "USE_DASHBOARD", default: false },
    { name: "EMFAT tools", value: "USE_EMFAT_TOOLS", default: false },
    { name: "ESC Serial / 4way", value: "USE_ESCSERIAL_SIMONK", default: false },
    { name: "GPS", value: "USE_GPS", default: false },
    { name: "LED Strip", value: "USE_LED_STRIP", default: true },
    { name: "LED Strip (64)", value: "USE_LED_STRIP_64", default: true },
    { name: "Magnetometers", value: "USE_MAG", default: false },
    { name: "Optical Flow", value: "USE_OPTICALFLOW", default: false },
    { name: "OSD (FrSky)", value: "USE_FRSKYOSD", default: false, group: "OSD", groupedName: "FrSky" },
    { name: "Pin IO", value: "USE_PINIO", default: false },
    { name: "Position Hold", value: "USE_POSITION_HOLD", default: false },
    { name: "Race Pro", value: "USE_RACE_PRO", default: false },
    { name: "Range Finder", value: "USE_RANGEFINDER", default: false },
    { name: "Blackbox / SD card", value: "USE_SDCARD", default: false },
    { name: "Soft Serial", value: "USE_SOFTSERIAL", default: false },
    { name: "Servos", value: "USE_SERVOS", default: false },
    { name: "VTX", value: "USE_VTX", default: true },
    { name: "Wing", value: "USE_WING", default: false }
  ]
};

const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { throw new Error("Invalid JSON in worker configuration"); }
};
const optionReleaseFor = (release) => String(release || "").replace(/^kaack-/i, "").replace(/-v\d+$/i, "");
const mergeOptions = (primary, fallback) => [...new Map([...(primary || []), ...(fallback || [])].map((item) => [item.value, item])).values()];
const optionsForRelease = async (env, release) => {
  const upstreamRelease = optionReleaseFor(release);
  if (!/^[A-Za-z0-9._-]+$/.test(upstreamRelease)) return DEFAULT_OPTIONS;
  const response = await fetch(`${upstream(env)}/api/options/${encodeURIComponent(upstreamRelease)}`);
  if (!response.ok) return DEFAULT_OPTIONS;
  const upstreamOptions = await response.json();
  return {
    ...DEFAULT_OPTIONS,
    ...upstreamOptions,
    radioProtocols: mergeOptions(upstreamOptions.radioProtocols, DEFAULT_OPTIONS.radioProtocols),
    telemetryProtocols: mergeOptions([{ name: "Crossfire (CRSF)", value: "USE_TELEMETRY_CRSF", default: true }], upstreamOptions.telemetryProtocols),
    motorProtocols: mergeOptions(upstreamOptions.motorProtocols, DEFAULT_OPTIONS.motorProtocols),
    generalOptions: mergeOptions(upstreamOptions.generalOptions, DEFAULT_OPTIONS.generalOptions)
  };
};
const sourceRefs = (env) => {
  const configured = parseJson(env.FIRMWARE_SOURCE_REFS, null);
  if (configured !== null) {
    if (!Array.isArray(configured) || !configured.length || configured.some((x) => !x || !/^[A-Za-z0-9._-]+$/.test(x.release) || !/^[A-Za-z0-9._\/-]+$/.test(x.ref) || (x.configRef && !/^[A-Za-z0-9._\/-]+$/.test(x.configRef)))) throw new Error("FIRMWARE_SOURCE_REFS must be a non-empty JSON array of safe release/ref entries");
    return configured;
  }
  return [];
};
const sourceRefFor = (env, recipe) => {
  const entry = sourceRefs(env).find((x) => x.release === recipe.version);
  if (!entry) throw new Error("This release is not configured for the selected KAACK source");
  if (recipe.sourceRef && recipe.sourceRef !== entry.ref) throw new Error("The source ref does not match the selected release");
  if (!/^[A-Za-z0-9._\/-]+$/.test(entry.ref)) throw new Error("Invalid configured source ref");
  return entry.ref;
};
const officialRefFor = async (env, recipe) => {
  const response = await fetch(`${upstream(env)}/api/releases`);
  if (!response.ok) throw new Error("Official Betaflight release catalog unavailable");
  const release = (await response.json()).find((item) => item.release === recipe.version && (!item.repository || item.repository === officialRepository(env)) && item.cloudBuild !== false && !item.withdrawn);
  const ref = release?.branch || release?.tag || release?.commit;
  if (!ref || !/^[A-Za-z0-9._\/-]+$/.test(ref)) throw new Error("The selected Betaflight release has no safe source ref");
  if (recipe.sourceRef && recipe.sourceRef !== ref) throw new Error("The source ref does not match the selected Betaflight release");
  return ref;
};
const officialConfigRefFor = (version) => /^(4\.|2025\.)/.test(version) ? "18ffb2a74d388ccd6add5aff12b5b1398e0afd0a" : "";

const normalize = (input) => {
  if (!input || typeof input !== "object") throw new Error("Invalid build request");
  const version = String(input.version || "");
  const sourceRef = String(input.sourceRef || "");
  const target = String(input.target || "");
  const flags = [...new Set((Array.isArray(input.flags) ? input.flags : []).flatMap((x) => String(x).split(/\s+/)).filter(Boolean))].sort();
  if (!/^[A-Za-z0-9._-]+$/.test(version) || (sourceRef && !/^[A-Za-z0-9._\/-]+$/.test(sourceRef)) || !/^[A-Z0-9_-]+$/.test(target) || !flags.every(validToken)) throw new Error("Invalid version, source ref, target or build flag");
  const firmware = String(input.firmware || "kaack").toLowerCase();
  if (!/^(kaack|betaflight)$/.test(firmware)) throw new Error("Invalid firmware line");
  return { firmware, version, sourceRef, target, flags, builderVersion: String(input.builderVersion || "0.2.0") };
};
const cacheKey = async (recipe) => { const bytes = new TextEncoder().encode(JSON.stringify(recipe)); const hash = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, "0")).join(""); };

const githubJson = async (env, path, init = {}) => {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "kaack-cloud-builder", ...(init.headers || {}) };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return response.status === 204 ? null : response.json();
};
const gh = async (env, path, init = {}) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) throw new Error("GitHub builder is not configured");
  return githubJson(env, path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
};

const gitTree = async (env, repository, ref) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid configured GitHub repository");
  const tree = await githubJson(env, `/repos/${repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if (tree.truncated) throw new Error(`GitHub tree is truncated for ${repository}@${ref}; target catalog cannot be trusted`);
  return tree.tree || [];
};
const sourceTargetIndex = async (env, ref, configuredConfigRef = "") => {
  const sourceTree = await gitTree(env, sourceRepository(env), ref);
  const classicTargets = sourceTree
    .map((item) => item.path.match(/^src\/(?:platform|main)\/[^/]+\/target\/([^/]+)\/target\.mk$/)?.[1])
    .filter(Boolean)
    .map((target) => ({ target, manufacturer: "KAACK source target", group: "source" }));
  const configSubmodule = sourceTree.find((item) => item.path === "src/config" && item.type === "commit");
  const configRef = configuredConfigRef || configSubmodule?.sha || "master";
  const configTree = await gitTree(env, configRepository(env), configRef);
  const configTargets = configTree
    .map((item) => item.path.match(/^configs\/(?:[^/]+\/)?([^/]+)\/config\.h$/)?.[1])
    .filter(Boolean)
    .map((target) => ({ target, manufacturer: "Betaflight config", group: "config" }));
  return [...new Map([...classicTargets, ...configTargets].map((item) => [item.target, item])).values()]
    .sort((a, b) => a.target.localeCompare(b.target));
};
const sourceTargets = async (env, ref, configRef) => sourceTargetIndex(env, ref, configRef);
const sourceTargetExists = async (env, target, ref, configRef) => (await sourceTargetIndex(env, ref, configRef)).some((item) => item.target === target);
const officialReleases = async (env) => {
  const response = await fetch(`${upstream(env)}/api/releases`);
  if (!response.ok) throw new Error("Official Betaflight release catalog unavailable");
  return (await response.json())
    .filter((item) => (!item.repository || item.repository === officialRepository(env)) && item.cloudBuild !== false && !item.withdrawn && (item.branch || item.tag || item.commit))
    .map((item) => ({ ...item, label: `Betaflight ${item.release}`, ref: item.branch || item.tag || item.commit, cloudBuild: true }));
};
const officialTargets = async (env) => {
  const response = await fetch(`${upstream(env)}/api/targets`);
  if (!response.ok) throw new Error("Official Betaflight target catalog unavailable");
  return (await response.json()).map((item) => ({ ...item, group: "catalogued" }));
};
const enrichTargets = (targets, referenceTargets) => {
  const metadata = new Map(referenceTargets.map((item) => [item.target, item]));
  return targets.map((item) => ({ ...metadata.get(item.target), ...item })).sort((a, b) => a.target.localeCompare(b.target));
};
const sourceCatalog = async (env) => {
  const releases = sourceRefs(env);
  if (!releases.length) throw new Error("Configure FIRMWARE_SOURCE_REFS for the selected firmware repository");
  const refs = env.CATALOG_SOURCE_REF ? releases.filter((x) => x.ref === env.CATALOG_SOURCE_REF) : releases;
  if (!refs.length) throw new Error("CATALOG_SOURCE_REF is not one of the configured source refs");
  const targetLists = await Promise.all(refs.map((x) => sourceTargets(env, x.ref, x.configRef)));
  const targets = [...new Map(targetLists.flat().map((x) => [x.target, x])).values()].sort((a, b) => a.target.localeCompare(b.target));
  return { mode: "live", source: `github:${sourceRepository(env)}`, firmware: [{ id: "kaack", label: "KAACK Community" }, { id: "betaflight", label: "Betaflight" }], releases: releases.map((x) => ({ ...x, cloudBuild: true })), targets, options: DEFAULT_OPTIONS };
};
const validateAgainstSource = async (env, recipe) => {
  const ref = sourceRefFor(env, recipe);
  const entry = sourceRefs(env).find((x) => x.ref === ref && x.release === recipe.version);
  if (!(await sourceTargetExists(env, recipe.target, ref, entry?.configRef))) throw new Error("Target is not present in the selected KAACK source ref or its config repository");
  return { sourceRef: ref };
};
const validateAgainstCatalog = async (env, recipe) => {
  if (recipe.firmware === "kaack") return validateAgainstSource(env, recipe);
  const targetResponse = await fetch(`${upstream(env)}/api/targets/${encodeURIComponent(recipe.target)}`);
  if (!targetResponse.ok) throw new Error("Target is not present in the upstream catalog");
  const detail = await targetResponse.json();
  const release = (detail.releases || []).find((item) => item.release === recipe.version && item.cloudBuild !== false && !item.withdrawn);
  if (!release) throw new Error("Release is not available for this target");
  return { sourceRef: await officialRefFor(env, recipe) };
};

async function catalog(env) {
  if (sourceRepository(env)) {
    const [community, targets, releases] = await Promise.all([sourceCatalog(env), officialTargets(env), officialReleases(env)]);
    const communityTargets = enrichTargets(community.targets, targets);
    const verifiedTargets = new Set(["HDZERO_HALO", "MAMBAF722_2022A", "MAMBAF722_2022B", "HGLRCF722MINI"]);
    const communityLine = { id: "kaack", label: "KAACK Community", repository: sourceRepository(env), releases: community.releases, targets: communityTargets.map((item) => verifiedTargets.has(item.target) ? { ...item, group: "supported" } : item) };
    const officialLine = { id: "betaflight", label: "Betaflight", repository: officialRepository(env), releases, targets };
    return { mode: "live", source: { betaflight: `github:${officialRepository(env)}`, kaack: `github:${sourceRepository(env)}` }, firmware: [{ id: "kaack", label: "KAACK Community" }, { id: "betaflight", label: "Betaflight" }], firmwareLines: [communityLine, officialLine], releases: community.releases, targets: communityLine.targets, options: DEFAULT_OPTIONS };
  }
  const response = await fetch(`${upstream(env)}/api/targets`);
  if (!response.ok) throw new Error("Upstream target catalog unavailable");
  const targets = await response.json();
  const probe = await fetch(`${upstream(env)}/api/targets/${encodeURIComponent(env.CATALOG_PROBE_TARGET || "KAKUTEH7")}`);
  const detail = probe.ok ? await probe.json() : { releases: [] };
  const options = await fetch(`${upstream(env)}/api/options/${encodeURIComponent((detail.releases || []).find((x) => x.cloudBuild !== false)?.release || "4.5.5")}`);
  const releases = await officialReleases(env);
  const line = { id: "betaflight", label: "Betaflight", repository: officialRepository(env), releases, targets: targets.map((item) => ({ ...item, group: "catalogued" })) };
  return { mode: "live", source: upstream(env), firmware: [{ id: "betaflight", label: "Betaflight" }], firmwareLines: [line], targets: line.targets, releases, options: options.ok ? await options.json() : DEFAULT_OPTIONS };
}
async function targetCatalog(env, target, firmware) {
  if (sourceRepository(env) && firmware !== "betaflight") {
    const releases = (await Promise.all(sourceRefs(env).map(async (entry) => (await sourceTargetExists(env, target, entry.ref, entry.configRef)) ? { ...entry, cloudBuild: true } : null))).filter(Boolean);
    return { target, releases };
  }
  const response = await fetch(`${upstream(env)}/api/targets/${encodeURIComponent(target)}`);
  const detail = await response.json();
  if (firmware !== "betaflight") return detail;
  const releases = await officialReleases(env);
  const officialByRelease = new Map(releases.map((item) => [item.release, item]));
  return { ...detail, releases: (detail.releases || [])
    .filter((item) => officialByRelease.has(item.release) && item.cloudBuild !== false && !item.withdrawn)
    .map((item) => ({ ...item, ...officialByRelease.get(item.release), label: `Betaflight ${item.release}`, cloudBuild: true })) };
}
async function dispatch(env, recipe, id) {
  const sourceRef = recipe.firmware === "kaack" ? sourceRefFor(env, recipe) : await officialRefFor(env, recipe);
  const sourceEntry = recipe.firmware === "kaack" ? sourceRefs(env).find((entry) => entry.release === recipe.version) : null;
  const path = `/repos/${env.GITHUB_REPOSITORY}/actions/workflows/build-firmware.yml/dispatches`;
  const configRef = sourceEntry?.configRef || (recipe.firmware === "betaflight" ? officialConfigRefFor(recipe.version) : "");
  await gh(env, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: env.GITHUB_REF || "main", inputs: { build_id: id, firmware_line: recipe.firmware, version: recipe.version, source_ref: sourceRef, config_ref: configRef, target: recipe.target, flags_json: JSON.stringify(recipe.flags) } }) });
  return { id, mode: "github-actions", status: "queued", cacheKey: await cacheKey({ ...recipe, sourceRef }), message: "Workflow dispatched. Polling GitHub Actions for the build result." };
}
async function locateRun(env, id) { const data = await gh(env, `/repos/${env.GITHUB_REPOSITORY}/actions/runs?event=workflow_dispatch&per_page=30`); return data.workflow_runs?.find((run) => run.display_title === `KAACK build ${id}` || run.name === `KAACK build ${id}`); }
async function buildStatus(env, id) {
  const run = await locateRun(env, id);
  if (!run) return { id, mode: "github-actions", status: "queued", message: "Waiting for GitHub Actions to register the dispatched workflow." };
  if (run.status !== "completed") return { id, mode: "github-actions", status: "running", message: `GitHub Actions status: ${run.status}.`, workflowUrl: run.html_url };
  if (run.conclusion !== "success") return { id, mode: "github-actions", status: "failure", message: `Workflow finished with ${run.conclusion || "unknown"}.`, workflowUrl: run.html_url };
  const artifacts = await gh(env, `/repos/${env.GITHUB_REPOSITORY}/actions/runs/${run.id}/artifacts`);
  const artifact = artifacts.artifacts?.find((x) => x.name === `kaack-${id}`) || artifacts.artifacts?.[0];
  return { id, mode: "github-actions", status: "success", message: env.FIRMWARE_BUCKET ? "Build finished. Download the verified firmware file." : "Build finished. Download the GitHub Actions artifact ZIP and verify its manifest.", downloadFormat: env.FIRMWARE_BUCKET ? "firmware" : "zip", workflowUrl: run.html_url, downloadUrl: `/api/builds/${id}/download`, artifactName: artifact?.name };
}
async function downloadFirmware(env, id) {
  if (env.FIRMWARE_BUCKET) {
    for (const extension of ["hex", "uf2"]) {
      const object = await env.FIRMWARE_BUCKET.get(`firmware/${id}.${extension}`);
      if (object) return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || (extension === "hex" ? "text/plain; charset=utf-8" : "application/octet-stream"), "content-disposition": object.httpMetadata?.contentDisposition || `attachment; filename=kaack-${id}.${extension}`, etag: object.httpEtag || "" } });
    }
    return json({ error: "Firmware file is not available yet" }, 404);
  }
  const run = await locateRun(env, id);
  if (!run || run.status !== "completed" || run.conclusion !== "success") return json({ error: "Build artifact is not available yet" }, 404);
  const artifacts = await gh(env, `/repos/${env.GITHUB_REPOSITORY}/actions/runs/${run.id}/artifacts`);
  const artifact = artifacts.artifacts?.find((x) => x.name === `kaack-${id}`) || artifacts.artifacts?.[0];
  if (!artifact?.archive_download_url) return json({ error: "Build artifact is not available" }, 404);
  const response = await fetch(artifact.archive_download_url, { headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", authorization: `Bearer ${env.GITHUB_TOKEN}`, "user-agent": "kaack-cloud-builder" } });
  if (!response.ok) return json({ error: `GitHub artifact download ${response.status}` }, 502);
  return new Response(response.body, { status: response.status, headers: { "content-type": "application/zip", "content-disposition": `attachment; filename=kaack-${id}.zip`, "cache-control": "private, max-age=60" } });
}

export default { async fetch(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/health") return json({ ok: true, service: "kaack-cloud-builder", mode: hasBuilder(env) ? "github-actions" : "unavailable", sourceConfigured: Boolean(sourceRepository(env)), liveBuilderAvailable: hasBuilder(env) });
    if (url.pathname === "/api/catalog" && request.method === "GET") return json(await catalog(env), 200, { "cache-control": "public, max-age=300" });
    if (url.pathname === "/api/options" && request.method === "GET") {
      const release = url.searchParams.get("release");
      if (!release || !/^[A-Za-z0-9._-]+$/.test(release)) return json({ error: "Invalid release" }, 400);
      if (sourceRepository(env)) return json(await optionsForRelease(env, release), 200, { "cache-control": "public, max-age=3600" });
      const response = await fetch(`${upstream(env)}/api/options/${encodeURIComponent(release)}`);
      return new Response(response.body, { status: response.status, headers: { ...JSON_HEADERS, "cache-control": "public, max-age=3600" } });
    }
    if (url.pathname.startsWith("/api/targets/") && request.method === "GET") {
      const target = url.pathname.split("/").pop();
      if (!/^[A-Z0-9_-]+$/.test(target)) return json({ error: "Invalid target" }, 400);
      const firmware = (url.searchParams.get("firmware") || "kaack").toLowerCase();
      if (!/^(kaack|betaflight)$/.test(firmware)) return json({ error: "Invalid firmware line" }, 400);
      return json(await targetCatalog(env, target, firmware), 200, { "cache-control": "public, max-age=300" });
    }
    if (url.pathname === "/api/builds" && request.method === "POST") {
      const recipe = normalize(await request.json());
      const id = crypto.randomUUID();
      if (!hasBuilder(env)) return json({ error: "Live builder unavailable. Configure the GitHub Actions builder before submitting builds." }, 503);
      const validated = await validateAgainstCatalog(env, recipe);
      const requestWithRef = { ...recipe, sourceRef: validated.sourceRef || recipe.sourceRef || recipe.version };
      return json(await dispatch(env, requestWithRef, id), 202);
    }
    if (url.pathname.startsWith("/api/builds/") && url.pathname.endsWith("/download") && request.method === "GET") {
      const id = url.pathname.split("/").at(-2);
      if (!/^[a-z0-9-]+$/i.test(id)) return json({ error: "Invalid build id" }, 400);
      return downloadFirmware(env, id);
    }
    if (url.pathname.startsWith("/api/builds/") && request.method === "GET") {
      const id = url.pathname.split("/").pop();
      if (!/^[a-z0-9-]+$/i.test(id)) return json({ error: "Invalid build id" }, 400);
      return json(await buildStatus(env, id));
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Unexpected worker error" }, 500);
  }
} };
