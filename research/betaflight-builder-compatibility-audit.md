# Betaflight Cloud Builder compatibility audit

**Audit date:** 2026-08-24  
**Repository snapshot:** working tree at `9989f96469cabd231b698d7d791a9d9d67e3cf56`, including the uncommitted builder changes present during the audit.  
**Scope:** API/configurator behavior, option dependencies, source/config selection, build commands, targets, and artifacts. No hardware flashing was performed.

## Executive conclusion

The repository is **not yet release-ready as a Betaflight-compatible Cloud Builder**. Its current 4.5+ build path is directionally close to Betaflight's runner, and the recently added parent/dependency expansion fixes the reported CRSF/ELRS omission. However, the public Worker is behind the local implementation, official 4.4 builds can silently take the wrong target path, KAACK target support is inferred too loosely, and a structurally decodable HEX plus SHA-256 is presented as “verified” without validating target identity, address range, or effective compiled feature set.

“Identical to Betaflight plus KAACK features” is a valid **semantic compatibility goal**, but byte-for-byte identity with official Betaflight is impossible for KAACK because the source is different and build metadata/environment are not identical.

## Compatibility matrix

| Area | Official behavior | Repository behavior | Result |
|---|---|---|---|
| Releases and targets | Configurator reads `/api/targets`, `/api/targets/{target}`, and `/api/builds/{release}/{target}`; the API gates each target/release pair. | Uses custom `/api/catalog` and `/api/targets/{target}?firmware=…`. Official Betaflight pairs are checked upstream; KAACK pairs are based mainly on file existence. | **Partial** |
| Options | Configurator reads `/api/options/{release}` and sends `{target, release, options}` to `/api/builds`. CRSF and similar radio entries carry `includesTelemetry`. | Local Worker proxies the official release options and derives OSD entries, but exposes a different route/body contract. The deployed Worker still returns an older divergent catalog. | **Partial / deployment drift** |
| Dependencies | Official UI sends selected child options; firmware/API semantics provide required parents and protocol coupling. | `shared/build-flags.js` now adds `USE_SERIALRX`, `USE_TELEMETRY`, matching telemetry, `USE_OSD`, LED parent, and selected secondary dependencies. | **Good for covered cases** |
| Source/config pinning | Official runner checks out a requested commit, updates `src/config` when present, otherwise runs `make configs`, then updates SDK submodules. | KAACK source commits are pinned; V19 also pins config. Official source and current config commits are pinned per request, but the config is not matched to upstream `configHash` or included in recipe/cache identity. | **Mostly aligned, not reference-identical** |
| Build command | Official runner executes `make $TARGET EXTRA_FLAGS="$FLAGS"`. | Uses `make CONFIG=$target` for config targets or `make $target` for classic targets, plus a separate optional UF2 build. This is reasonable for 4.5+ config targets but not equivalent for 4.4 unified targets. | **Partial** |
| Artifact assurance | Official runner returns compiler output and the Configurator parses/downloads it through the official build record. | Accepts the first non-empty `.hex`, checks EOF and `objcopy` decodability, renames it, creates a manifest and SHA-256 file, then labels it verified. | **Insufficient** |
| Official Configurator compatibility | Uses official endpoint shapes and 32-character Cloud Build keys; build links point to `build.betaflight.com`. | Uses UUIDs with hyphens (36 characters), custom status/download routes, and has no official build JSON/log endpoints. | **Not compatible** |

## Findings

### 1. Release/target/options endpoints are not API-compatible

