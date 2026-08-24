import test from "node:test";
import assert from "node:assert/strict";
import { autoTelemetryForRadio, canonicalizeBuildDefine, expandBuildFlags } from "../shared/build-flags.js";
import { normalize, optionsForRelease } from "../worker/index.js";

test("serial receiver protocols include the receiver parent and matching telemetry", () => {
  const expectations = new Map([
    ["USE_SERIALRX_CRSF", "USE_TELEMETRY_CRSF"],
    ["USE_SERIALRX_FPORT", "USE_TELEMETRY_SMARTPORT"],
    ["USE_SERIALRX_GHST", "USE_TELEMETRY_GHST"],
    ["USE_SERIALRX_JETIEXBUS", "USE_TELEMETRY_JETIEXBUS"]
  ]);

  for (const [radio, telemetry] of expectations) {
    assert.equal(autoTelemetryForRadio(radio), telemetry);
    const flags = expandBuildFlags([radio], { firmware: "kaack", version: "kaack-4.5.3-v19" });
    assert.ok(flags.includes("USE_SERIALRX"), radio);
    assert.ok(flags.includes("USE_TELEMETRY"), radio);
    assert.ok(flags.includes(telemetry), radio);
  }
});

test("build option dependencies match Betaflight cloud-build semantics", () => {
  assert.deepEqual(
    expandBuildFlags(["USE_OSD_HD", "USE_LED_STRIP_64", "USE_TELEMETRY_IBUS_EXTENDED"], { firmware: "betaflight", version: "4.5.3" }),
    ["USE_LED_STRIP", "USE_LED_STRIP_64", "USE_OSD", "USE_OSD_HD", "USE_TELEMETRY", "USE_TELEMETRY_IBUS_EXTENDED"]
  );
});

test("special Betaflight options expand exactly like the official builder", () => {
  assert.deepEqual(
    expandBuildFlags(["USE_RX_PPM", "USE_EMFAT_TOOLS", "USE_ESCSERIAL_SIMONK", "USE_GPS"], { firmware: "betaflight", version: "4.5.3" }),
    ["USE_EMFAT_AUTORUN", "USE_EMFAT_ICON", "USE_EMFAT_TOOLS", "USE_ESCSERIAL_SIMONK", "USE_GPS", "USE_GPS_PLUS_CODES", "USE_PPM", "USE_RX_PPM", "USE_SERIAL_4WAY_SK_BOOTLOADER"]
  );
  assert.deepEqual(
    expandBuildFlags(["USE_SERIALRX_MAVLINK"], { firmware: "betaflight", version: "4.5.3" }),
    ["USE_SERIALRX", "USE_SERIALRX_MAVLINK"]
  );
});

test("KAACK source-enforced features are represented in every recipe", () => {
  const flags = expandBuildFlags(["USE_DSHOT"], { firmware: "kaack", version: "kaack-4.5.3-v19" });
  assert.ok(flags.includes("USE_LED_STRIP"));
  assert.ok(flags.includes("USE_RACE_PRO"));
});

test("Configurator-style custom defines are canonicalized safely", () => {
  assert.equal(canonicalizeBuildDefine("OSD_QUICK_MENU"), "USE_OSD_QUICK_MENU");
  assert.equal(canonicalizeBuildDefine("USE_VTX"), "USE_VTX");
  assert.equal(canonicalizeBuildDefine("SMARTAUDIO_NOPULLDOWN"), "USE_SMARTAUDIO_NOPULLDOWN");
  assert.equal(canonicalizeBuildDefine("bad-define"), null);
  assert.equal(canonicalizeBuildDefine("USE_VTX;curl"), null);
});

test("worker normalization applies the same dependency closure used by the UI", () => {
  const recipe = normalize({
    firmware: "kaack",
    version: "kaack-4.5.3-v19",
    target: "HDZERO_HALO",
    flags: ["SERIALRX_CRSF", "DSHOT", "OSD_HD", "LED_STRIP_64", "VTX"]
  });
  assert.deepEqual(recipe.flags, [
    "USE_DSHOT", "USE_LED_STRIP", "USE_LED_STRIP_64", "USE_OSD", "USE_OSD_HD", "USE_RACE_PRO",
    "USE_SERIALRX", "USE_SERIALRX_CRSF", "USE_TELEMETRY", "USE_TELEMETRY_CRSF", "USE_VTX"
  ]);
  assert.throws(() => normalize({ firmware: "kaack", version: "kaack-4.5.3-v19", target: "HDZERO_HALO", flags: ["bad-define"] }), /Invalid custom build define/);
});

test("release options preserve upstream metadata and mark source-incompatible features", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    radioProtocols: [{ name: "CRSF", value: "USE_SERIALRX_CRSF", default: true, includesTelemetry: true }, { name: "MAVLINK", value: "USE_SERIALRX_MAVLINK" }],
    telemetryProtocols: [{ name: "[None]", value: "", default: false }],
    motorProtocols: [{ name: "DSHOT", value: "USE_DSHOT", default: true }],
    generalOptions: [{ name: "Chirp", value: "USE_CHIRP", default: false }, { name: "OSD (Digital)", value: "USE_OSD_HD", group: "OSD", groupedName: "Digital" }]
  }), { status: 200 });
  try {
    const options = await optionsForRelease({
      FIRMWARE_SOURCE_REFS: JSON.stringify([{ release: "kaack-4.5.3-v19", ref: "KAACK-4.5.0", unsupportedFlags: ["USE_CHIRP", "USE_SERIALRX_MAVLINK"] }])
    }, "kaack-4.5.3-v19");
    assert.equal(options.radioProtocols[0].includesTelemetry, true);
    assert.equal(options.radioProtocols[1].unsupported, true);
    assert.equal(options.generalOptions[0].unsupported, true);
    assert.equal(options.osdProtocols[0].name, "Digital");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
