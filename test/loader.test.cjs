'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loader = require('../loader.cjs');

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#paint)"/></svg>';

function run(source, options = {}, resourcePath = '/project/icon.svg') {
  let cacheable;
  return new Promise((resolve, reject) => {
    const context = {
      resourcePath,
      getOptions: () => options,
      cacheable: (value) => { cacheable = value; },
      async: () => (error, code) => error ? reject(error) : resolve({ code, cacheable }),
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
