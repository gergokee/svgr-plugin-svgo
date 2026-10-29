'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { transform } = require('@svgr/core');
const plugin = require('../index.cjs');

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!--hello--><defs><linearGradient id="gradient"><stop stop-color="red"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#gradient)"/></svg>';
const options = { plugins: [plugin, '@svgr/plugin-jsx'], runtimeConfig: false };

test('SVGR async and sync pipelines produce React components', async () => {
  const state = { filePath: 'icon.svg', componentName: 'Icon' };
  const result = await transform(svg, options, state);
  assert.match(result, /viewBox="0 0 10 10"/);
  assert.match(result, /svg_[a-f0-9]{12}__/);
  assert.doesNotMatch(result, /hello/);
  assert.equal(transform.sync(svg, options, state), result);
});

test('SVGR native mode emits react-native-svg components', async () => {
  const result = await transform(svg, { ...options, native: true }, { componentName: 'Icon' });
  assert.match(result, /react-native-svg/);
  assert.match(result, /<Svg/);
  assert.match(result, /svg_[a-f0-9]{12}__/);
});

test('SVGR native CSS warning policy preserves convertible presentation attributes', async () => {
  const input = '<svg style="isolation:isolate"><rect width="5" height="5" fill="red"/></svg>';
  const warnings = [];
  const state = { componentName: 'Icon', caller: { onNativeCssWarning: (warning) => warnings.push(warning) } };
  const result = await transform(input, { ...options, native: true, nativeCss: 'warn' }, state);
  assert.equal(warnings.length, 1);
  assert.match(result, /fill="red"/);
  assert.doesNotMatch(result, /isolation/);
});

test('SVGR svgo: false leaves original IDs intact', async () => {
  const result = await transform(svg, { ...options, svgo: false }, { componentName: 'Icon' });
  assert.match(result, /id="gradient"/);
  assert.doesNotMatch(result, /svg_[a-f0-9]{12}__/);
});
