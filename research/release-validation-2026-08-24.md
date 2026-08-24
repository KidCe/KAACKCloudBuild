# KAACK Cloud Builder release validation

- **Validation date:** 2026-08-24
- **Validated implementation commit:** `16e8f1869fdb00631699aec40ff9e7fb380d99e1`
**Scope:** Cloud Build option semantics, immutable source/config selection, GitHub Actions compilation, Worker status/download flow, and firmware artifact structure. No flight controller was flashed.

## Outcome

The reported CRSF/ELRS build omission is fixed in the live builder. A CRSF recipe now contains all four required compile-time gates:

- `USE_SERIALRX`
- `USE_SERIALRX_CRSF`
- `USE_TELEMETRY`
- `USE_TELEMETRY_CRSF`

The live KAACK 4.5.3 / V19 option catalog matches the official Betaflight 4.5.3 catalog for values, defaults, groups, and `includesTelemetry` metadata. The automated live parity check passed.

The builder is substantially safer and closer to Betaflight Cloud Build semantics, but a public “hardware verified” claim is not justified until props-off bench tests confirm receiver binding, UART persistence, CLI parameters, OSD, motors, and VTX on physical boards.

## Fixes made during the audit

- Removed the local fallback option merge that overwrote official defaults and `includesTelemetry`.
- Added official dependency expansion for serial RX, automatic telemetry, OSD, LED64, PPM, GPS, EMFAT, and ESC Serial/4-way.
- Stopped adding MAVLink telemetry merely because MAVLink RX was selected.
- Added KAACK source-enforced `USE_RACE_PRO` and `USE_LED_STRIP` to every KAACK recipe and manifest.
- Pinned KAACK source commits and compatible config commits.
- Pinned official source commits and their source-coupled config submodules; official 4.5 uses the flat-layout config reference embedded by the official reference build.
- Excluded Betaflight releases before 4.5 because the current workflow does not implement the legacy unified-target build path.
- Disabled and server-rejected three options absent from KAACK V19 source: `USE_CHIRP`, `USE_OPTICALFLOW`, and `USE_SERIALRX_MAVLINK`.
- Fixed embedded quote characters in `BUILD_KEY` and `RELEASE_NAME`.
- Added the config commit to the cache identity.
- Replaced first-file artifact selection with exact target-suffix selection and one-candidate enforcement.
- Added Intel HEX EOF, checksum/decode, target ELF identity, ELF-to-HEX reproduction, manifest, and SHA-256 checks.

## Live option and API checks

- Worker health: live GitHub Actions builder available.
- `npm test`: 11/11 passed.
- `npm run audit:parity`: passed for KAACK 4.5.3 / V19 against official Betaflight 4.5.3.
- Unsupported V19 options are marked in the live catalog and rejected before workflow dispatch.
- Betaflight 4.4.3 requests are rejected before workflow dispatch.
- Worker status and download routes returned successful ZIP artifacts for all three priority KAACK builds.

## Priority KAACK V19 build matrix

All builds used source `8cd44381217948c0b2b5087f12e17dde15d6a25c`, config `9a9f899aab4c4ffaa74f973a643447b48453ff54`, Digital OSD, DShot, LED Strip, LED64, VTX, and CRSF/ELRS telemetry.

| Target | GitHub Actions run | HEX SHA-256 | Data bytes | Address range | Result |
|---|---|---|---:|---|---|
| `HDZERO_HALO` | [32776524946](https://github.com/KidCe/KAACKCloudBuild/actions/runs/32776524946) | `2d4588d7dfdccc4de67dc800e2384dcb152b837990177333e306986df98dc12e` | 399153 | `0x08000000`–`0x080A1498` | Passed |
| `MAMBAF722_2022B` | [32776527948](https://github.com/KidCe/KAACKCloudBuild/actions/runs/32776527948) | `32543a5b17ff9ce75e698b96a3843b62fc2d7c8852fd72cf71b08f568d6c4d08` | 362763 | `0x08000000`–`0x0806072A` | Passed |
| `HGLRCF722MINI` | [32776530862](https://github.com/KidCe/KAACKCloudBuild/actions/runs/32776530862) | `f4217fd92db591e14949cede8d238747f10149b9147d116182612195ea7afbb4` | 364503 | `0x08000000`–`0x08060DF6` | Passed |

Each artifact passed record checksums, exactly one EOF record, target-specific ELF/HEX matching, manifest/hash verification, required CRSF flags, unquoted embedded build metadata, and source/config provenance checks.

## Official-path smoke tests

- Betaflight 4.5.3 / `HDZERO_HALO`: [run 32776955428](https://github.com/KidCe/KAACKCloudBuild/actions/runs/32776955428), source `0e533ba76cb9129458578f7fa2134df1449596ba`, config `92c695af8a2756d75152b54959de28d48fc25cf7`, passed.
- Betaflight 2025.12.5 / `HDZERO_HALO`: [run 32776026268](https://github.com/KidCe/KAACKCloudBuild/actions/runs/32776026268), source `7348054f268f0058574719c134e9f149565bb8ea`, source-pinned config `92c695af8a2756d75152b54959de28d48fc25cf7`, passed.

An official Betaflight 4.5.3 reference request normalized to the same functional flag set as this builder. A controlled rebuild was not byte-identical even with the same source, target, flags, build key, and release name. This is expected when build/config revision metadata and execution environments differ. For KAACK, byte identity with official Betaflight is impossible because KAACK is different source code. The acceptance criterion is semantic option parity plus explicit KAACK deltas, not identical SHA-256.

## Remaining release gates

1. Flash each priority target on a props-off bench and verify the exact target shown by Configurator.
2. Confirm Serial RX stays selected after save/reboot, CRSF/ELRS binds, channels move, telemetry works, and `report_cell_voltage` exists.
3. Verify Digital OSD, DShot motor output, VTX control, LED Strip, and LED64 on representative hardware.
4. Back up and diff `diff all` / `dump all` before and after the test.
5. Treat all other catalogued targets as unverified until their exact release/target pair has at least passed the compiler matrix; do not equate catalog presence with hardware support.
6. R2 is intentionally not configured, so users currently receive a GitHub Actions ZIP containing the HEX, manifest, and checksums rather than a direct HEX response.

## Primary references

- [Betaflight Cloud Build API documentation](https://github.com/betaflight/betaflight.com/blob/master/docs/development/API/Cloud-Build-API.md)
- [Betaflight Configurator build request implementation](https://github.com/betaflight/betaflight-configurator/blob/24d543bf52a94c66834e6190e15cae069f6c1825/src/composables/useCloudBuild.js)
- [Betaflight Configurator API client](https://github.com/betaflight/betaflight-configurator/blob/24d543bf52a94c66834e6190e15cae069f6c1825/src/js/BuildApi.js)
- [Official Cloud Build runner](https://github.com/betaflight/cloudbuild/blob/9b7277101696dce59925312cf371cfbf057e68fd/build.sh)
- [KAACK V19 source](https://github.com/limonspb/betaflight/tree/8cd44381217948c0b2b5087f12e17dde15d6a25c)

---

*AI assistance disclosure: this validation, implementation, automated checks, and report were produced with substantial AI assistance and checked against the linked primary sources and live build artifacts.*
