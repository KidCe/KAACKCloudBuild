import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('demo catalog contains the builder surface', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /version-disclaimer/);
  assert.match(index, /official Betaflight/);
  const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url)));
  assert.equal(catalog.mode, 'demo');
  assert.ok(catalog.targets.some((target) => target.target === 'KAKUTEH7'));
  assert.ok(catalog.targets.some((target) => target.target === 'HDZERO_HALO'));
  assert.ok(catalog.targets.some((target) => target.target === 'MAMBAF722_2022A'));
  assert.ok(catalog.targets.some((target) => target.target === 'HGLRCF722MINI'));
  const kaackLine = catalog.firmwareLines.find((line) => line.id === 'kaack');
  const betaflightLine = catalog.firmwareLines.find((line) => line.id === 'betaflight');
  assert.ok(kaackLine.releases.some((release) => release.label === 'KAACK 4.5.3 / V19' && release.ref === 'KAACK-4.5.0'));
  assert.ok(betaflightLine.releases.some((release) => release.label === 'Betaflight 4.5.3' && release.ref === '4.5.3'));
  assert.ok(betaflightLine.targets.length < 10);
  assert.ok(catalog.options.osdProtocols.some((option) => option.value.includes('USE_OSD_HD')));
});

test('workflow validates user-controlled flags before make', async () => {
  const workflow = await readFile(new URL('../.github/workflows/build-firmware.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Invalid build flag/);
  assert.match(workflow, /make configs/);
  assert.match(workflow, /make arm_sdk_install/);
  assert.match(workflow, /submodules: recursive/);
  assert.match(workflow, /picotool_install/);
  assert.match(workflow, /build_command=\(make -j7 "\$\{target\}"/);
  assert.match(workflow, /make uf2 TARGET/);
  assert.match(workflow, /src\/platform src\/main/);
  assert.match(workflow, /src\/config\/configs -type f -path/);
  assert.match(workflow, /CONFIG="\$\{target\}"/);
  assert.match(workflow, /config_ref/);
  assert.match(workflow, /compatible pinned config ref/);
  assert.match(workflow, /No non-empty HEX firmware artifact found/);
  assert.match(workflow, /-size \+0c/);
  assert.match(workflow, /limonspb\/betaflight/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.match(workflow, /FIRMWARE_REPOSITORY/);
  assert.match(workflow, /approved KAACK fork/);
  assert.match(workflow, /firmware_stem=/);
  assert.match(workflow, /firmware_stem="\$\(slug "\$\{REQUEST_TARGET\}"\)_\$\(slug "\$\{FIRMWARE_LINE\}"\)_/);
  assert.match(workflow, /firmware_line/);
  assert.match(workflow, /betaflight\/betaflight/);
  assert.match(workflow, /limonspb\/betaflight/);
  assert.match(workflow, /DIGIOSD/);
  assert.match(workflow, /content-disposition/);
  assert.match(workflow, /firmwareFileName/);
});

test('worker keeps GitHub credentials server-side', async () => {
  const worker = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /GITHUB_TOKEN/);
  assert.match(worker, /headers\.authorization = `Bearer \$\{env\.GITHUB_TOKEN\}`/);
  assert.match(worker, /validateAgainstCatalog/);
  assert.match(worker, /downloadFirmware/);
  assert.match(worker, /object\.httpMetadata\?\.contentDisposition/);
  assert.match(worker, /source_ref/);
  assert.match(worker, /src.*platform/);
  assert.match(worker, /src.*main/);
  assert.match(worker, /src.*config/);
  assert.match(worker, /configs.*\[\^\/\].*config/);
  assert.match(worker, /gitTree/);
  assert.match(worker, /configRef/);
  assert.match(worker, /officialConfigRefFor/);
  assert.match(worker, /\^\[A-Z0-9_-\]\+\$/);
  assert.doesNotMatch(await readFile(new URL('../app.js', import.meta.url), 'utf8'), /GITHUB_TOKEN/);
});

test('builder remembers general options and applies racing defaults', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /kaack-cloud-builder\.general-options/);
  assert.match(app, /USE_SERIALRX_CRSF/);
  assert.match(app, /USE_TELEMETRY_CRSF/);
  assert.match(app, /USE_DSHOT/);
  assert.match(app, /USE_OSD_HD/);
  assert.match(app, /firmwareLines/);
  assert.match(app, /firmware=\$\{encodeURIComponent\(state\.firmwareLine\)\}/);
  assert.match(app, /not the same as Betaflight 4\.5\.3/);
  assert.match(app, /older Betaflight 4\.5 line/);
  assert.match(app, /all fixes from official Betaflight 4\.5\.3/);
});
