# svgr-plugin-svgo

An independent SVGR plugin that optimizes SVG markup with SVGO 4, plus a
webpack-compatible loader for SVG React components. Supports Node.js 20.9 or
later and SVGR 8. This repository is not affiliated with SVGR. The plugin was
written from public SVGR and SVGO interface documentation and the project
specification; the loader also uses public webpack and Babel documentation.
This statement is not a legal or clean-room guarantee.

The plugin and loader currently ship as one package, so plugin-only consumers
also install the loader's Babel, Prettier and SVGR dependencies. Splitting them
into separate packages is a possible future change.

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
discovery. A custom SVGO plugin list replaces the default optimization list;
automatic prefixing and native safety checks remain unless configured otherwise.
In SVGO 4, omit
the old `preset-default` override `removeViewBox: false`: `removeViewBox` is no
longer in the preset, and specifying that override causes an SVGO warning.

### Loader options and compatibility

The loader uses the SVGR core and JSX plugin and supports the applicable
documented transformation options:

- `exportType`, `namedExport`, `icon`, `native`, `dimensions`, `expandProps`,
  `ref`, `memo`, `replaceAttrValues`, `svgProps`, `titleProp`, `descProp`,
  `template`, `configFile`, `runtimeConfig`, `svgo` and `svgoConfig`.
- `nativeCss: 'error' | 'warn' | 'drop'` controls unconverted native CSS;
  `error` is the default (see below).
- `prefixIds: 'auto' | false` controls the package's automatic ID prefixing;
  `auto` is the default, including with a custom SVGO plugin list.
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
Prettier JavaScript configurations may still require a restart because Node
caches loaded modules. Some bundler-specific watch behavior may also require a
restart. Webpack watch rebuilds are tested; Turbopack production builds are
tested separately.
Caching remains disabled because configurations and custom plugins can depend
on untracked files or process state. Prettier is resolved without its cache,
rather than clearing its global cache for every SVG.

TypeScript declarations are provided for the plugin and loader subpath. The
loader subpath's `LoaderOptions` type includes `babelTargets`.

## Configuration and defaults

### SVGR loader configuration

Unless `runtimeConfig: false`, the loader searches upward from the SVG's
directory, using the first nonempty config in the nearest directory. Within
each directory it checks, in this order:

1. The `svgr` key in `package.json`.
2. `.svgrrc` with no extension or with `.json`, `.yaml`, `.yml`, `.js` or `.cjs`.
3. `.config/svgrrc` with the same extensions.
4. `svgr.config.js` or `svgr.config.cjs`.

CommonJS files must export a synchronous object. `.js` files in an ESM package,
and `.mjs`, `.ts`, `.cts` and `.mts` variants of these names, are detected in
search order but rejected with an actionable error instead of being silently
ignored. Convert them to `.cjs`, JSON or YAML. An explicit `configFile` follows
the same rules; explicit loader options override the discovered options.

### SVGO configuration

`svgoConfig` takes precedence over discovered configuration. If `runtimeConfig`
is not `false`, the plugin searches from the directory of `state.filePath`, or
the working directory if no path is supplied, upward to the filesystem root.
It uses the first nonempty configuration in this order within each directory:

1. `svgo` key in `package.json`
2. `.svgo.json`, `.svgo.yaml`, `.svgo.yml`, `.svgo.js`, `.svgo.cjs`
3. `.svgorc`, `.svgorc.json`, `.svgorc.yaml`, `.svgorc.yml`, `.svgorc.js`, `.svgorc.cjs`
4. `svgo.config.js`, `svgo.config.cjs`

JavaScript configuration must export a synchronous plain object using CommonJS
(`module.exports`); use `.cjs` in an ESM project. `.mjs`, `.ts`, `.cts` and
`.mts` variants of these names and `.js` files in ESM packages are detected in
search order but rejected with a clear error; asynchronous exports and
non-plain objects are rejected too. `runtimeConfig: false` skips discovery but
not an explicit `svgoConfig`. Configuration files are code: only load trusted
files.

Without a configured `plugins` list, the plugin runs SVGO's `preset-default`,
then `prefixIds`. SVGO 4 preserves `viewBox` by default. When `native: true`,
CSS is inlined even when selectors match multiple elements, and presentation
styles are converted to SVG attributes before style elements are removed.
Remaining styles, such as unsupported media queries, pseudo-classes or CSS
properties, cause an error rather than being silently dropped by default. A
preflight check detects interactive pseudo-classes such as `:hover` and
`:focus`, pseudo-elements, and at-rules such as `@media`, `@supports`,
`@font-face`, `@keyframes` and `@import` before optimization. Structural
selectors such as `:not`, `:nth-child` and `:first-child` can be inlined by
SVGO; unmatched selectors and `@charset` can be discarded without a warning.
Other CSS that cannot be evaluated or inlined may still be rejected.
For native icon sets containing unsupported design-tool styles, set:

```js
options: { native: true, nativeCss: 'warn' }
```

`nativeCss: 'warn'` drops unsupported selectors and at-rules before inlining,
as well as remaining unconverted stylesheet and inline CSS, and
emits one warning per SVG through the loader, or as a Node warning when the
plugin is used directly. `nativeCss: 'drop'` drops it without a warning;
`nativeCss: 'error'` is the default. Dropping CSS can change rendering,
including font and blend effects, so review icons on the target platform. With
`svgo: false` the optimizer and these safeguards are bypassed. This does not
guarantee that every SVG/CSS feature is supported by react-native-svg; test
the result on your target platform. SVGR's JSX plugin handles native element
conversion and removal of unsupported elements.

**A custom `svgoConfig.plugins` list replaces the default optimization list**,
but the package still adds its file-and-content-based ID prefix by default.
With `native: true`, CSS preflight, inlining and safety checks also run around
the custom list. Arbitrary custom plugins can still deliberately remove or
rewrite content before a later check can inspect it. For example:

```js
{
  svgoConfig: { plugins: ['preset-default'] },
  prefixIds: 'auto', // default
}
```

If the custom list includes `prefixIds` (as a string or plugin object), its
configuration is used instead and no automatic prefix is added. Setting
`prefixIds: false` disables **automatic** prefixing; an explicitly listed
`prefixIds` plugin still runs. This preserves control over the SVGO plugin
list. An explicit `removeViewBox` can remove the viewBox where SVGO considers
it redundant. Other SVGO options pass through.
The SVGR `state.filePath`, when present, is passed as SVGO's `path` and takes
precedence over a configured `path`.

Default ID/class prefixes are derived from a SHA-256 hash of input markup and
the file path relative to the project root (webpack's `rootContext`, or
`process.cwd()` for standalone SVGR). Identical files in different paths get
different prefixes, and the same project-relative path and markup are stable
across build roots. Without a file path, only the markup is used. Repeated
renders of the same component still share IDs: this is **not** per-instance ID
isolation. For example, in some browsers a hidden first copy (such as an
inactive tab) can cause a visible copy's gradient, mask or clip path to fail;
different definitions controlled by props can also resolve to the first copy.
Duplicate IDs can be flagged by validation and accessibility tools. Use
per-instance IDs in your component if that is required.
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
