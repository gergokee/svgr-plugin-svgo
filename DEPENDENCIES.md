# Dependency licenses and audit snapshot

Recorded on 2026-10-29 from production package metadata in `package-lock.json`.
Identifiers are not a legal assessment; dependency ranges and lockfiles may
change. Inspect dependency licenses and notices when distributing, and
regenerate this inventory after updates.

| License | Packages and locked versions |
| --- | --- |
| MIT | @babel/code-frame 7.29.7; @babel/compat-data 7.29.7; @babel/core 7.29.7; @babel/generator 7.29.8; @babel/helper-annotate-as-pure 7.29.7; @babel/helper-compilation-targets 7.29.7; @babel/helper-globals 7.29.7; @babel/helper-module-imports 7.29.7; @babel/helper-module-transforms 7.29.7; @babel/helper-plugin-utils 7.29.7; @babel/helper-string-parser 7.29.11; @babel/helper-validator-identifier 7.29.7; @babel/helper-validator-option 7.29.7; @babel/helpers 7.29.10; @babel/parser 7.29.11; @babel/plugin-syntax-jsx 7.29.7; @babel/plugin-transform-react-jsx 7.29.7; @babel/template 7.29.7; @babel/traverse 7.29.10; @babel/types 7.29.11; @jridgewell/gen-mapping 0.3.13; @jridgewell/remapping 2.3.5; @jridgewell/resolve-uri 3.1.2; @jridgewell/sourcemap-codec 1.6.0; @jridgewell/trace-mapping 0.3.31; @svgr/babel-plugin-add-jsx-attribute 8.0.0; @svgr/babel-plugin-remove-jsx-attribute 8.0.0; @svgr/babel-plugin-remove-jsx-empty-expression 8.0.0; @svgr/babel-plugin-replace-jsx-attribute-value 8.0.0; @svgr/babel-plugin-svg-dynamic-title 8.0.0; @svgr/babel-plugin-svg-em-dimensions 8.0.0; @svgr/babel-plugin-transform-react-native-svg 8.1.0; @svgr/babel-plugin-transform-svg-component 8.0.0; @svgr/babel-preset 8.1.0; @svgr/core 8.1.0; cosmiconfig 8.3.6 under @svgr/core; @svgr/hast-util-to-babel-ast 8.0.0; @svgr/plugin-jsx 8.1.0; browserslist 4.29.5; callsites 3.1.0; camelcase 6.3.0; commander 11.1.0; convert-source-map 2.0.0; cosmiconfig 9.0.2; css-tree 3.2.1 and 2.2.1; csso 5.0.5; debug 4.4.3; dom-serializer 2.0.0; dot-case 3.0.4; env-paths 2.2.1; error-ex 1.3.4; escalade 3.2.0; gensync 1.0.0-beta.2; import-fresh 3.3.1; is-arrayish 0.2.1; js-tokens 4.0.0; js-yaml 4.3.2; jsesc 3.1.0; json-parse-even-better-errors 2.3.1; json5 2.2.3; lines-and-columns 1.2.4; lower-case 2.0.2; ms 2.1.3; no-case 3.0.4; node-releases 2.0.61; parent-module 1.0.1; parse-json 5.2.0; path-type 4.0.0; resolve-from 4.0.0; snake-case 3.0.4; svg-parser 2.1.0; svgo 4.1.0; update-browserslist-db 1.3.4 |
| MIT (continued) | @babel/helper-create-class-features-plugin 7.29.7; @babel/helper-member-expression-to-functions 7.29.7; @babel/helper-optimise-call-expression 7.29.7; @babel/helper-replace-supers 7.29.7; @babel/helper-skip-transparent-expression-wrappers 7.29.7; @babel/plugin-syntax-typescript 7.29.7; @babel/plugin-transform-typescript 7.29.9; prettier 3.9.10 |
| Python-2.0 | argparse 2.0.1 |
| Apache-2.0 | baseline-browser-mapping 2.11.34 |
| ISC | boolbase 1.0.0; electron-to-chromium 1.5.467; lru-cache 5.1.1; picocolors 1.1.1; semver 6.3.1; yallist 3.1.1 |
| CC-BY-4.0 | caniuse-lite 1.0.30001820 |
| BSD-2-Clause | css-select 6.0.0; css-what 7.0.0; domelementtype 2.3.0; domhandler 5.0.3; domutils 3.2.2; entities 4.5.0; nth-check 2.1.1 |
| CC0-1.0 | mdn-data 2.0.28 and 2.27.1 |
| BlueOak-1.0.0 | sax 1.6.1 |
| BSD-3-Clause | source-map-js 1.2.2 |
| 0BSD | tslib 2.8.1 |

`npm audit` and `npm audit --omit=dev` reported zero known vulnerabilities for
the locked tree on that date. Bundler tests install their own temporary consumer
dependencies, whose licenses and audit status are not covered by this inventory.
Audits are time-dependent and cannot guarantee the absence of vulnerabilities.
The optional legacy optimizer comparison installs the old optimizer separately;
its `deepmerge` dependency is affected by low-severity GHSA-gcqx-w48m-w2h4.
That comparison-only dependency is not part of this package's runtime tree.
