'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loader = require('../loader.cjs');

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#paint)"/></svg>';

function run(source, options = {}, resourcePath = '/project/icon.svg', sourceMap = false) {
  let cacheable;
  const dependencies = [];
  const missing = [];
  return new Promise((resolve, reject) => {
    const context = {
      resourcePath,
      rootContext: path.dirname(resourcePath),
      sourceMap,
      getOptions: () => options,
      cacheable: (value) => { cacheable = value; },
      addDependency: (file) => dependencies.push(file),
      addMissingDependency: (file) => missing.push(file),
      async: () => (error, code, map) => error ? reject(error) : resolve({ code, map, cacheable, dependencies, missing }),
    };
    loader.call(context, source);
  });
}

test('emits JavaScript with requested named export and default optimizer', async () => {
  const { code, cacheable } = await run(svg, { exportType: 'named', namedExport: 'ReactComponent', svgoConfig: {} });
  assert.match(code, /export \{ .* as ReactComponent \}/);
  assert.match(code, /svg_[a-f0-9]{12}__/);
  assert.match(code, /viewBox/);
  assert.doesNotMatch(code, /<svg/);
  assert.equal(cacheable, false);
});

test('supports default export, svgo: false and dimensions: false', async () => {
  const { code, cacheable } = await run(svg, { svgo: false, dimensions: false, runtimeConfig: false });
  assert.match(code, /export default/);
  assert.match(code, /id: "paint"/);
  assert.doesNotMatch(code, /svg_[a-f0-9]{12}__/);
  assert.doesNotMatch(code, /width: "10"/);
  assert.equal(cacheable, undefined);
});

test('supports automatic JSX runtime', async () => {
  const { code } = await run(svg, { jsxRuntime: 'automatic', runtimeConfig: false });
  assert.match(code, /react\/jsx-runtime/);
});

test('uses the JSX runtime from discovered SVGR config', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-svgr-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.svgrrc'), JSON.stringify({ jsxRuntime: 'automatic' }));
  const { code } = await run(svg, {}, path.join(directory, 'icon.svg'));
  assert.match(code, /react\/jsx-runtime/);
});

test('rejects a discovered SVGR plugin pipeline with a clear error', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-svgr-plugins-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.svgrrc'), JSON.stringify({ plugins: ['@svgr/plugin-jsx'] }));
  await assert.rejects(run(svg, {}, path.join(directory, 'icon.svg')), /unsupported option plugins in SVGR configuration/);
});

test('native mode emits react-native-svg imports', async () => {
  const { code } = await run(svg, { native: true, runtimeConfig: false });
  assert.match(code, /react-native-svg/);
});

test('babel: false leaves JSX and allows a custom JSX runtime import', async () => {
  const { code } = await run(svg, { babel: false, runtimeConfig: false, jsxRuntimeImport: { source: 'preact', specifiers: ['h'] } });
  assert.match(code, /<svg/);
  assert.match(code, /from "preact"/);
});

test('prettier options affect JSX emitted with babel: false', async () => {
  const { code } = await run(svg, { babel: false, runtimeConfig: false, prettierConfig: { singleQuote: true, semi: false } });
  assert.match(code, /from 'react'/);
  assert.doesNotMatch(code, /;\n/);
});

test('explicit Prettier options take precedence over a malformed discovered config', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-prettier-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.prettierrc'), '{ invalid');
  const { code } = await run(svg, { babel: false, prettierConfig: { singleQuote: true } }, path.join(directory, 'icon.svg'));
  assert.match(code, /from 'react'/);
});

test('configFile applies SVGR component options', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-config-file-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configFile = path.join(directory, '.svgrrc');
  fs.writeFileSync(configFile, JSON.stringify({ icon: true, jsxRuntime: 'automatic' }));
  const { code } = await run(svg, { configFile }, path.join(directory, 'icon.svg'));
  assert.match(code, /react\/jsx-runtime/);
  assert.match(code, /"1em"/);
});

test('explicit loader options override discovered SVGR config', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-svgr-priority-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.svgrrc'), JSON.stringify({ icon: true, svgoConfig: { plugins: ['removeViewBox'] } }));
  const { code } = await run(svg, { icon: false, svgoConfig: {} }, path.join(directory, 'icon.svg'));
  assert.doesNotMatch(code, /"1em"/);
  assert.match(code, /viewBox/);
  assert.match(code, /svg_[a-f0-9]{12}__/);
});

