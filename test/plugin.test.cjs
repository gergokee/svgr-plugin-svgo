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
  assert.match(result, /id="svg_[a-f0-9]{12}__paint"/);
});

test('custom plugin lists retain file-specific prefixes unless explicitly disabled or supplied', () => {
  const options = { svgoConfig: { plugins: ['preset-default'] }, prefixIds: 'auto' };
  const first = plugin(svg, options, { filePath: 'a/icon.svg' });
  const second = plugin(svg, options, { filePath: 'b/icon.svg' });
  const id = (output) => output.match(/id="([^"]+)"/)?.[1];
  assert.match(id(first), /^svg_[a-f0-9]{12}__/);
  assert.notEqual(id(first), id(second));
  assert.ok(first.includes(`url(#${id(first)})`));
  const unprefixed = plugin(svg, { ...options, prefixIds: false });
  assert.doesNotMatch(unprefixed, /svg_[a-f0-9]{12}__/);
  const custom = { svgoConfig: { plugins: [{ name: 'prefixIds', params: { prefix: 'chosen' } }] } };
  assert.match(plugin(svg, custom), /id="chosen__paint"/);
  assert.match(plugin(svg, { ...custom, prefixIds: false }), /id="chosen__paint"/);
  assert.throws(() => plugin(svg, { prefixIds: true }), /prefixIds must be auto or false/);
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

test('rejects unsupported discovered SVGO config formats instead of ignoring them', (t) => {
  for (const name of ['svgo.config.mjs', 'svgo.config.ts', '.svgorc.mjs', '.svgorc.ts', '.svgo.mts']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svgo-unsupported-config-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, name), 'export default { multipass: true };');
    const state = { filePath: path.join(root, 'icon.svg') };
    assert.throws(() => plugin(svg, {}, state), (error) => error.message.includes('unsupported SVGO config') && error.message.includes(name));
    assert.match(plugin(svg, { runtimeConfig: false }, state), /viewBox/);
    assert.match(plugin(svg, { svgoConfig: {} }, state), /viewBox/);
  }
});

test('rejects ESM .js, promises, functions, arrays and non-plain SVGO configurations', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svgo-invalid-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'icon.svg');
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  const configFile = path.join(root, 'svgo.config.js');
  fs.writeFileSync(configFile, 'export default { multipass: true };');
  assert.throws(() => plugin(svg, {}, { filePath: file }), /unsupported SVGO config.*svgo\.config\.js/);
  assert.match(plugin(svg, { svgoConfig: {} }, { filePath: file }), /viewBox/);
  fs.rmSync(configFile);
  const cjsFile = path.join(root, 'svgo.config.cjs');
  for (const body of [
    'module.exports = Promise.resolve({ multipass: true });',
    'module.exports = () => ({ multipass: true });',
    'module.exports = [];',
    'module.exports = new Date();',
  ]) {
    fs.writeFileSync(cjsFile, body);
    assert.throws(() => plugin(svg, {}, { filePath: file }), /SVGO config.*must export a synchronous object/);
  }
  for (const bad of [Promise.resolve({}), [], () => ({}), new Date(), { then() {} }]) {
    assert.throws(() => plugin(svg, { svgoConfig: bad }), /SVGO configuration must export a synchronous object/);
  }
  const nullPrototype = Object.create(null);
  assert.match(plugin(svg, { svgoConfig: nullPrototype }), /viewBox/);
});

test('rejects ESM syntax in an untyped .js SVGO config consistently', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svgo-untyped-esm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'svgo.config.js'), 'export default { multipass: true };');
  assert.throws(() => plugin(svg, {}, { filePath: path.join(root, 'icon.svg') }), /unsupported SVGO config.*svgo\.config\.js/);
});

test('rejects an asynchronous CommonJS .js SVGO config', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svgo-async-js-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'svgo.config.js'), 'module.exports = Promise.resolve({ multipass: true });');
  assert.throws(() => plugin(svg, {}, { filePath: path.join(root, 'icon.svg') }), /SVGO config.*must export a synchronous object/);
});

test('preserves ordinary CommonJS SVGO config syntax errors', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svgo-syntax-error-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'svgo.config.js');
  fs.writeFileSync(config, 'module.exports = { multipass: ; };');
  assert.throws(() => plugin(svg, {}, { filePath: path.join(root, 'icon.svg') }),
    (error) => error instanceof SyntaxError && !error.message.includes('unsupported SVGO config'));
  fs.writeFileSync(config, '// export default is just a comment\nmodule.exports = { plugins: [] };');
  assert.match(plugin(svg, {}, { filePath: path.join(root, 'icon.svg') }), /viewBox/);
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
  const input = '<svg xmlns="http://www.w3.org/2000/svg"><style>.used{fill:red}</style><path class="used" d="M0 0h1v1z"/></svg>';
  assert.doesNotMatch(plugin(input, { native: true, runtimeConfig: false }), /<style/);
  const custom = plugin(input, { native: true, svgoConfig: { plugins: [] } });
  assert.doesNotMatch(custom, /<style/);
  assert.match(custom, /fill="red"/);
});

