'use strict';

const { createHash } = require('node:crypto');
const { relative, resolve, sep } = require('node:path');
const { optimize } = require('svgo');
const cssTree = require('css-tree');
const { resolveSvgoConfig, validateConfig } = require('./config.cjs');

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

function nativeStylePolicies(mode, state) {
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
  const checkInline = (node) => {
    if (node.attributes?.style?.trim()) {
      report('Native SVG contains inline CSS that could not be converted to presentation attributes');
      delete node.attributes.style;
    }
  };
  return {
    preflight: {
      name: 'preflightNativeStyles',
      fn: () => ({
        element: {
          enter(node) {
            if (node.name !== 'style') return;
            const css = node.children.map((child) => child.value || '').join('');
            if (!css.trim()) return;
            let unsupported = false;
            try {
              const ast = cssTree.parse(css, { onParseError: () => { unsupported = true; } });
              cssTree.walk(ast, (item) => {
                if (['Atrule', 'PseudoClassSelector', 'PseudoElementSelector'].includes(item.type)) unsupported = true;
              });
            } catch {
              unsupported = true;
            }
            if (unsupported) report('Native SVG contains CSS that could not be inlined safely');
          },
        },
      }),
    },
    validateInline: {
      name: 'validateNativeInlineStyles',
      fn: () => ({ element: { enter: checkInline } }),
    },
    validate: {
      name: 'validateNativeStyles',
      fn: () => ({
        element: {
          enter(node) {
            if (node.name === 'style' && node.children.some((child) => child.value?.trim())) {
              report('Native SVG contains CSS that could not be inlined safely');
            }
            checkInline(node);
          },
        },
      }),
    },
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
  const prefixIds = options.prefixIds === undefined ? 'auto' : options.prefixIds;
  if (prefixIds !== 'auto' && prefixIds !== false) {
    throw new TypeError('svgr-plugin-svgo: prefixIds must be auto or false');
  }

  const filePath = state.filePath;
  const config = options.svgoConfig ?? (options.runtimeConfig === false ? undefined : resolveSvgoConfig(filePath)) ?? {};
  validateConfig(config, 'svgr-plugin-svgo: SVGO configuration');

  // Use project-relative paths so identical files in different locations have
  // different IDs, without baking the absolute build directory into output.
  const projectRoot = state.caller?.projectRoot || process.cwd();
  const identity = filePath ? relative(projectRoot, resolve(filePath)).split(sep).join('/') : '';
  const prefix = `svg_${createHash('sha256').update(identity).update('\0').update(source).digest('hex').slice(0, 12)}`;
  const nativeStyles = options.native ? nativeStylePolicies(nativeCss, state) : null;
  const defaultPlugins = [
    options.native
      ? { name: 'preset-default', params: { overrides: { inlineStyles: { onlyMatchedOnce: false } } } }
      : 'preset-default',
  ];
  const plugins = config.plugins ?? defaultPlugins;
  if (!Array.isArray(plugins)) {
    throw new TypeError('svgr-plugin-svgo: SVGO config.plugins must be an array');
  }
  const hasPrefixIds = plugins.some((entry) => entry === 'prefixIds' || (entry && typeof entry === 'object' && entry.name === 'prefixIds'));
  const automaticPrefix = prefixIds === 'auto' && !hasPrefixIds ? [{ name: 'prefixIds', params: { prefix } }] : [];
  const nativePrelude = nativeStyles ? [
    nativeStyles.preflight,
    'mergeStyles',
    { name: 'inlineStyles', params: { onlyMatchedOnce: false } },
    'convertStyleToAttrs',
    nativeStyles.validateInline,
  ] : [];
  const nativePostlude = nativeStyles ? ['convertStyleToAttrs', nativeStyles.validate, 'removeStyleElement'] : [];

  try {
    return optimize(source, {
      ...config,
      ...(filePath ? { path: filePath } : {}),
      plugins: [validateRoot, ...nativePrelude, ...plugins, ...nativePostlude, ...automaticPrefix],
    }).data;
  } catch (error) {
    throw new Error(`svgr-plugin-svgo: failed to optimize${filePath ? ` ${filePath}` : ''}: ${error.message}`, { cause: error });
  }
}

module.exports = svgrPluginSvgo;
module.exports.default = svgrPluginSvgo;
