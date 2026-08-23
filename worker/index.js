const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

const upstream = (env) => (env.UPSTREAM_BUILD_API || "https://build.betaflight.com").replace(/\/$/, "");
const sourceRepository = (env) => String(env.FIRMWARE_REPOSITORY || "").trim();
const configRepository = (env) => String(env.FIRMWARE_CONFIG_REPOSITORY || "betaflight/config").trim();
const hasBuilder = (env) => Boolean(env.GITHUB_TOKEN && env.GITHUB_REPOSITORY && sourceRepository(env));
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
const validToken = (value) => typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value) && (value.startsWith("USE_") || value === "CLOUD_BUILD");

const DEFAULT_OPTIONS = {
  radioProtocols: [
    { name: "CRSF", value: "USE_SERIALRX_CRSF", default: true },
    { name: "SBUS", value: "USE_SERIALRX_SBUS", default: false },
    { name: "FPORT", value: "USE_SERIALRX_FPORT", default: false },
    { name: "GHOST", value: "USE_SERIALRX_GHST", default: false }
  ],
  telemetryProtocols: [
    { name: "Crossfire (CRSF)", value: "USE_TELEMETRY_CRSF", default: true },
    { name: "[None]", value: "", default: false },
    { name: "SMARTPORT", value: "USE_TELEMETRY_SMARTPORT", default: false },
    { name: "MAVLINK", value: "USE_TELEMETRY_MAVLINK", default: false }
  ],
  motorProtocols: [
    { name: "DSHOT", value: "USE_DSHOT", default: true },
    { name: "MULTISHOT", value: "USE_MULTISHOT", default: false },
    { name: "ONESHOT", value: "USE_ONESHOT", default: false },
    { name: "PWM", value: "USE_PWM_OUTPUT", default: false }
  ],
  osdProtocols: [
    { name: "None", value: "", default: false },
    { name: "Analog", value: "USE_OSD_SD", default: false },
    { name: "Digital", value: "USE_OSD_HD", default: true },
    { name: "Analog + Digital", value: "USE_OSD_SD USE_OSD_HD", default: false }
  ],
  generalOptions: [
    { name: "GPS", value: "USE_GPS", default: true },
    { name: "LED Strip", value: "USE_LED_STRIP", default: true },
    { name: "LED Strip (64)", value: "USE_LED_STRIP_64", default: false },
    { name: "VTX", value: "USE_VTX", default: true },
    { name: "Camera Control", value: "USE_CAMERA_CONTROL", default: false },
    { name: "Blackbox / SD card", value: "USE_SDCARD", default: false },
    { name: "Race Pro", value: "USE_RACE_PRO", default: false },
    { name: "Servos", value: "USE_SERVOS", default: false },
    { name: "Magnetometers", value: "USE_MAG", default: false }
  ]
};

