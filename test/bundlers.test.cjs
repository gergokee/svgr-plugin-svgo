'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test('packed replacement works through an npm override with webpack and Next.js Turbopack', { timeout: 240000 }, (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'svgr-bundlers-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  const run = (command, args, cwd = project) => execFileSync(command, args, {
    cwd, env, encoding: 'utf8', stdio: 'pipe', maxBuffer: 8 * 1024 * 1024,
  });
  const pack = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', project], repo))[0];
  const tarball = path.join(project, pack.filename);

  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
    name: 'svgr-bundlers-fixture',
    private: true,
    dependencies: {
      '@svgr/webpack': '8.1.0',
      next: '16.4.3',
      react: '19.2.0',
      'react-dom': '19.2.0',
      webpack: '5.104.1',
    },
    overrides: { '@svgr/plugin-svgo': `file:${tarball}` },
  }, null, 2));
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const installed = require(path.join(project, 'node_modules', '@svgr', 'plugin-svgo', 'package.json'));
  assert.equal(installed.name, 'svgr-plugin-svgo', 'override must resolve to the packed replacement');

  fs.mkdirSync(path.join(project, 'app'));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#paint)"/></svg>';
  fs.writeFileSync(path.join(project, 'app', 'icon.svg'), svg);
  fs.writeFileSync(path.join(project, 'app', 'layout.js'), 'export default function Layout({children}) { return <html><body>{children}</body></html>; }');
  fs.writeFileSync(path.join(project, 'app', 'page.js'), 'import Icon from "./icon.svg"; export default function Page() { return <Icon />; }');

  fs.writeFileSync(path.join(project, 'webpack.config.cjs'), `
    const path = require('path');
    module.exports = {
      context: __dirname, mode: 'production', target: 'node', entry: './app/icon.svg',
      output: { path: path.resolve(__dirname, 'dist'), filename: 'bundle.js', library: { type: 'commonjs2' } },
      module: { rules: [{ test: /\\.svg$/, use: ['@svgr/webpack'] }] }
    };
  `);
  // Use webpack's programmatic public API; no webpack-cli dependency required.
  const webpack = require(require.resolve('webpack', { paths: [project] }));
  const config = require(path.join(project, 'webpack.config.cjs'));
  return new Promise((resolve, reject) => webpack(config, (error, stats) => {
    if (error || stats.hasErrors()) return reject(error || new Error(stats.toString({ errors: true })));
    try {
      const component = require(path.join(project, 'dist', 'bundle.js')).default;
      const react = require(require.resolve('react', { paths: [project] }));
      const { renderToStaticMarkup } = require(require.resolve('react-dom/server', { paths: [project] }));
      const markup = renderToStaticMarkup(react.createElement(component));
      assert.match(markup, /svg_[a-f0-9]{12}__/);
      assert.match(markup, /viewBox="0 0 10 10"/);
      fs.writeFileSync(path.join(project, 'next.config.js'), `module.exports = {
        turbopack: { rules: { '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' } } }
      };`);
      run(process.execPath, [path.join(project, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build']);
      const html = fs.readFileSync(path.join(project, '.next', 'server', 'app', 'index.html'), 'utf8');
      assert.match(html, /svg_[a-f0-9]{12}__/);
      assert.match(html, /viewBox="0 0 10 10"/);
      resolve();
    } catch (failure) {
      reject(failure);
    }
  }));
});
