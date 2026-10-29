# svgr-plugin-svgo

An independent SVGR plugin that optimizes SVG markup with SVGO 4, plus a
webpack-compatible loader for SVG React components. Supports Node.js 20.9 or
later and SVGR 8. This repository is not affiliated with SVGR. The plugin was
written from public SVGR and SVGO interface documentation and the project
specification; the loader also uses public webpack and Babel documentation.
This statement is not a legal or clean-room guarantee.

**Release status:** not published. `private: true` prevents accidental npm
publication until the maintainer explicitly authorizes a release and removes it.

## Use with SVGR

After the package is published, install it with `@svgr/core` and
`@svgr/plugin-jsx`, then list it before the JSX plugin:

```js
const { transform } = require('@svgr/core');

const component = await transform(svgMarkup, {
  plugins: ['svgr-plugin-svgo', '@svgr/plugin-jsx'],
}, { filePath: 'icons/example.svg', componentName: 'Example' });
```

`transform.sync` is also supported. SVGR's `svgo: false` returns the input
unchanged; it takes precedence over all optimization and validation.

## Use the loader

The same package also exports `svgr-plugin-svgo/loader`. After installation,
it accepts SVG markup and emits a JavaScript module containing a React
component; React must be installed by the consuming application. For example,
this is a Next.js Turbopack rule:

```js
module.exports = {
  turbopack: {
    rules: {
      '*.svg': {
        loaders: [{
          loader: 'svgr-plugin-svgo/loader',
          options: {
            exportType: 'named',
            namedExport: 'ReactComponent',
            svgoConfig: {},
          },
        }],
        as: '*.js',
      },
    },
  },
};
```

Then `import { ReactComponent } from './icon.svg'`. For webpack 5, use the
same loader object in a `module.rules` rule with `test: /\.svg$/i`. No npm
override is needed for this loader. `svgoConfig: {}` uses this package's
defaults and deliberately bypasses discovered SVGO config; omit it if you want
discovery. A custom SVGO plugin list replaces those defaults. In SVGO 4, omit
the old `preset-default` override `removeViewBox: false`: `removeViewBox` is no
longer in the preset, and specifying that override causes an SVGO warning.

### Loader options and compatibility

The loader uses the SVGR core and JSX plugin and supports the applicable
documented transformation options:

- `exportType`, `namedExport`, `icon`, `native`, `dimensions`, `expandProps`,
  `ref`, `memo`, `replaceAttrValues`, `svgProps`, `titleProp`, `descProp`,
  `template`, `configFile`, `runtimeConfig`, `svgo` and `svgoConfig`.
- `prettier` and `prettierConfig`; when runtime config is enabled, Prettier
  config discovery is used unless `prettierConfig` is supplied explicitly.
- `jsxRuntime: 'classic' | 'automatic' | 'classic-preact'` and `typescript`.
  The built-in Babel step strips TypeScript types; it does not type-check.
- `babel: false` returns JSX (or TSX with `typescript: true`) for a preceding
  Babel or other suitable loader. `jsxRuntimeImport` requires `babel: false`
  and a custom JSX transform. With Babel enabled, project Babel config is not
  consulted; the loader uses its own JSX/TypeScript transforms.
- `babelTargets`, for example `{ ie: '11' }`, enables Babel's preset-env for
  generated JavaScript. It does not add polyfills or transpile other modules.
  This option cannot be combined with `babel: false`.

The loader handles the guide's `resourceQuery`/`issuer` patterns and can be
chained before `url-loader` or `file-loader` in webpack. If an asset loader
produces the default export, the component uses a named export (default
`ReactComponent`, configurable with `namedExport`). The legacy asset loaders
are deprecated; prefer webpack's asset modules with `resourceQuery` where
possible. Chained asset loaders require a loader context with `fs.readFile`.
The tested webpack and Turbopack configurations are in `test/bundlers.test.cjs`.

This is not a promise of complete compatibility: the loader fixes its own SVGR
plugin pipeline, so custom `plugins` are not accepted, including when discovered
in SVGR configuration. CLI-only file-output
options such as `outDir`, `index` and `filenameCase` do not apply and are
rejected. When requested by the bundler, source maps point to the generated JSX
or TSX, not to the original SVG; upstream asset-loader maps are not composed.
Turbopack loader options must be serializable, so functions such as custom
templates must be supplied through an appropriate configuration file instead
of loader options. With runtime config enabled, caching is disabled and config
files within the bundler's project root are tracked as watch dependencies.
Configuration outside the root, imported JS configuration dependencies and
some bundler-specific watch behavior may still require a restart. Webpack watch
rebuilds are tested; Turbopack production builds are tested separately.

TypeScript declarations are provided for the plugin and loader subpath. The
loader subpath's `LoaderOptions` type includes `babelTargets`.

## Configuration and defaults