const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { throw new Error("Invalid JSON in worker configuration"); }
};
const sourceRefs = (env) => {
  const configured = parseJson(env.FIRMWARE_SOURCE_REFS, null);
  if (configured !== null) {
    if (!Array.isArray(configured) || !configured.length || configured.some((x) => !x || !/^[A-Za-z0-9._-]+$/.test(x.release) || !/^[A-Za-z0-9._\/-]+$/.test(x.ref))) throw new Error("FIRMWARE_SOURCE_REFS must be a non-empty JSON array of safe release/ref entries");
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

const normalize = (input) => {
  if (!input || typeof input !== "object") throw new Error("Invalid build request");
  const version = String(input.version || "");
  const sourceRef = String(input.sourceRef || "");
  const target = String(input.target || "");
  const flags = [...new Set((Array.isArray(input.flags) ? input.flags : []).flatMap((x) => String(x).split(/\s+/)).filter(Boolean))].sort();
  if (!/^[A-Za-z0-9._-]+$/.test(version) || (sourceRef && !/^[A-Za-z0-9._\/-]+$/.test(sourceRef)) || !/^[A-Z0-9_-]+$/.test(target) || !flags.every(validToken)) throw new Error("Invalid version, source ref, target or build flag");
  return { firmware: String(input.firmware || "KAACK"), version, sourceRef, target, flags, builderVersion: String(input.builderVersion || "0.2.0") };
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
const sourceTargetIndex = async (env, ref) => {
  const sourceTree = await gitTree(env, sourceRepository(env), ref);
  const classicTargets = sourceTree
    .map((item) => item.path.match(/^src\/platform\/[^/]+\/target\/([^/]+)\/target\.mk$/)?.[1])
    .filter(Boolean)
    .map((target) => ({ target, manufacturer: "KAACK source target", group: "source" }));
  const configSubmodule = sourceTree.find((item) => item.path === "src/config" && item.type === "commit");
  const configRef = configSubmodule?.sha || "master";
  const configTree = await gitTree(env, configRepository(env), configRef);
  const configTargets = configTree
    .map((item) => item.path.match(/^configs\/([^/]+)\/config\.h$/)?.[1])
    .filter(Boolean)
    .map((target) => ({ target, manufacturer: "Betaflight config", group: "config" }));
  return [...new Map([...classicTargets, ...configTargets].map((item) => [item.target, item])).values()]
    .sort((a, b) => a.target.localeCompare(b.target));
};
const sourceTargets = async (env, ref) => sourceTargetIndex(env, ref);
const sourceTargetExists = async (env, target, ref) => (await sourceTargetIndex(env, ref)).some((item) => item.target === target);
const sourceCatalog = async (env) => {
  const releases = sourceRefs(env);
  if (!releases.length) throw new Error("Configure FIRMWARE_SOURCE_REFS for the selected firmware repository");
  const refs = env.CATALOG_SOURCE_REF ? releases.filter((x) => x.ref === env.CATALOG_SOURCE_REF) : releases;
  if (!refs.length) throw new Error("CATALOG_SOURCE_REF is not one of the configured source refs");
  const targetLists = await Promise.all(refs.map((x) => sourceTargets(env, x.ref)));
  const targets = [...new Map(targetLists.flat().map((x) => [x.target, x])).values()].sort((a, b) => a.target.localeCompare(b.target));
  return { mode: "live", source: `github:${sourceRepository(env)}`, firmware: [{ id: "KAACK", label: "KAACK Community" }], releases: releases.map((x) => ({ ...x, cloudBuild: true })), targets, options: DEFAULT_OPTIONS };
};
const validateAgainstSource = async (env, recipe) => {
  const ref = sourceRefFor(env, recipe);
  if (!(await sourceTargetExists(env, recipe.target, ref))) throw new Error("Target is not present in the selected KAACK source ref or its config repository");
  return { sourceRef: ref };
};
const validateAgainstCatalog = async (env, recipe) => {
  if (sourceRepository(env)) return validateAgainstSource(env, recipe);
  const targetResponse = await fetch(`${upstream(env)}/api/targets/${encodeURIComponent(recipe.target)}`);
  if (!targetResponse.ok) throw new Error("Target is not present in the upstream catalog");
  const detail = await targetResponse.json();
  const release = (detail.releases || []).find((item) => item.release === recipe.version && item.cloudBuild !== false && !item.withdrawn);
  if (!release) throw new Error("Release is not available for this target");
  return detail;
};

async function catalog(env) {
  if (sourceRepository(env)) return sourceCatalog(env);
  const response = await fetch(`${upstream(env)}/api/targets`);
  if (!response.ok) throw new Error("Upstream target catalog unavailable");
  const targets = await response.json();
  const probe = await fetch(`${upstream(env)}/api/targets/${encodeURIComponent(env.CATALOG_PROBE_TARGET || "KAKUTEH7")}`);
  const detail = probe.ok ? await probe.json() : { releases: [] };
  const options = await fetch(`${upstream(env)}/api/options/${encodeURIComponent((detail.releases || []).find((x) => x.cloudBuild !== false)?.release || "4.5.5")}`);
  return { mode: "live", source: upstream(env), firmware: [{ id: "KAACK", label: "KAACK Community" }], targets, releases: detail.releases || [], options: options.ok ? await options.json() : DEFAULT_OPTIONS };
}
async function targetCatalog(env, target) {
  if (sourceRepository(env)) {
    const releases = (await Promise.all(sourceRefs(env).map(async (entry) => (await sourceTargetExists(env, target, entry.ref)) ? { ...entry, cloudBuild: true } : null))).filter(Boolean);
    return { target, releases };
  }
  const response = await fetch(`${upstream(env)}/api/targets/${encodeURIComponent(target)}`);
  return response.json();
}
async function dispatch(env, recipe, id) {
  const sourceRef = sourceRepository(env) ? sourceRefFor(env, recipe) : recipe.sourceRef || recipe.version;
  const path = `/repos/${env.GITHUB_REPOSITORY}/actions/workflows/build-firmware.yml/dispatches`;
  await gh(env, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: env.GITHUB_REF || "main", inputs: { build_id: id, version: recipe.version, source_ref: sourceRef, target: recipe.target, flags_json: JSON.stringify(recipe.flags) } }) });
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
  const publicBase = String(env.PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  return { id, mode: "github-actions", status: "success", message: env.FIRMWARE_BUCKET ? "Build finished. Download the verified firmware file." : "Build finished. Download the GitHub Actions artifact ZIP and verify its manifest.", workflowUrl: run.html_url, downloadUrl: env.FIRMWARE_BUCKET ? `${publicBase}/api/builds/${id}/download` : artifact?.archive_download_url || run.html_url, artifactName: artifact?.name };
}
async function downloadFirmware(env, id) {
  if (!env.FIRMWARE_BUCKET) return json({ error: "R2 firmware storage is not configured" }, 501);
  for (const extension of ["hex", "uf2"]) {
    const object = await env.FIRMWARE_BUCKET.get(`firmware/${id}.${extension}`);
    if (object) return new Response(object.body, { headers: { "content-type": extension === "hex" ? "text/plain; charset=utf-8" : "application/octet-stream", "content-disposition": `attachment; filename=kaack-${id}.${extension}`, etag: object.httpEtag || "" } });
  }
  return json({ error: "Firmware file is not available yet" }, 404);
}

export default { async fetch(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/health") return json({ ok: true, service: "kaack-cloud-builder", mode: hasBuilder(env) ? "github-actions" : "demo", sourceConfigured: Boolean(sourceRepository(env)) });
    if (url.pathname === "/api/catalog" && request.method === "GET") return json(await catalog(env), 200, { "cache-control": "public, max-age=300" });
    if (url.pathname === "/api/options" && request.method === "GET") {
      if (sourceRepository(env)) return json(DEFAULT_OPTIONS, 200, { "cache-control": "public, max-age=3600" });
      const release = url.searchParams.get("release");
      if (!release || !/^[A-Za-z0-9._-]+$/.test(release)) return json({ error: "Invalid release" }, 400);
      const response = await fetch(`${upstream(env)}/api/options/${encodeURIComponent(release)}`);
      return new Response(response.body, { status: response.status, headers: { ...JSON_HEADERS, "cache-control": "public, max-age=3600" } });
    }
    if (url.pathname.startsWith("/api/targets/") && request.method === "GET") {
      const target = url.pathname.split("/").pop();
      if (!/^[A-Z0-9_-]+$/.test(target)) return json({ error: "Invalid target" }, 400);
      return json(await targetCatalog(env, target), 200, { "cache-control": "public, max-age=300" });
    }
    if (url.pathname === "/api/builds" && request.method === "POST") {
      const recipe = normalize(await request.json());
      const id = crypto.randomUUID();
      if (!hasBuilder(env)) return json({ id, mode: "demo", status: "queued", cacheKey: await cacheKey(recipe), request: recipe, message: sourceRepository(env) ? "Demo mode: GitHub builder credentials are not configured." : "Demo mode: configure the firmware source and GitHub builder secrets first." }, 202);
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
