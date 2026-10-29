# svgr-plugin-svgo

An independent SVGR plugin that optimizes SVG markup with SVGO 4. Supports
Node.js 20.9 or later and SVGR 8. This repository is not affiliated with SVGR.
It was written from public SVGR and SVGO interface documentation and the
project specification. This statement is not a legal or clean-room guarantee.

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
`removeStyleElement` is also applied; SVGR's JSX plugin handles native element
conversion and removal of unsupported elements. Options such as `multipass`
can be supplied without replacing these defaults. If a configuration provides
`plugins`, it replaces the default plugin list **entirely**, so add
`prefixIds` yourself if needed; an explicit `removeViewBox` can remove the
viewBox where SVGO considers it redundant. Other SVGO options pass through.
The SVGR `state.filePath`, when present, is passed as SVGO's `path` and takes
precedence over a configured `path`.

Default ID/class prefixes are derived from a SHA-256 hash of the input markup,
not an absolute path, and are reproducible across machines. Different markup
normally gets different prefixes. Identical SVG markup, including repeated
renders of the same component, gets the same prefix; this is **not** per-instance
ID isolation. Use per-instance IDs in your component if that is required.
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
is not guaranteed to be a behavior-identical replacement. The test suite checks
a local packed tarball override, including webpack and Next.js 16 Turbopack;
the registry alias example cannot be verified until publication.

For Turbopack, loader options must be serializable: don't pass plugin functions
in the loader configuration. An npm override lets the standard loader resolve
the replacement without passing one.

## Development and release

```sh
npm ci
npm test             # plugin and SVGR integration
npm run test:bundlers # packs and installs an isolated consumer; requires network
npm audit
npm audit --omit=dev
npm pack --dry-run
```

See [DEPENDENCIES.md](DEPENDENCIES.md) for the recorded license and audit
snapshot. `npm pack` is local and does not publish. No publishing is automated.
