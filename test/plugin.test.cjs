'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plugin = require('../index.cjs');

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><!--comment--><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><path fill="url(#paint)" d="M0 0h10v10H0z"/></svg>';

test('default optimization preserves viewBox and prefixes IDs and references reproducibly', () => {
  const result = plugin(svg, { runtimeConfig: false });
  assert.match(result, /viewBox="0 0 10 10"/);
  assert.doesNotMatch(result, /comment/);
  const id = result.match(/id="(svg_[a-f0-9]{12}__[^"]+)"/)?.[1];
  assert.ok(id, result);
  assert.ok(result.includes(`url(#${id})`), result);
  assert.equal(result, plugin(svg, { runtimeConfig: false }));
  assert.notEqual(result, plugin(svg.replace('red', 'blue'), { runtimeConfig: false }));
  const first = plugin(svg, { runtimeConfig: false }, { filePath: 'icons/a.svg' });
  assert.equal(first, plugin(svg, { runtimeConfig: false }, { filePath: 'icons/a.svg' }));
  assert.notEqual(first, plugin(svg, { runtimeConfig: false }, { filePath: 'icons/b.svg' }));
  const caller = (root) => ({ filePath: path.join(root, 'icons/a.svg'), caller: { projectRoot: root } });
  assert.equal(plugin(svg, { runtimeConfig: false }, caller('/build/a')), plugin(svg, { runtimeConfig: false }, caller('/build/b')));
});

test('svgo: false returns input unchanged before validating it or loading config', () => {
  assert.equal(plugin('not XML', { svgo: false }), 'not XML');
  const input = { arbitrary: true };
  assert.equal(plugin(input, { svgo: false }), input);
});

test('explicit plugin list is respected, including intentional viewBox removal', () => {
  const result = plugin(svg, { svgoConfig: { plugins: ['removeViewBox'] } });
  assert.doesNotMatch(result, /viewBox/);
  assert.match(result, /comment/);
  assert.match(result, /id="paint"/);
});

test('config without plugins retains defaults', () => {
  const result = plugin(svg, { svgoConfig: { multipass: true } });
  assert.match(result, /svg_[a-f0-9]{12}__/);
  assert.match(result, /viewBox/);
});

test('discovers nearest config, honors runtimeConfig and gives explicit config precedence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svgr-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'icons'));
  fs.writeFileSync(path.join(root, 'svgo.config.cjs'), 'module.exports = { plugins: ["removeViewBox"] };');
  const state = { filePath: path.join(root, 'icons', 'icon.svg') };
  assert.doesNotMatch(plugin(svg, {}, state), /viewBox/);
  assert.match(plugin(svg, { runtimeConfig: false }, state), /viewBox/);
  assert.match(plugin(svg, { svgoConfig: { plugins: [] } }, state), /viewBox/);
  fs.writeFileSync(path.join(root, 'icons', '.svgo.yml'), 'plugins: []\n');
  assert.match(plugin(svg, {}, state), /viewBox/);
});

test('passes filePath to custom SVGO plugins and overrides config.path when present', () => {
  let observed;
  const capture = { name: 'capturePath', fn: (_root, _params, info) => { observed = info.path; } };
  plugin(svg, { svgoConfig: { path: 'wrong.svg', plugins: [capture] } }, { filePath: 'icons/right.svg' });
  assert.equal(observed, 'icons/right.svg');
});

test('reports invalid input and malformed SVG clearly', () => {
  assert.throws(() => plugin(null), /input must be a string/);
  assert.throws(() => plugin('<div/>', { runtimeConfig: false }), /single SVG root/);
  assert.throws(() => plugin('<svg><path></svg>', { runtimeConfig: false }, { filePath: 'bad.svg' }), /bad\.svg/);
  assert.throws(() => plugin(svg, { svgoConfig: { plugins: 'bad' } }), /plugins must be an array/);
});

test('native mode removes style elements when using defaults', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg"><style>.unused{fill:red}</style><path d="M0 0h1v1z"/></svg>';
  assert.doesNotMatch(plugin(input, { native: true, runtimeConfig: false }), /<style/);
  assert.match(plugin(input, { native: true, svgoConfig: { plugins: [] } }), /<style/);
});

test('native mode applies shared CSS and rejects rules that cannot be inlined', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg"><style>.shape{fill:red}</style><rect class="shape" width="5" height="5"/><rect class="shape" x="6" width="5" height="5"/></svg>';
  const result = plugin(input, { native: true, runtimeConfig: false });
  assert.match(result, /fill="red"/);
  assert.doesNotMatch(result, /<style/);
  assert.throws(() => plugin(input.replace('.shape{', '.shape:hover{'), { native: true, runtimeConfig: false }), /could not be inlined safely/);
  assert.throws(() => plugin(input.replace('.shape{fill:red}', '@media (min-width:500px){.shape{fill:red}}'),
    { native: true, runtimeConfig: false }), /could not be inlined safely/);
  assert.throws(() => plugin('<svg><path d="M0 0h1v1z" style="--custom:red"/></svg>',
    { native: true, runtimeConfig: false }), /could not be converted/);
});

test('native CSS policy handles exporter styles with explicit warnings or dropping', () => {
  const examples = [
    '<svg style="isolation:isolate"><rect width="5" height="5" fill="blue"/></svg>',
    '<svg><rect width="5" height="5" style="mix-blend-mode:multiply;fill:blue"/></svg>',
    '<svg><style>@font-face{font-family:Example;src:url(example.woff)}</style><text font-family="Example">Hi</text></svg>',
  ];
  for (const input of examples) {
    assert.throws(() => plugin(input, { native: true, runtimeConfig: false }), /could not be/);
    const warnings = [];
    const state = { caller: { onNativeCssWarning: (warning) => warnings.push(warning) } };
    const warned = plugin(input, { native: true, nativeCss: 'warn', runtimeConfig: false }, state);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /unsupported CSS will be dropped/);
    assert.doesNotMatch(warned, /<style|style="|mix-blend-mode|isolation|@font-face/);
    warnings.length = 0;
    const dropped = plugin(input, { native: true, nativeCss: 'drop', runtimeConfig: false }, state);
    assert.equal(warnings.length, 0);
    assert.equal(dropped, warned);
  }
  const mixed = plugin(examples[1], { native: true, nativeCss: 'drop', runtimeConfig: false });
  assert.match(mixed, /fill="(?:blue|#00f)"/);
  assert.throws(() => plugin(examples[0], { native: true, nativeCss: 'ignore' }), /nativeCss must be/);
});

test('native CSS warn mode emits a Node warning without a caller callback', () => {
  const original = process.emitWarning;
  const warnings = [];
  try {
    process.emitWarning = (warning) => warnings.push(warning);
    plugin('<svg style="isolation:isolate"><path d="M0 0h1v1z"/></svg>',
      { native: true, nativeCss: 'warn', runtimeConfig: false });
  } finally {
    process.emitWarning = original;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /unsupported CSS will be dropped/);
});
