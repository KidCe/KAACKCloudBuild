const AUTO_TELEMETRY_BY_RADIO = new Map([
  ["USE_SERIALRX_CRSF", "USE_TELEMETRY_CRSF"],
  ["USE_SERIALRX_FPORT", "USE_TELEMETRY_SMARTPORT"],
  ["USE_SERIALRX_GHST", "USE_TELEMETRY_GHST"],
  ["USE_SERIALRX_JETIEXBUS", "USE_TELEMETRY_JETIEXBUS"]
]);

export const KAACK_SOURCE_FLAGS = new Set(["USE_LED_STRIP", "USE_RACE_PRO"]);

export function autoTelemetryForRadio(radioFlag) {
  return AUTO_TELEMETRY_BY_RADIO.get(radioFlag) || "";
}

export function canonicalizeBuildDefine(value) {
  const token = String(value || "").trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(token)) return null;
  if (token === "CLOUD_BUILD" || token === "CORE_BUILD") return null;
  return token.startsWith("USE_") ? token : `USE_${token}`;
}

export function expandBuildFlags(input, context = {}) {
  const flags = new Set();
  for (const value of input || []) {
    const canonical = canonicalizeBuildDefine(value);
    if (canonical) flags.add(canonical);
  }

  for (const radioFlag of [...flags].filter((flag) => flag.startsWith("USE_SERIALRX_"))) {
    flags.add("USE_SERIALRX");
    const telemetryFlag = autoTelemetryForRadio(radioFlag);
    if (telemetryFlag) {
      flags.add("USE_TELEMETRY");
      flags.add(telemetryFlag);
    }
  }

  if ([...flags].some((flag) => flag.startsWith("USE_TELEMETRY_"))) flags.add("USE_TELEMETRY");
  if (flags.has("USE_OSD_HD") || flags.has("USE_OSD_SD")) flags.add("USE_OSD");
  if (flags.has("USE_LED_STRIP_64")) flags.add("USE_LED_STRIP");
  if (flags.has("USE_RX_PPM")) flags.add("USE_PPM");
  if (flags.has("USE_EMFAT_TOOLS")) {
    flags.add("USE_EMFAT_AUTORUN");
    flags.add("USE_EMFAT_ICON");
  }
  if (flags.has("USE_ESCSERIAL_SIMONK")) flags.add("USE_SERIAL_4WAY_SK_BOOTLOADER");
  if (flags.has("USE_GPS")) flags.add("USE_GPS_PLUS_CODES");

  if (context.firmware === "kaack") {
    for (const flag of KAACK_SOURCE_FLAGS) flags.add(flag);
  }

  return [...flags].sort();
}
