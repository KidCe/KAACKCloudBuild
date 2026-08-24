import assert from "node:assert/strict";

const officialBase = process.env.BETAFLIGHT_BUILD_API || "https://build.betaflight.com";
const builderBase = process.env.KAACK_BUILD_API || "https://kaack-cloud-builder-api.n-kitsikoudis.workers.dev";
const officialRelease = process.env.BETAFLIGHT_OPTION_RELEASE || "4.5.3";
const kaackRelease = process.env.KAACK_OPTION_RELEASE || "kaack-4.5.3-v19";

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`);
  return response.json();
}

const [official, builder] = await Promise.all([
  getJson(`${officialBase}/api/options/${encodeURIComponent(officialRelease)}`),
  getJson(`${builderBase}/api/options?release=${encodeURIComponent(kaackRelease)}`)
]);

const categories = ["radioProtocols", "telemetryProtocols", "motorProtocols", "generalOptions"];
const mismatches = [];

for (const category of categories) {
  const shape = (item) => ({
    value: item.value,
    default: Boolean(item.default),
    includesTelemetry: Boolean(item.includesTelemetry),
    group: item.group || null
  });
  const expected = (official[category] || []).map(shape).sort((a, b) => a.value.localeCompare(b.value));
  const actual = (builder[category] || []).map(shape).sort((a, b) => a.value.localeCompare(b.value));
  try {
    assert.deepEqual(actual, expected);
  } catch {
    const expectedValues = new Set(expected.map((item) => item.value));
    const actualValues = new Set(actual.map((item) => item.value));
    mismatches.push({
      category,
      missing: [...expectedValues].filter((value) => !actualValues.has(value)),
      extra: [...actualValues].filter((value) => !expectedValues.has(value)),
      metadataMismatch: actual
        .filter((item) => expectedValues.has(item.value))
        .filter((item) => JSON.stringify(item) !== JSON.stringify(expected.find((expectedItem) => expectedItem.value === item.value)))
        .map((item) => item.value)
    });
  }
}

assert.deepEqual(mismatches, [], `Cloud Build option parity failed:\n${JSON.stringify(mismatches, null, 2)}`);
console.log(`Cloud Build option parity OK: ${kaackRelease} matches Betaflight ${officialRelease}.`);
