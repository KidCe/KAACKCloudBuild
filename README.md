# KAACK Cloud Builder

An unofficial, independent web-based cloud builder MVP for KAACK / alternative Betaflight firmware builds.

The UI intentionally stays close to the Betaflight Configurator firmware-flasher flow: choose a firmware line, then choose a version and target from that line, keep the common CRSF / Crossfire / DShot / Digital OSD defaults, optionally expand General Options, then build and download. The live catalog keeps official Betaflight and KAACK Community releases and targets separate.

Build flags are requested for the selected release from the Betaflight Cloud option catalog when available, with KAACK-specific fallbacks. The UI puts LED/VTX racing essentials first and keeps less common features grouped below. KAACK artifacts use a version marker such as `K4.5.3-V19` in the filename.

For configuring and backing up older KAACK firmware, use the [KidCe Configurator](https://kidce.github.io/KidCe-Configurator/) linked from the builder header.

This first vertical slice is intentionally quick to run:

- `index.html` + `app.js` provide the Cloud Build-style UI in English.
- `data/catalog.json` is a static test fixture; the browser uses the live Worker catalog.
- `worker/index.js` exposes separate Betaflight and KAACK Community catalogs and dispatches validated builds to GitHub Actions.
- `.github/workflows/build-firmware.yml` checks out an approved source tag/branch, builds the selected target and uploads firmware plus a provenance manifest.
- `.github/workflows/deploy-pages.yml` deploys the static UI to GitHub Pages.

## Run locally

```powershell
npm test
npm run serve
```

Open <http://127.0.0.1:4175>. Set `KAACK_PORT` if that port is already in use. The local preview is live-only: without a configured API it shows an explicit unavailable state and never creates a fake or flashable-looking package.

## Connect the live path

The public Pages site is <https://kidce.github.io/KAACKCloudBuild/>. The live API is intentionally deployed separately so the GitHub credential never reaches the browser.

In the repository's GitHub settings, open **Settings → Secrets and variables → Actions** and add these repository secrets:

- `CLOUDFLARE_API_TOKEN`: a narrowly scoped Cloudflare API token used only by the deployment workflow. The official [Cloudflare GitHub Actions guidance](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) recommends the **Edit Cloudflare Workers** template, restricted to this account. Do not put it in `wrangler.toml`, `index.html`, or chat.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID used by Wrangler.
- `WORKER_GITHUB_TOKEN`: a fine-grained GitHub token restricted to `KidCe/KAACKCloudBuild` with Actions read/write access. It is stored inside the Worker as `GITHUB_TOKEN` and is used only to dispatch builds and read their status/artifacts.

After saving them, run **Actions → Deploy KAACK Cloud Builder Worker → Run workflow**. The workflow deploys the Worker and then stores `WORKER_GITHUB_TOKEN` as the Worker runtime secret. It will fail before deployment if that secret is missing, rather than silently publishing an unavailable builder API.

Copy the `workers.dev` URL printed by the successful deployment and add it as the repository Actions variable `KAACK_API_BASE_URL`. Rerun **Deploy KAACK Cloud Builder Pages**. The Pages workflow writes that variable into `runtime-config.js`; no token is included in the static site.

Deploy `worker/` to Cloudflare Workers locally with `cd worker; npx wrangler deploy`, or through `.github/workflows/deploy-worker.yml`. The Worker runtime variables already define:

- `GITHUB_TOKEN` as a Worker secret with the minimum `Actions: write` and `Actions: read` access on the builder repository.
- `GITHUB_REPOSITORY` as a Worker variable naming the builder repository, such as `OWNER/REPOSITORY`.
- `GITHUB_REF` as the workflow-dispatch branch, normally `main`.
- `FIRMWARE_REPOSITORY` as `limonspb/betaflight`, the public KAACK source fork maintained by Ivan Efimov (Limon).
- `BETAFLIGHT_REPOSITORY` as `betaflight/betaflight`, the official source used when the Betaflight firmware line is selected.
- `FIRMWARE_CONFIG_REPOSITORY` as `betaflight/config` for the unified flight-controller configuration targets.
- `FIRMWARE_SOURCE_REFS` as a JSON array mapping the UI release ids to the real source branches. The racing line is displayed as `KAACK 4.5.3 / V19` but uses the technical branch `KAACK-4.5.0` plus its compatible pinned config commit; the newer line uses `KAACK-2025.12` and its checked-out config submodule.
- Optional `CATALOG_SOURCE_REF` to choose which source ref supplies the live target list.
- For the upstream fallback, use `UPSTREAM_BUILD_API` and `CATALOG_PROBE_TARGET` instead.
- In the builder repository, set the Actions variable `FIRMWARE_REPOSITORY` to the same approved firmware source.

When R2 is not configured, the Worker proxies the GitHub Actions artifact ZIP through `/api/builds/{id}/download`, so the first end-to-end test does not expose a GitHub token to the browser. For a direct `.hex` download, create the R2 bucket and bindings described below; the Worker then serves the structurally checked firmware file itself.

The Worker never accepts arbitrary shell arguments. The live source catalog is generated from classic `src/platform/*/target/*` targets plus `src/config/configs/*/config.h` targets from the checked-out config submodule or the release-specific pinned config ref. Releases are mapped to allow-listed refs, and flags are normalized and restricted to uppercase `USE_*` defines. The workflow validates them again before calling `make`. This keeps the community-facing label `KAACK 4.5.3 / V19` separate from the technical source ref `KAACK-4.5.0`.

The option catalog comes directly from the official Betaflight API. KAACK 4.5.3 / V19 does not implement `USE_CHIRP`, `USE_OPTICALFLOW`, or `USE_SERIALRX_MAVLINK`; those controls are visibly disabled and the Worker rejects attempts to inject them as custom defines. Official Betaflight releases before 4.5 are excluded because they require the legacy unified-target build path. See the [compatibility audit](research/betaflight-builder-compatibility-audit.md) for the remaining evidence and hardware-validation limits.

For the first live test, the artifact download is the GitHub Actions artifact ZIP. For the direct firmware path, activate R2, create a bucket named `kaack-firmware`, uncomment the `FIRMWARE_BUCKET` binding in `worker/wrangler.toml`, and add these repository settings:

- Secret `R2_ACCESS_KEY_ID`: the R2 S3 Access Key ID.
- Secret `R2_SECRET_ACCESS_KEY`: the R2 S3 Secret Access Key.
- Variable `R2_BUCKET_NAME`: `kaack-firmware`.

Use an R2 API token with **Object Read & Write** scoped only to this bucket. The workflow publishes the structurally checked descriptive `.hex`/`.uf2` filename, `manifest.json` and checksum under the build ID. The Worker then serves the firmware directly from `/api/builds/{id}/download`; GitHub artifacts remain the audit/fallback copy rather than the normal user download.

## Reference-build verification

The official Betaflight Build API is used as a reference, not as the production builder. For a comparison, use the same source commit, target, effective `USE_*` options, `BUILD_KEY` and `RELEASE_NAME`; the workflow exposes optional `build_key` and `release_name` inputs for this purpose. Compare the downloaded HEX SHA-256 and the official build JSON/log. A successful compiler run by itself is not evidence of byte-for-byte equivalence.

## Safety boundary

Compilation success does not prove hardware compatibility. Verify the selected target, source commit, manifest and checksum, then do a props-off bench test before flight use. This service is not affiliated with or supported by Betaflight.

## AI assistance disclosure

This project was created and maintained with substantial assistance from OpenAI Codex. The repository maintainer directed the work, made the project decisions, and is responsible for reviewing and using the result.