test('native CSS safeguards run with custom SVGO plugin lists', () => {
  const input = '<svg><style>.a{fill:red}</style><rect class="a" width="5" height="5"/><rect class="a" x="6" width="5" height="5"/></svg>';
  for (const plugins of [[], ['removeStyleElement']]) {
    const config = { native: true, svgoConfig: { plugins } };
    const output = plugin(input, config);
    assert.doesNotMatch(output, /<style/);
    assert.equal((output.match(/fill="red"/g) || []).length, 2);
    const dynamic = input.replace('.a{fill:red}', '.a{fill:red}.a:hover{fill:blue}');
    assert.throws(() => plugin(dynamic, config), /could not be inlined safely/);
    const warnings = [];
    const warned = plugin(dynamic, { ...config, nativeCss: 'warn' }, { caller: { onNativeCssWarning: (warning) => warnings.push(warning) } });
    assert.equal(warnings.length, 1);
    assert.equal((warned.match(/fill="red"/g) || []).length, 2);
  }
  const addStyle = { name: 'addStyle', fn: () => ({ element: { enter(node) {
    if (node.name === 'rect') node.attributes.style = 'isolation:isolate';
  } } }) };
  assert.throws(() => plugin('<svg><rect width="5" height="5"/></svg>',
    { native: true, svgoConfig: { plugins: [addStyle] } }), /could not be converted/);
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

test('native CSS policy detects dynamic rules before static optimization removes them', () => {
  const input = '<svg><style>.a{fill:red}.a:hover{fill:blue}</style><rect class="a" width="5" height="5"/></svg>';
  assert.throws(() => plugin(input, { native: true, runtimeConfig: false }), /could not be inlined safely/);
  const warnings = [];
  const state = { caller: { onNativeCssWarning: (warning) => warnings.push(warning) } };
  const result = plugin(input, { native: true, nativeCss: 'warn', runtimeConfig: false }, state);
  assert.equal(warnings.length, 1);
  assert.match(result, /fill="red"/);
  assert.doesNotMatch(result, /hover|blue|<style/);
  const dropped = plugin(input, { native: true, nativeCss: 'drop', runtimeConfig: false });
  assert.equal(dropped, result);
  const commented = input.replace('.a:hover{fill:blue}', '/* .a:hover{fill:blue} */');
  assert.match(plugin(commented, { native: true, runtimeConfig: false }), /fill="red"/);
  const cdata = input.replace('<style>', '<style><![CDATA[').replace('</style>', ']]></style>');
  assert.throws(() => plugin(cdata, { native: true, runtimeConfig: false }), /could not be inlined safely/);
});

test('native mode inlines structural selectors with a leading style element', () => {
  const input = (css) => `<svg><style>${css}</style><path d="M0 0h1v1z"/><path class="b" d="M2 0h1v1z"/></svg>`;
  for (const css of [
    'path:not(.b){fill:red}', 'path:nth-child(2){fill:red}', '@charset "UTF-8";path:nth-child(2){fill:red}',
    'path:first-child,path:nth-child(2){fill:red}',
  ]) {
    for (const svgoConfig of [undefined, { plugins: [] }]) {
      const warnings = [];
      const result = plugin(input(css), { native: true, nativeCss: 'warn', runtimeConfig: false, svgoConfig },
        { caller: { onNativeCssWarning: (warning) => warnings.push(warning) } });
      const paths = result.match(/<path\b[^>]*\/>/g);
      assert.equal(paths.length, 2, css);
      assert.match(paths[0], /fill="red"/, css);
      assert.doesNotMatch(paths[1], /fill="red"/, css);
      assert.equal(warnings.length, 0, css);
      assert.doesNotMatch(result, /<style/, css);
    }
  }
  const firstChild = plugin(input('path:first-child{fill:red}'), { native: true, runtimeConfig: false });
  assert.doesNotMatch(firstChild, /fill="red"|<style/);
  const warnings = [];
  assert.doesNotThrow(() => plugin(input('@charset "UTF-8";'), { native: true, nativeCss: 'warn', runtimeConfig: false },
    { caller: { onNativeCssWarning: (warning) => warnings.push(warning) } }));
  assert.equal(warnings.length, 0);
});

test('native CSS warn mode removes dynamic selector branches without dropping static branches', () => {
  const input = '<svg><style>.a,.a:hover{fill:red}.a:not(:hover){fill:blue}</style><path class="a" d="M0 0h1v1z"/></svg>';
  const warnings = [];
  const output = plugin(input, { native: true, nativeCss: 'warn', runtimeConfig: false },
    { caller: { onNativeCssWarning: (warning) => warnings.push(warning) } });
  assert.equal(warnings.length, 1);
  assert.match(output, /fill="red"/);
  assert.doesNotMatch(output, /blue|#00f|hover/);
});

test('native CSS rejects dynamic pseudo-classes, pseudo-elements and unsupported at-rules', () => {
  const cases = [
    '.a:hover{fill:blue}', '.a:focus{fill:blue}', '.a:active{fill:blue}', '.a:visited{fill:blue}',
    '.a:focus-visible{fill:blue}', '.a:not(:hover){fill:blue}', '.a::before{fill:blue}', '.a:before{fill:blue}',
    '@media (min-width:1px){.a{fill:blue}}', '@supports (display:grid){.a{fill:blue}}',
    '@font-face{font-family:Example;src:url(example.woff)}', '@keyframes spin{from{opacity:0}to{opacity:1}}',
    '@import url(example.css);',
  ];
  for (const css of cases) {
    const input = `<svg><style>.a{fill:red}${css}</style><path class="a" d="M0 0h1v1z"/></svg>`;
    assert.throws(() => plugin(input, { native: true, runtimeConfig: false }), /could not be inlined safely/, css);
    const warnings = [];
    const output = plugin(input, { native: true, nativeCss: 'warn', runtimeConfig: false },
      { caller: { onNativeCssWarning: (warning) => warnings.push(warning) } });
    assert.equal(warnings.length, 1, css);
    assert.match(output, /fill="red"/, css);
  }
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
