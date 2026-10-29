'use strict';

const { existsSync, readFileSync, realpathSync } = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve, sep } = require('node:path');
const { cosmiconfigSync, defaultLoadersSync } = require('cosmiconfig');

const rcExtensions = ['', '.json', '.yaml', '.yml', '.js', '.ts', '.cjs', '.mjs', '.cts', '.mts'];
const svgrPlaces = [
  'package.json',
  ...rcExtensions.map((ext) => `.svgrrc${ext}`),
  ...rcExtensions.map((ext) => `.config/svgrrc${ext}`),
  ...['.js', '.ts', '.cjs', '.mjs', '.cts', '.mts'].map((ext) => `svgr.config${ext}`),
];
const configExtensions = ['.js', '.ts', '.cjs', '.mjs', '.cts', '.mts'];
const svgoPlaces = [
  'package.json',
  ...['.json', '.yaml', '.yml', ...configExtensions].map((ext) => `.svgo${ext}`),
  ...rcExtensions.map((ext) => `.svgorc${ext}`),
  ...configExtensions.map((ext) => `svgo.config${ext}`),
];
const watchPlaces = [
  ...new Set([...svgrPlaces, ...svgoPlaces]),
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

function createConfigExplorer(name, places, prefix) {
  const label = name.toUpperCase();
  const unsupported = (file) => {
    throw new Error(`${prefix}: unsupported ${label} config ${file}; use JSON, YAML, or synchronous CommonJS (.cjs)`);
  };
  const loadJs = (file, content) => {
    let directory = dirname(file);
    while (true) {
      const packageFile = join(directory, 'package.json');
      if (existsSync(packageFile)) {
        if (JSON.parse(readFileSync(packageFile, 'utf8')).type === 'module') return unsupported(file);
        break;
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    let config;
    try {
      config = defaultLoadersSync['.js'](file, content);
    } catch (error) {
      if (error.code === 'ERR_REQUIRE_ESM' || error.code === 'ERR_REQUIRE_ASYNC_MODULE' || error instanceof SyntaxError) {
        return unsupported(file);
      }
      throw error;
    }
    // Recent Node versions can synchronously require ESM even without a
    // package type declaration; a namespace is not the config object.
    if (Object.prototype.toString.call(config) === '[object Module]') return unsupported(file);
    return config;
  };
  return cosmiconfigSync(name, {
    searchPlaces: places, cache: false,
    loaders: { '.js': loadJs, '.mjs': unsupported, '.ts': unsupported, '.cts': unsupported, '.mts': unsupported },
  });
}

function validateConfig(config, label) {
  const prototype = config && typeof config === 'object' ? Object.getPrototypeOf(config) : undefined;
  if (!config || typeof config !== 'object' || Array.isArray(config) || typeof config.then === 'function' ||
    (prototype !== Object.prototype && prototype !== null)) {
    throw new TypeError(`${label} must export a synchronous object (plain object required)`);
  }
  return config;
}

function readConfigResult(result, label) {
  if (!result) return null;
  return validateConfig(result.config, `${label} ${result.filepath}`);
}

function resolveSvgrConfig(options, filePath) {
  if (options.runtimeConfig === false) return null;
  const explorer = createConfigExplorer('svgr', svgrPlaces, 'svgr-plugin-svgo/loader');
  const readResult = (result) => readConfigResult(result, 'svgr-plugin-svgo/loader: SVGR config');
  if (options.configFile) return readResult(explorer.load(resolve(options.configFile)));
  let directory = dirname(resolve(filePath));
  while (true) {
    const result = explorer.search(directory);
    if (result) return readResult(result);
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function resolveSvgoConfig(filePath) {
  const explorer = createConfigExplorer('svgo', svgoPlaces, 'svgr-plugin-svgo');
  let directory = filePath ? dirname(resolve(filePath)) : process.cwd();
  while (true) {
    const result = explorer.search(directory);
    if (result) return readConfigResult(result, 'svgr-plugin-svgo: SVGO config');
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

module.exports = { registerConfigFiles, resolveSvgrConfig, resolveSvgoConfig, validateConfig };