`svgoConfig` takes precedence over discovered configuration. If `runtimeConfig`
is not `false`, the plugin searches from the directory of `state.filePath`, or
the working directory if no path is supplied, upward to the filesystem root.
It uses the first nonempty configuration in this order within each directory:

1. `svgo` key in `package.json`
2. `.svgo.json`, `.svgo.yaml`, `.svgo.yml`, `.svgo.js`, `.svgo.cjs`
3. `.svgorc`, `.svgorc.json`, `.svgorc.yaml`, `.svgorc.yml`, `.svgorc.js`, `.svgorc.cjs`
4. `svgo.config.js`, `svgo.config.cjs`

JavaScript configuration must be synchronous CommonJS (`module.exports`); use
`.cjs` in an ESM project. `.mjs`, async and TypeScript config files are not
discovered. `runtimeConfig: false` skips discovery but not an explicit
`svgoConfig`. Configuration files are code: only load trusted files.

Without a configured `plugins` list, the plugin runs SVGO's `preset-default`,
then `prefixIds`. SVGO 4 preserves `viewBox` by default. When `native: true`,
CSS is inlined even when selectors match multiple elements, and presentation
styles are converted to SVG attributes before style elements are removed.
Remaining styles, such as unsupported media queries, pseudo-classes or CSS
properties, cause an error rather than being silently dropped. This does not
guarantee that every SVG/CSS feature is supported by react-native-svg; test
the result on your target platform. SVGR's JSX plugin handles native element
conversion and removal of unsupported elements.

**A custom `svgoConfig.plugins` list replaces the defaults entirely**, including
ID prefixing and native CSS safeguards. For example, `plugins: ['preset-default']`
does not enable `prefixIds`. Use `svgoConfig: {}` or set options such as
`multipass` without a plugin list to retain defaults. If specifying a custom
list, explicitly include and configure `prefixIds` as appropriate:

```js
svgoConfig: {
  plugins: ['preset-default', 'prefixIds'],
}
```

The example's SVGO `prefixIds` uses SVGO's own prefix behavior, not this
package's content-and-path hash. An explicit `removeViewBox` can remove the
viewBox where SVGO considers it redundant. Other SVGO options pass through.
The SVGR `state.filePath`, when present, is passed as SVGO's `path` and takes
precedence over a configured `path`.

Default ID/class prefixes are derived from a SHA-256 hash of input markup and
the file path relative to the project root (webpack's `rootContext`, or
`process.cwd()` for standalone SVGR). Identical files in different paths get
different prefixes, and the same project-relative path and markup are stable
across build roots. Without a file path, only the markup is used. Repeated
renders of the same component still share IDs: this is **not** per-instance ID
isolation. Use per-instance IDs in your component if that is required.
Custom `prefixIds` settings are the caller's responsibility, including their
determinism. Invalid types, malformed XML and non-SVG roots produce errors.
This optimizer is **not** an SVG sanitizer; sanitize untrusted content separately.

## SVGO 4 versus SVGO 3

SVGO 4 no longer includes `removeViewBox` or `removeTitle` in
`preset-default`, preserving scalability and titles by default. It renamed
`removeScriptElement` to `removeScripts`, restricts imports to the public API,
and uses named rather than default ESM exports. Existing custom configurations
or plugins may need changes; optimization output can differ. See the
[SVGO 3 to 4 migration guide](https://svgo.dev/docs/migrations/migration-from-v3-to-v4/).

## Replacing the default SVGR optimization dependency

Once this package is published, an npm **root** `package.json` can substitute
it for the transitive dependency used by compatible SVGR tooling:

```json
{
  "overrides": {
    "@svgr/plugin-svgo": "npm:svgr-plugin-svgo@0.1.0"
  }
}
```

Run `npm install` and inspect the resulting lockfile and dependency tree. An
override of a direct dependency is subject to npm's direct-dependency rules;
see [npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides).
Review output and existing SVGO configurations before switching: this package
is not guaranteed to be a behavior-identical replacement. A local packed tarball
override was tested previously; the registry alias example cannot be verified
until publication. Current bundler tests use the independent loader directly.

For Turbopack, loader options must be serializable: don't pass plugin functions
in the loader configuration. An npm override lets the standard loader resolve
the replacement without passing one.

## Development and release

```sh
npm ci
npm test             # plugin and SVGR integration
npm run test:bundlers # packs and installs an isolated consumer; requires network
npm run test:legacy-optimizer # optional isolated behavior comparison; requires network
npm run licenses:update
npm audit
npm audit --omit=dev
npm pack --dry-run
```

See [DEPENDENCIES.md](DEPENDENCIES.md) for the recorded license and audit
snapshot. `npm pack` is local and does not publish. No publishing is automated.
The optional legacy comparison runs the published legacy optimizer as a black
box, without inspecting its source or tests. It checks equivalent behavior and
the expected SVGO 3/4 title difference; exact output and prefixes may differ.
It is not part of the ordinary test suite or runtime dependencies.