The official Configurator calls `/api/targets`, `/api/targets/{target}`, `/api/builds/{release}/{target}`, `/api/options/{release}`, `POST /api/builds`, `/api/builds/{key}/status`, and `/api/builds/{key}/json` ([official `BuildApi.js`](https://github.com/betaflight/betaflight-configurator/blob/24d543bf52a94c66834e6190e15cae069f6c1825/src/js/BuildApi.js#L130-L215)). It submits `{target, release, options}` and includes `CLOUD_BUILD` in the options array ([official `useCloudBuild.js`](https://github.com/betaflight/betaflight-configurator/blob/24d543bf52a94c66834e6190e15cae069f6c1825/src/composables/useCloudBuild.js#L153-L203)).

This repository instead exposes `/api/catalog`, `/api/options?release=…`, a firmware query parameter on target lookup, a different POST body, and `/api/builds/{uuid}` for status ([`worker/index.js`](../worker/index.js)). That is acceptable for the custom web UI, but it is not a drop-in Cloud Build API and should not be described as such.

The live official API snapshot contained 17 releases and 642 targets; stable entries included 4.4.3, 4.5.3, 4.5.5, 2025.12.5, and 2026.6.1 ([releases](https://build.betaflight.com/api/releases), [targets](https://build.betaflight.com/api/targets)). The local Worker correctly uses the upstream target/release relationship for official Betaflight. It does not fetch the official `/api/builds/{release}/{target}` detail, so it discards `configuration`, `buildFlags`, `configHash`, and output-extension evidence that should be recorded or checked ([example build detail](https://build.betaflight.com/api/builds/4.5.3/MAMBAF722_2022B)).

### 2. Local option handling is improved, but the deployed Worker is stale

For 4.5.3 the official CRSF radio option is `USE_SERIALRX_CRSF`, defaults on, and has `includesTelemetry: true`; CRSF therefore does not appear as a separate telemetry choice ([official options](https://build.betaflight.com/api/options/4.5.3)). The Configurator disables telemetry selection and shows “Automatically Included” when that metadata is set ([`FirmwareFlasherTab.vue`](https://github.com/betaflight/betaflight-configurator/blob/24d543bf52a94c66834e6190e15cae069f6c1825/src/components/tabs/FirmwareFlasherTab.vue#L598-L637)).

The current local code mirrors that behavior and maps KAACK labels to the corresponding official option release. It also stores general options per firmware line and release. Nevertheless, `npm run audit:parity` against the public Worker failed on 2026-08-24: the deployment still had a separate CRSF telemetry entry, missing `includesTelemetry` metadata, five extra general options, and several default mismatches. **The local Worker must be deployed and the parity audit must pass before release.**

The UI uses one select each for receiver, motor protocol, telemetry, and OSD, which prevents ordinary users selecting multiple members of those families. The server still accepts arbitrary expert `USE_*` defines without checking them against the selected release or rejecting contradictory family members. Requested flags can therefore differ from effective compiled flags.

### 3. Required parent macros are now covered, but only by unit-level evidence

KAACK's `common_post.h` removes every `USE_SERIALRX_*` child if `USE_SERIALRX` is absent, and removes every `USE_TELEMETRY_*` child if `USE_TELEMETRY` is absent ([KAACK `common_post.h`](https://github.com/limonspb/betaflight/blob/8cd44381217948c0b2b5087f12e17dde15d6a25c/src/main/target/common_post.h#L198-L223)). It also couples FPORT to SmartPort, JETIEXBUS to JETI telemetry, CRSF telemetry to CRSF RX, GHST telemetry to GHST RX, and extended IBUS telemetry to base IBUS telemetry ([same source](https://github.com/limonspb/betaflight/blob/8cd44381217948c0b2b5087f12e17dde15d6a25c/src/main/target/common_post.h#L225-L290)).

`shared/build-flags.js` now expands these parent/dependency macros, handles PPM separately, and the workflow selects the matching default RX feature. KAACK itself derives `FEATURE_RX_SERIAL` from `USE_SERIALRX` ([KAACK `feature.h`](https://github.com/limonspb/betaflight/blob/8cd44381217948c0b2b5087f12e17dde15d6a25c/src/main/config/feature.h#L29-L40)), so the workflow's explicit default is redundant but consistent. This should fix the specific CRSF/ELRS symptom and missing telemetry settings such as `report_cell_voltage` at compile time.

The evidence is currently limited to option-expansion tests; no fresh end-to-end build, CLI parameter inventory, receiver bind, or UART persistence test was performed in this audit. The local automated suite passed 9/9 after the current dependency changes, but those are unit/static tests rather than compiler or hardware evidence.

### 4. KAACK forced features are represented, but effective-option verification is still absent

KAACK V19 unconditionally defines `USE_RACE_PRO` and `USE_LED_STRIP` ([KAACK `common_pre.h`](https://github.com/limonspb/betaflight/blob/8cd44381217948c0b2b5087f12e17dde15d6a25c/src/main/target/common_pre.h#L56-L62)). Its Race Pro pack conditionally enables further behavior depending on DShot telemetry and OSD ([same source](https://github.com/limonspb/betaflight/blob/8cd44381217948c0b2b5087f12e17dde15d6a25c/src/main/target/common_pre.h#L452-L473)). The repository now adds Race Pro and LED Strip to every KAACK recipe, so filenames/manifests no longer omit those source-enforced top-level features.

However, the manifest still records the normalized **requested** flags, not the macros left after target headers and `common_post.h` have added or removed dependencies. Unknown custom macros compile harmlessly and are still advertised in the filename/manifest. A release artifact therefore needs a generated effective-feature record from the actual preprocessor/build output, with requested and effective options stored separately.

### 5. KAACK target compatibility is over-advertised

Official config targets must define `FC_TARGET_MCU`, `BOARD_NAME`, and `MANUFACTURER_ID`. The Cloud Build API also uses `REFERENCE`, `DATE`, `VERSION`, and `GROUP` metadata to mark support and prevent targets being offered for incompatible older releases ([official config README](https://github.com/betaflight/config/blob/5af0c8b02a7d85b9777a8010b05f0ea04044fd20/README.md#L33-L89)).

The KAACK catalog currently treats a matching `config.h` path as compatibility and does not parse these required fields or release gates. It can therefore offer a new config to an older KAACK source that cannot compile or correctly support it. The classic-target path regex also misses the KAACK 4.5 layout `src/main/target/{target}/target.mk`, although config targets cover most board choices.

Before release, KAACK targets should be indexed per pinned source/config pair, required metadata should be parsed, `VERSION`/`DATE` gates enforced, and each advertised pair should have a successful matrix build. “Supported” should mean validated on that exact pair; mere catalog presence should remain “unverified.”

### 6. Official Betaflight 4.4 is a hard build-path bug

The official API still offers 4.4.3 for targets such as MAMBAF722_2022B and supplies a unified-target CLI configuration plus target-specific `buildFlags` ([official 4.4.3 detail](https://build.betaflight.com/api/builds/4.4.3/MAMBAF722_2022B)). Betaflight 4.4's Makefile has no config-target support and defaults to `STM32F405` when no target is supplied ([official 4.4.3 Makefile](https://github.com/betaflight/betaflight/blob/4.4.3/Makefile)).

The Worker currently resolves the latest official config-repository commit for every official release. The workflow clones that config, finds the selected board's modern `config.h`, and runs `make CONFIG={board}`. Betaflight 4.4 does not interpret `CONFIG`; with no make target supplied it defaults to `STM32F405`. This path can therefore compile a non-empty **wrong-target firmware and rename it as the requested board**, which is more dangerous than a clean failure. The workflow also ignores the 4.4 build detail's base-target `buildFlags` and unified CLI configuration. Either implement the complete 4.4 path or exclude all pre-4.5 releases immediately.

### 7. Source pinning is good for KAACK; config and environment pinning remain incomplete

The configured KAACK releases resolve to immutable source commits. V19 also uses a fixed config commit; KAACK 2025.12 uses its checked-out config submodule. Stable official releases resolve to the commit supplied by the official API. This is materially safer than building mutable branch names.

The official runner fetches the requested commit, updates `src/config` when available, otherwise runs `make configs`, updates SDK submodules, and executes `make $TARGET EXTRA_FLAGS="$FLAGS"` ([official `build.sh`](https://github.com/betaflight/cloudbuild/blob/9b7277101696dce59925312cf371cfbf057e68fd/build.sh#L19-L50)). Its image pins ARM GNU 10.3-2021.10 for 4.4/4.5 and 13.3.Rel1 for 2025.12+ ([official Dockerfile](https://github.com/betaflight/cloudbuild/blob/9b7277101696dce59925312cf371cfbf057e68fd/Dockerfile#L6-L62)).

This workflow uses the source's `arm_sdk_install`, but runs on mutable `ubuntu-latest`. It now resolves and checks out an immutable config commit for each official request, which improves reproducibility; however, that commit is the current config `master`, is not checked against the official target detail's `configHash`, and is not included in the displayed recipe/cache identity. The manifest records the resulting commit, which is good. Reproducible or reference-comparison builds still require the official source/config relationship, runner/toolchain image digest, and all build metadata to be pinned.

### 8. Artifact “verification” is not sufficient for flight firmware

The workflow checks that some `.hex` file under `firmware/obj` is non-empty, has an Intel HEX EOF record, and can be decoded to a non-empty binary by ARM `objcopy`; it then copies the first match and calculates SHA-256. These are useful structural checks. They do **not** prove that every HEX record is safe for the selected MCU, that the firmware targets the requested board, that its address range is correct, that it contains the requested features, or that it was built from the stated configuration. SHA-256 proves only that downloaded bytes match stored bytes.

Required release gates are:

1. Select the expected compiler output by exact target-derived name, not `find … -print -quit`.
2. Parse every Intel HEX record and checksum; reject overlaps, malformed EOF, and addresses outside the target MCU/application region.
3. Verify embedded firmware target/board, version, source revision, build key, and release name against the request.
4. Record requested options, effective preprocessor macros, source/config commits, compiler version, runner/container digest, and hashes.
5. Rebuild a fixed matrix (including HDZERO_HALO, MAMBAF722_2022B, and HGLRCF722MINI) and compare reproducibility or, where bytes cannot match, compare ELF sections/symbols and firmware metadata.
6. Run Configurator/CLI smoke tests and bench tests with props removed before declaring a target supported.

Until those gates pass, UI text should say “build completed; checksum supplied,” not “verified firmware.”

## Why KAACK cannot be byte-for-byte identical to official Betaflight

KAACK V19 is a different source commit with additional code and forced feature macros, so its firmware cannot equal official Betaflight bytes. Even two builds from the same source need identical source/config commits, compiler and linker, environment, flags and flag order, `BUILD_KEY`, `RELEASE_NAME`, and build time. Both official Betaflight and KAACK embed `__DATE__`, build key, and release name in firmware ([official `version.c`](https://github.com/betaflight/betaflight/blob/d26516289e7e39aee53626beb91d51725ee0677f/src/main/build/version.c#L30-L40), [KAACK `version.c`](https://github.com/limonspb/betaflight/blob/8cd44381217948c0b2b5087f12e17dde15d6a25c/src/main/build/version.c#L37-L47)).

The correct acceptance target is therefore:

- for official Betaflight: reproduce the official API's source, config, target detail, option normalization, toolchain, and command closely enough to support a controlled reference comparison;
- for KAACK: establish semantic parity with the matching Betaflight baseline, then document and test the intentional KAACK delta. Do not use equality with official Betaflight HEX as the criterion.

## Release decision

**No-go** until at least: the public Worker matches the local option contract; 4.4 is removed or correctly implemented; the green unit suite is supplemented by compiler/E2E gates; target/release gating is source-aware; artifact validation verifies target and flash-region identity in addition to structure and SHA-256; and the three priority boards pass real end-to-end builds plus bench validation. Official Configurator API compatibility should either be implemented explicitly or clearly declared out of scope.

## Primary sources

- [Betaflight Cloud Build API documentation](https://github.com/betaflight/betaflight.com/blob/master/docs/development/API/Cloud-Build-API.md)
- [Betaflight Configurator Cloud Build client](https://github.com/betaflight/betaflight-configurator/blob/24d543bf52a94c66834e6190e15cae069f6c1825/src/js/BuildApi.js)
- [Betaflight Configurator request construction](https://github.com/betaflight/betaflight-configurator/blob/24d543bf52a94c66834e6190e15cae069f6c1825/src/composables/useCloudBuild.js)
- [Official Cloud Build runner](https://github.com/betaflight/cloudbuild/blob/9b7277101696dce59925312cf371cfbf057e68fd/build.sh)
- [Official target-config rules](https://github.com/betaflight/config/blob/5af0c8b02a7d85b9777a8010b05f0ea04044fd20/README.md)
- [KAACK V19 source](https://github.com/limonspb/betaflight/tree/8cd44381217948c0b2b5087f12e17dde15d6a25c)

---

*AI assistance disclosure: this source audit and report were produced with substantial AI assistance and checked against the linked first-party repositories and live official API responses.*
