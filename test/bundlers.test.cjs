'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test('packed loader supports documented webpack patterns and Next.js Turbopack', { timeout: 240000 }, async (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-svg-loader-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  const run = (command, args, cwd = project) => execFileSync(command, args, {
    cwd, env, encoding: 'utf8', stdio: 'pipe', maxBuffer: 8 * 1024 * 1024,
  });
  const pack = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', project], repo))[0];
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
    name: 'independent-svg-loader-fixture',
    private: true,
    dependencies: {
      'svgr-plugin-svgo': `file:${path.join(project, pack.filename)}`,
      '@babel/core': '7.29.7', '@babel/plugin-transform-react-jsx': '7.29.7',
      'babel-loader': '9.2.1', 'file-loader': '6.2.0', 'url-loader': '4.1.1',
      next: '16.4.3', react: '19.2.0', 'react-dom': '19.2.0', webpack: '5.104.1',
    },
  }, null, 2));
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund']);

  fs.mkdirSync(path.join(project, 'app'));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#paint)"/></svg>';
  fs.writeFileSync(path.join(project, 'app', 'icon.svg'), svg);
  fs.writeFileSync(path.join(project, 'app', 'layout.js'), 'export default function Layout({children}) { return <html><body>{children}</body></html>; }');
  fs.writeFileSync(path.join(project, 'app', 'page.js'), 'import { ReactComponent } from "./icon.svg"; export default function Page() { return <ReactComponent />; }');
  fs.writeFileSync(path.join(project, 'entry.js'), 'export { ReactComponent } from "./app/icon.svg";');

  // The exact options requested, including the SVGO 3-era override.
  const options = {
    exportType: 'named', namedExport: 'ReactComponent',
    svgoConfig: { plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }, 'prefixIds'] },
  };
  fs.writeFileSync(path.join(project, 'webpack.config.cjs'), `
    const path = require('path');
    module.exports = {
      context: __dirname, mode: 'production', target: 'node', entry: './entry.js',
      output: { path: path.resolve(__dirname, 'dist'), filename: 'bundle.js', library: { type: 'commonjs2' } },
      module: { rules: [{ test: /\\.svg$/, use: [{ loader: 'svgr-plugin-svgo/loader', options: ${JSON.stringify(options)} }] }] }
    };
  `);
  const webpack = require(require.resolve('webpack', { paths: [project] }));
  const config = require(path.join(project, 'webpack.config.cjs'));
  const assertSvg = (markup) => {
    assert.match(markup, /viewBox="0 0 10 10"/);
    const id = markup.match(/id="([^"]+)"/)?.[1];
    assert.ok(id && id !== 'paint', markup);
    assert.ok(markup.includes(`url(#${id})`), markup);
  };
  const build = (cfg) => new Promise((resolve, reject) => webpack(cfg, (error, stats) => {
    if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ errors: true })));
    else resolve();
  }));
  const react = require(require.resolve('react', { paths: [project] }));
  const { renderToStaticMarkup } = require(require.resolve('react-dom/server', { paths: [project] }));
  const render = (component) => renderToStaticMarkup(react.createElement(component));
  await build(config);
  assertSvg(render(require(path.join(project, 'dist', 'bundle.js')).ReactComponent));

  // Webpack's resourceQuery and issuer rules can separate URL and component imports.
  fs.writeFileSync(path.join(project, 'query.js'), 'export { default as url } from "./app/icon.svg?url"; export { default as Icon } from "./app/icon.svg";');
  await build({ ...config, entry: './query.js', output: { ...config.output, filename: 'query.js' },
    module: { rules: [
      { test: /\.svg$/i, resourceQuery: /url/, type: 'asset/inline' },
      { test: /\.svg$/i, issuer: /\.[jt]sx?$/, resourceQuery: { not: [/url/] }, use: ['svgr-plugin-svgo/loader'] },
    ] },
  });
  const query = require(path.join(project, 'dist', 'query.js'));
  assert.match(query.url, /^data:image\/svg\+xml/);
  assertSvg(render(query.Icon));

  // Check both legacy asset-loader module formats, including a custom named export.
  fs.writeFileSync(path.join(project, 'chained.js'), 'export { default as url, Vector } from "./app/icon.svg";');
  for (const [assetLoader, assetOptions] of [
    ['url-loader', { esModule: true }],
    ['file-loader', { esModule: false }],
  ]) {
    const filename = `${assetLoader}.js`;
    await build({ ...config, entry: './chained.js', output: { ...config.output, filename },
      module: { rules: [{ test: /\.svg$/, use: [
        { loader: 'svgr-plugin-svgo/loader', options: { namedExport: 'Vector' } },
        { loader: assetLoader, options: assetOptions },
      ] }] },
    });
    const result = require(path.join(project, 'dist', filename));
    assert.equal(typeof result.url, 'string');
    assertSvg(render(result.Vector));
  }

  fs.writeFileSync(path.join(project, 'custom-babel.js'), 'export { default as Icon } from "./app/icon.svg";');
  await build({ ...config, entry: './custom-babel.js', output: { ...config.output, filename: 'custom-babel.js' },
    module: { rules: [{ test: /\.svg$/, use: [
      { loader: 'babel-loader', options: { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx'] } },
      { loader: 'svgr-plugin-svgo/loader', options: { babel: false } },
    ] }] },
  });
  assertSvg(render(require(path.join(project, 'dist', 'custom-babel.js')).Icon));

  fs.writeFileSync(path.join(project, 'next.config.js'), `module.exports = {
    turbopack: { rules: { '*.svg': { loaders: [{ loader: 'svgr-plugin-svgo/loader', options: ${JSON.stringify(options)} }], as: '*.js' } } }
  };`);
  run(process.execPath, [path.join(project, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build']);
  assertSvg(fs.readFileSync(path.join(project, '.next', 'server', 'app', 'index.html'), 'utf8'));
});
