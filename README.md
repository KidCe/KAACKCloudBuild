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

Deploy `worker/` to Cloudflare Workers (locally with `cd worker; npx wrangler deploy`, or through `.github/workflows/deploy-worker.yml`) and set:

- `GITHUB_TOKEN` as a Worker secret with the minimum `Actions: write` and `Actions: read` access on the builder repository.
- `GITHUB_REPOSITORY` as a Worker variable naming the builder repository, such as `OWNER/REPOSITORY`.
- `GITHUB_REF` as the workflow-dispatch branch, normally `main`.
- `FIRMWARE_REPOSITORY` as the approved KAACK firmware source.
- `FIRMWARE_SOURCE_REFS` as a JSON array mapping the UI release id to a real Git tag or branch. The exact KAACK source is intentionally not guessed by this project and must be configured explicitly.
- Optional `CATALOG_SOURCE_REF` to choose which source ref supplies the live target list.
- For the upstream fallback, use `UPSTREAM_BUILD_API` and `CATALOG_PROBE_TARGET` instead.
- In the builder repository, set the Actions variable `FIRMWARE_REPOSITORY` to the same approved firmware source.

When Pages and the Worker use different hostnames, set `window.KAACK_CONFIG.apiBase` in `index.html` to the Worker URL. With a same-origin Worker route, the empty value already uses `/api/*`.

The Worker never accepts arbitrary shell arguments. The live source catalog is generated from the configured repository's `src/main/target` tree, releases are mapped to allow-listed refs, and flags are normalized and restricted to uppercase `USE_*` defines. The workflow validates them again before calling `make`. This prevents a visible label such as `4.5.3` from being treated as a Git ref when the selected KAACK source does not actually contain that ref.

For the first live test, the artifact download is the GitHub Actions artifact ZIP. For the direct firmware path, create an R2 bucket, add the `FIRMWARE_BUCKET` binding in `worker/wrangler.toml`, set the `R2_BUCKET_NAME` Actions variable plus the R2/Cloudflare secrets, and let the workflow publish the verified `.hex`/`.uf2`, `manifest.json` and checksum. The Worker then serves `/api/builds/{id}/download`. GitHub artifacts remain short-lived build outputs, not the permanent firmware cache.

## Safety boundary

Compilation success does not prove hardware compatibility. Verify the selected target, source commit, manifest and checksum, then do a props-off bench test before flight use. This service is not affiliated with or supported by Betaflight.

## AI assistance disclosure

This project was created and maintained with substantial assistance from OpenAI Codex. The repository maintainer directed the work, made the project decisions, and is responsible for reviewing and using the result.
