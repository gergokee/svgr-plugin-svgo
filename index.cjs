'use strict';

const { createHash } = require('node:crypto');
const { dirname, relative, resolve, sep } = require('node:path');
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

function nativeStylePolicy(mode, state) {
  let warned = false;
  const report = (message) => {
    if (mode === 'error') throw new Error(message);
    if (mode === 'warn' && !warned) {
      const warning = new Error(`svgr-plugin-svgo: ${message}; unsupported CSS will be dropped and appearance may change`);
      if (state.caller?.onNativeCssWarning) state.caller.onNativeCssWarning(warning);
      else process.emitWarning(warning);
      warned = true;
    }
  };
  return {
    name: 'nativeStylePolicy',
    fn: () => ({
      element: {
        enter(node) {
          if (node.name === 'style' && node.children.some((child) => child.value?.trim())) {
            report('Native SVG contains CSS that could not be inlined safely');
          }
          if (node.attributes?.style?.trim()) {
            report('Native SVG contains inline CSS that could not be converted to presentation attributes');
            delete node.attributes.style;
          }
        },
      },
    }),
  };
}

function svgrPluginSvgo(source, options = {}, state = {}) {
  if (options.svgo === false) return source;
  if (typeof source !== 'string') {
    throw new TypeError('svgr-plugin-svgo: SVG input must be a string');
  }
  const nativeCss = options.nativeCss === undefined ? 'error' : options.nativeCss;
  if (!['error', 'warn', 'drop'].includes(nativeCss)) {
    throw new TypeError('svgr-plugin-svgo: nativeCss must be error, warn, or drop');
  }

  const filePath = state.filePath;
  const config = options.svgoConfig ?? (options.runtimeConfig === false ? undefined : discoverConfig(filePath)) ?? {};
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('svgr-plugin-svgo: SVGO configuration must be an object');
  }

  // Use project-relative paths so identical files in different locations have
  // different IDs, without baking the absolute build directory into output.
  const projectRoot = state.caller?.projectRoot || process.cwd();
  const identity = filePath ? relative(projectRoot, resolve(filePath)).split(sep).join('/') : '';
  const prefix = `svg_${createHash('sha256').update(identity).update('\0').update(source).digest('hex').slice(0, 12)}`;
  const defaultPlugins = [
    options.native
      ? { name: 'preset-default', params: { overrides: { inlineStyles: { onlyMatchedOnce: false } } } }
      : 'preset-default',
    ...(options.native ? ['convertStyleToAttrs', nativeStylePolicy(nativeCss, state), 'removeStyleElement'] : []),
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
