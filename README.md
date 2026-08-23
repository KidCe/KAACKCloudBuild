# KAACK Cloud Builder

An unofficial, independent web-based cloud builder MVP for KAACK / alternative Betaflight firmware builds.

The UI intentionally stays close to the Betaflight Configurator firmware-flasher flow: choose firmware line, version and target, keep the common CRSF / Crossfire / DShot / Digital OSD defaults, optionally expand General Options, then build and download.

This first vertical slice is intentionally quick to run:

- `index.html` + `app.js` provide the Cloud Build-style UI in English.
- `data/catalog.json` makes local UX testing work without an account or secret.
- `worker/index.js` exposes either the upstream catalog or a source-backed KAACK catalog and dispatches validated builds to GitHub Actions.
- `.github/workflows/build-firmware.yml` checks out an approved source tag/branch, builds the selected target and uploads firmware plus a provenance manifest.
- `.github/workflows/deploy-pages.yml` deploys the static UI to GitHub Pages.

## Run locally

```powershell
npm test
npm run serve
```

Open <http://127.0.0.1:4175>. Set `KAACK_PORT` if that port is already in use. Local mode produces a clearly labelled demo package that is **not flashable**. It is there to test the UI, deterministic recipe, status transitions and download interaction before connecting a real builder.

## Connect the live path

The public Pages site is <https://kidce.github.io/KAACKCloudBuild/>. The live API is intentionally deployed separately so the GitHub credential never reaches the browser.

In the repository's GitHub settings, open **Settings → Secrets and variables → Actions** and add these repository secrets:

- `CLOUDFLARE_API_TOKEN`: a narrowly scoped Cloudflare API token used only by the deployment workflow. The official [Cloudflare GitHub Actions guidance](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) recommends the **Edit Cloudflare Workers** template, restricted to this account. Do not put it in `wrangler.toml`, `index.html`, or chat.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID used by Wrangler.
- `WORKER_GITHUB_TOKEN`: a fine-grained GitHub token restricted to `KidCe/KAACKCloudBuild` with Actions read/write access. It is stored inside the Worker as `GITHUB_TOKEN` and is used only to dispatch builds and read their status/artifacts.

After saving them, run **Actions → Deploy KAACK Cloud Builder Worker → Run workflow**. The workflow deploys the Worker and then stores `WORKER_GITHUB_TOKEN` as the Worker runtime secret. It will fail before deployment if that secret is missing, rather than silently publishing a demo-only API.

Copy the `workers.dev` URL printed by the successful deployment and add it as the repository Actions variable `KAACK_API_BASE_URL`. Rerun **Deploy KAACK Cloud Builder Pages**. The Pages workflow writes that variable into `runtime-config.js`; no token is included in the static site.

Deploy `worker/` to Cloudflare Workers locally with `cd worker; npx wrangler deploy`, or through `.github/workflows/deploy-worker.yml`. The Worker runtime variables already define:

- `GITHUB_TOKEN` as a Worker secret with the minimum `Actions: write` and `Actions: read` access on the builder repository.
- `GITHUB_REPOSITORY` as a Worker variable naming the builder repository, such as `OWNER/REPOSITORY`.
- `GITHUB_REF` as the workflow-dispatch branch, normally `main`.
- `FIRMWARE_REPOSITORY` as `limonspb/betaflight`, the public KAACK source fork maintained by Ivan Efimov (Limon).
- `FIRMWARE_CONFIG_REPOSITORY` as `betaflight/config` for the unified flight-controller configuration targets.
- `FIRMWARE_SOURCE_REFS` as a JSON array mapping the UI release ids to the real source branches. The racing line is displayed as `KAACK 4.5.3 / V19` but uses the technical branch `KAACK-4.5.0` plus its compatible pinned config commit; the newer line uses `KAACK-2025.12` and its checked-out config submodule.
- Optional `CATALOG_SOURCE_REF` to choose which source ref supplies the live target list.
- For the upstream fallback, use `UPSTREAM_BUILD_API` and `CATALOG_PROBE_TARGET` instead.
- In the builder repository, set the Actions variable `FIRMWARE_REPOSITORY` to the same approved firmware source.

When R2 is not configured, the Worker proxies the GitHub Actions artifact ZIP through `/api/builds/{id}/download`, so the first end-to-end test does not expose a GitHub token to the browser. For a direct `.hex` download, create the R2 bucket and bindings described below; the Worker then serves the verified firmware file itself.

The Worker never accepts arbitrary shell arguments. The live source catalog is generated from classic `src/platform/*/target/*` targets plus `src/config/configs/*/config.h` targets from the checked-out config submodule or the release-specific pinned config ref. Releases are mapped to allow-listed refs, and flags are normalized and restricted to uppercase `USE_*` defines. The workflow validates them again before calling `make`. This keeps the community-facing label `KAACK 4.5.3 / V19` separate from the technical source ref `KAACK-4.5.0`.

For the first live test, the artifact download is the GitHub Actions artifact ZIP. For the direct firmware path, create an R2 bucket, add the `FIRMWARE_BUCKET` binding in `worker/wrangler.toml`, set the `R2_BUCKET_NAME` Actions variable plus the R2/Cloudflare secrets, and let the workflow publish the verified `.hex`/`.uf2`, `manifest.json` and checksum. The Worker then serves `/api/builds/{id}/download`. GitHub artifacts remain short-lived build outputs, not the permanent firmware cache.

## Reference-build verification

The official Betaflight Build API is used as a reference, not as the production builder. For a comparison, use the same source commit, target, effective `USE_*` options, `BUILD_KEY` and `RELEASE_NAME`; the workflow exposes optional `build_key` and `release_name` inputs for this purpose. Compare the downloaded HEX SHA-256 and the official build JSON/log. A successful compiler run by itself is not evidence of byte-for-byte equivalence.

## Safety boundary

Compilation success does not prove hardware compatibility. Verify the selected target, source commit, manifest and checksum, then do a props-off bench test before flight use. This service is not affiliated with or supported by Betaflight.

## AI assistance disclosure

This project was created and maintained with substantial assistance from OpenAI Codex. The repository maintainer directed the work, made the project decisions, and is responsible for reviewing and using the result.