test('reloads a changed SVGR configuration between transforms', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-svgr-update-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configFile = path.join(directory, '.svgrrc');
  const file = path.join(directory, 'icon.svg');
  fs.writeFileSync(configFile, JSON.stringify({ icon: true }));
  const initial = await run(svg, {}, file);
  assert.match(initial.code, /"1em"/);
  assert.ok(initial.dependencies.includes(fs.realpathSync(configFile)));
  assert.ok(initial.missing.includes(path.join(fs.realpathSync(directory), 'svgo.config.js')));
  fs.writeFileSync(configFile, JSON.stringify({ icon: false }));
  assert.doesNotMatch((await run(svg, {}, file)).code, /"1em"/);
});

test('reloads a changed CommonJS SVGR configuration', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-svgr-js-update-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'icon.svg');
  const configFile = path.join(directory, 'svgr.config.cjs');
  fs.writeFileSync(configFile, 'module.exports = { icon: true };');
  assert.match((await run(svg, {}, file)).code, /"1em"/);
  fs.writeFileSync(configFile, 'module.exports = { icon: false };');
  assert.doesNotMatch((await run(svg, {}, file)).code, /"1em"/);
});

test('reloads changed SVGO and Prettier configurations between transforms', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-other-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'icon.svg');
  const svgoFile = path.join(directory, 'svgo.config.cjs');
  const prettierFile = path.join(directory, '.prettierrc');
  fs.writeFileSync(svgoFile, 'module.exports = { plugins: ["removeViewBox"] };');
  fs.writeFileSync(prettierFile, JSON.stringify({ singleQuote: true }));
  const first = await run(svg, { babel: false }, file);
  assert.doesNotMatch(first.code, /viewBox/);
  assert.match(first.code, /from 'react'/);
  assert.ok(first.dependencies.includes(fs.realpathSync(svgoFile)));
  assert.ok(first.dependencies.includes(fs.realpathSync(prettierFile)));
  fs.writeFileSync(svgoFile, 'module.exports = { plugins: [] };');
  fs.writeFileSync(prettierFile, JSON.stringify({ singleQuote: false }));
  const second = await run(svg, { babel: false }, file);
  assert.match(second.code, /viewBox/);
  assert.match(second.code, /from "react"/);
});

test('emits source maps for generated JSX with and without built-in Babel', async () => {
  for (const babel of [true, false]) {
    const { code, map } = await run(svg, { babel, runtimeConfig: false }, '/project/icon.svg', true);
    assert.equal(map.version, 3);
    assert.match(map.sources[0], /icon\.svg\.svgr-generated\.jsx$/);
    assert.match(map.sourcesContent[0], /<svg/);
    assert.ok(map.mappings.length > 0);
    if (!babel) assert.match(code, /<svg/);
  }
});

test('can transpile generated JavaScript for specified older targets', async () => {
  const { code } = await run(svg, { runtimeConfig: false, babelTargets: { ie: '11' } });
  assert.doesNotMatch(code, /=>|\bconst\b/);
  assert.match(code, /React\.createElement/);
  await assert.rejects(run(svg, { babel: false, babelTargets: { ie: '11' } }), /requires the built-in Babel step/);
});

test('supports classic-preact and TypeScript output compiled to JavaScript', async () => {
  const preact = await run(svg, { jsxRuntime: 'classic-preact', runtimeConfig: false });
  assert.match(preact.code, /from "preact"/);
  assert.match(preact.code, /\bh\("svg"/);
  const typescript = await run(svg, { typescript: true, runtimeConfig: false });
  assert.match(typescript.code, /createElement\("svg"/);
  assert.doesNotMatch(typescript.code, /SVGProps|: SVG/);
});

test('forwards documented SVGR component options', async () => {
  const input = '<svg width="10" height="10" viewBox="0 0 10 10"><title>Old title</title><desc>Old description</desc><path fill="#000" d="M0 0h1v1z"/></svg>';
  const { code } = await run(input, {
    runtimeConfig: false, svgo: false, icon: true, ref: true, memo: true,
    titleProp: true, descProp: true, svgProps: { role: 'img' }, replaceAttrValues: { '#000': 'currentColor' },
  });
  for (const expected of [/"1em"/, /forwardRef/, /memo/, /titleId/, /descId/, /"img"/, /currentColor/]) {
    assert.match(code, expected);
  }
});

test('rejects invalid SVG and explicitly unsupported options', async () => {
  await assert.rejects(run('<svg><path></svg>', { runtimeConfig: false }), /failed to optimize/);
  await assert.rejects(run(svg, { babel: 'false' }), /babel must be boolean/);
  await assert.rejects(run(svg, { jsxRuntime: 'unknown' }), /unsupported jsxRuntime/);
  await assert.rejects(run(svg, { jsxRuntimeImport: { source: 'custom' } }), /requires babel: false/);
  await assert.rejects(run(svg, { plugins: [] }), /unsupported option plugins/);
  await assert.rejects(run(svg, { outDir: './dist' }), /unsupported option outDir/);
});
