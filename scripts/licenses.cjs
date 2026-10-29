'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const groups = new Map();
for (const [location, metadata] of Object.entries(lock.packages)) {
  if (!location || metadata.dev || metadata.devOptional) continue;
  if (!metadata.license) throw new Error(`Missing license metadata for ${location}`);
  const name = location.replace(/^node_modules\//, '');
  const entries = groups.get(metadata.license) || [];
  entries.push(`${name}@${metadata.version}`);
  groups.set(metadata.license, entries);
}
const sections = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([license, entries]) =>
  `## ${license}\n\n${entries.sort().map((entry) => `- ${entry}`).join('\n')}`);
const text = '# Dependency licenses and audit\n\n' +
  'Generated from production package metadata in package-lock.json. SPDX values are not a legal assessment; ' +
  'inspect the licenses and notices when distributing. Run `npm run licenses:update` after dependency updates.\n\n' +
  'Run `npm audit` and `npm audit --omit=dev` to check current advisories; audit results change over time. ' +
  'The optional legacy optimizer comparison installs the old optimizer separately; its deepmerge dependency is affected by ' +
  'low-severity GHSA-gcqx-w48m-w2h4 and is not part of this package’s runtime tree. Bundler-test fixture dependencies are also separate.\n\n' +
  sections.join('\n\n') + '\n';
fs.writeFileSync(path.join(root, 'DEPENDENCIES.md'), text);
