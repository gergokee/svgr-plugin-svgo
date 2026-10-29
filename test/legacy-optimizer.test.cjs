'use strict';

// Optional behavioral comparison only. It does not inspect implementation files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('legacy and independent optimizers have comparable observable SVG behavior', { timeout: 120000 }, (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'svgr-optimizer-comparison-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
    name: 'svgr-optimizer-comparison', private: true,
    dependencies: { '@svgr/plugin-svgo': '8.1.0' },
  }));
  execFileSync(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: project, stdio: 'pipe' });
  const legacyModule = require(require.resolve('@svgr/plugin-svgo', { paths: [project] }));
  const legacy = legacyModule.default || legacyModule;
  const replacement = require('../index.cjs');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!--comment--><defs><linearGradient id="paint"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#paint)"/></svg>';
  const opts = { svgo: true, runtimeConfig: false };
  const state = { filePath: 'icon.svg' };
  const outputs = [];

  for (const [name, plugin] of [['legacy', legacy], ['replacement', replacement]]) {
    const output = plugin(svg, opts, state);
    outputs.push(output);
    assert.match(output, /viewBox="0 0 10 10"/, name);
    assert.doesNotMatch(output, /<!--comment-->/, name);
    const id = output.match(/id="([^"]+)"/)?.[1];
    assert.ok(id && id !== 'paint', `${name}: expected prefixed ID`);
    assert.ok(output.includes(`url(#${id})`), `${name}: reference must match ID`);
    assert.equal(plugin(svg, { ...opts, svgo: false }, state), svg, name);
    const custom = plugin(svg, { ...opts, svgoConfig: { plugins: ['removeComments'] } }, state);
    assert.doesNotMatch(custom, /<!--comment-->/, name);
    assert.match(custom, /id="paint"/, name);
    assert.throws(() => plugin('<svg><path></svg>', opts, state), undefined, name);
  }
  const normalizeIds = (output) => {
    const id = output.match(/id="([^"]+)"/)[1];
    return output.replaceAll(id, 'normalized-id');
  };
  assert.equal(normalizeIds(outputs[0]), normalizeIds(outputs[1]), 'the representative SVG differs only in its prefix');
  const titled = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>Accessible title</title><path d="M0 0h1v1z"/></svg>';
  assert.doesNotMatch(legacy(titled, opts, state), /<title>/);
  assert.match(replacement(titled, opts, state), /<title>/);
  for (const [index, output] of outputs.entries()) t.diagnostic(`${index ? 'replacement' : 'legacy'}: ${output}`);
});
