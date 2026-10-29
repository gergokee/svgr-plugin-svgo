'use strict';

const { existsSync, realpathSync } = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve, sep } = require('node:path');
const { cosmiconfigSync } = require('cosmiconfig');

const svgrPlaces = [
  'package.json', '.svgrrc', '.svgrrc.json', '.svgrrc.yaml', '.svgrrc.yml', '.svgrrc.js', '.svgrrc.cjs',
  'svgr.config.js', 'svgr.config.cjs',
];
const watchPlaces = [
  ...svgrPlaces, '.svgo.json', '.svgo.yaml', '.svgo.yml', '.svgo.js', '.svgo.cjs', '.svgorc',
  '.svgorc.json', '.svgorc.yaml', '.svgorc.yml', '.svgorc.js', '.svgorc.cjs', 'svgo.config.js', 'svgo.config.cjs',
  '.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.json5',
  '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', 'prettier.config.js', 'prettier.config.cjs',
  'prettier.config.mjs', '.editorconfig',
];

function registerConfigFiles(context, options) {
  if (typeof context.addDependency !== 'function') return;
  if (options.runtimeConfig === false) return;
  const canonical = (file) => {
    try { return realpathSync(file); } catch { return resolve(file); }
  };
  const root = canonical(context.rootContext || process.cwd());
  const withinRoot = (file) => {
    const difference = relative(root, file);
    return !isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${sep}`);
  };
  if (options.configFile) {
    const configFile = resolve(options.configFile);
    if (withinRoot(canonical(configFile))) context.addDependency(configFile);
  }
  let directory = canonical(dirname(resolve(context.resourcePath)));
  if (!withinRoot(directory)) return;
  while (true) {
    for (const name of watchPlaces) {
      const file = join(directory, name);
      if (existsSync(file)) context.addDependency(file);
      else if (typeof context.addMissingDependency === 'function') context.addMissingDependency(file);
    }
    const parent = dirname(directory);
    if (parent === directory || !withinRoot(parent)) break;
    directory = parent;
  }
}

function resolveSvgrConfig(options, filePath) {
  if (options.runtimeConfig === false) return null;
  const explorer = cosmiconfigSync('svgr', { searchPlaces: svgrPlaces, cache: false });
  if (options.configFile) return explorer.load(resolve(options.configFile))?.config ?? null;
  let directory = dirname(resolve(filePath));
  while (true) {
    const result = explorer.search(directory);
    if (result) return result.config;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

module.exports = { registerConfigFiles, resolveSvgrConfig };
