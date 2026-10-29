# Dependency licenses and audit snapshot

Recorded on 2026-10-29 from the production packages in `package-lock.json`.
These are package metadata SPDX identifiers, not a legal assessment; dependency
ranges and lockfiles may change. Inspect each package's license and notices when
distributing and regenerate this inventory after dependency updates.

| License | Packages and locked versions |
| --- | --- |
| MIT | @babel/code-frame 7.29.7; @babel/helper-validator-identifier 7.29.7; callsites 3.1.0; commander 11.1.0; cosmiconfig 9.0.2; css-tree 3.2.1 and 2.2.1; csso 5.0.5; dom-serializer 2.0.0; env-paths 2.2.1; error-ex 1.3.4; import-fresh 3.3.1; is-arrayish 0.2.1; js-tokens 4.0.0; js-yaml 4.3.2; json-parse-even-better-errors 2.3.1; lines-and-columns 1.2.4; parent-module 1.0.1; parse-json 5.2.0; resolve-from 4.0.0; svgo 4.1.0 |
| ISC | boolbase 1.0.0; picocolors 1.1.1 |
| BSD-2-Clause | css-select 6.0.0; css-what 7.0.0; domelementtype 2.3.0; domhandler 5.0.3; domutils 3.2.2; entities 4.5.0; nth-check 2.1.1 |
| BSD-3-Clause | source-map-js 1.2.2 |
| CC0-1.0 | mdn-data 2.27.1 and 2.0.28 |
| Python-2.0 | argparse 2.0.1 |
| BlueOak-1.0.0 | sax 1.6.1 |

## Development-only dependencies

Versions and the complete dependency graph are recorded in `package-lock.json`.
Shared dependencies are listed above; these packages are marked development-only:

| License | Packages |
| --- | --- |
| MIT | @babel/compat-data; @babel/core; @babel/generator; @babel/helper-compilation-targets; @babel/helper-globals; @babel/helper-module-imports; @babel/helper-module-transforms; @babel/helper-string-parser; @babel/helper-validator-option; @babel/helpers; @babel/parser; @babel/template; @babel/traverse; @babel/types; @jridgewell/gen-mapping; @jridgewell/remapping; @jridgewell/resolve-uri; @jridgewell/sourcemap-codec; @jridgewell/trace-mapping; @svgr/babel-plugin-add-jsx-attribute; @svgr/babel-plugin-remove-jsx-attribute; @svgr/babel-plugin-remove-jsx-empty-expression; @svgr/babel-plugin-replace-jsx-attribute-value; @svgr/babel-plugin-svg-dynamic-title; @svgr/babel-plugin-svg-em-dimensions; @svgr/babel-plugin-transform-react-native-svg; @svgr/babel-plugin-transform-svg-component; @svgr/babel-preset; @svgr/core; cosmiconfig 8.3.6; @svgr/hast-util-to-babel-ast; @svgr/plugin-jsx; browserslist; camelcase; convert-source-map; debug; dot-case; escalade; gensync; jsesc; json5; lower-case; ms; no-case; node-releases; path-type; snake-case; svg-parser; update-browserslist-db |
| Apache-2.0 | baseline-browser-mapping |
| CC-BY-4.0 | caniuse-lite |
| ISC | electron-to-chromium; lru-cache; semver; yallist |
| 0BSD | tslib |

On that date, `npm audit` and `npm audit --omit=dev` both reported zero known
vulnerabilities for the locked package tree. The bundler test installs its own
temporary consumer dependencies; those are not production dependencies of this
package and their audit status may differ. Audits are time-dependent and cannot
guarantee the absence of vulnerabilities.
