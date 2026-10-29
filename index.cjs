'use strict';

const { createHash } = require('node:crypto');
const { dirname, resolve } = require('node:path');
const { cosmiconfigSync } = require('cosmiconfig');
const { optimize } = require('svgo');

// Synchronous discovery also works with SVGR's transform.sync API.
function discoverConfig(filePath) {
  const explorer = cosmiconfigSync('svgo', {
    searchPlaces: [
      'package.json', '.svgo.json', '.svgo.yaml', '.svgo.yml', '.svgo.js', '.svgo.cjs',
      '.svgorc', '.svgorc.json', '.svgorc.yaml', '.svgorc.yml',
      '.svgorc.js', '.svgorc.cjs', 'svgo.config.js', 'svgo.config.cjs',
    ],
    cache: false,
  });
  let directory = filePath ? dirname(resolve(filePath)) : process.cwd();
  while (true) {
    const result = explorer.search(directory);
    if (result) return result.config;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

const validateRoot = {
  name: 'validateSvgRoot',
  fn: () => ({
    root: {
      enter(root) {
        const elements = root.children.filter((child) => child.type === 'element');
        if (elements.length !== 1 || !/^(?:[^:]+:)?svg$/.test(elements[0].name)) {
          throw new Error('Expected a single SVG root element');
        }
      },
    },
  }),
};

function svgrPluginSvgo(source, options = {}, state = {}) {
  if (options.svgo === false) return source;
  if (typeof source !== 'string') {
    throw new TypeError('svgr-plugin-svgo: SVG input must be a string');
  }

  const filePath = state.filePath;
  const config = options.svgoConfig ?? (options.runtimeConfig === false ? undefined : discoverConfig(filePath)) ?? {};
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('svgr-plugin-svgo: SVGO configuration must be an object');
  }

  // Content-based prefixes avoid machine-dependent absolute paths and are stable
  // across builds. Identical SVG source yields identical prefixes.
  const prefix = `svg_${createHash('sha256').update(source).digest('hex').slice(0, 12)}`;
  const defaultPlugins = [
    'preset-default',
    ...(options.native ? ['removeStyleElement'] : []),
    { name: 'prefixIds', params: { prefix } },
  ];
  const plugins = config.plugins ?? defaultPlugins;
  if (!Array.isArray(plugins)) {
    throw new TypeError('svgr-plugin-svgo: SVGO config.plugins must be an array');
  }

  try {
    return optimize(source, {
      ...config,
      ...(filePath ? { path: filePath } : {}),
      plugins: [validateRoot, ...plugins],
    }).data;
  } catch (error) {
    throw new Error(`svgr-plugin-svgo: failed to optimize${filePath ? ` ${filePath}` : ''}: ${error.message}`, { cause: error });
  }
}

module.exports = svgrPluginSvgo;
module.exports.default = svgrPluginSvgo;
