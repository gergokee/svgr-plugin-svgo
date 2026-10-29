'use strict';

const { createHash } = require('node:crypto');
const { relative, resolve, sep } = require('node:path');
const { optimize, querySelectorAll, mapNodesToParents } = require('svgo');
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

const staticPseudoClasses = new Set([
  'not', 'is', 'where', 'root', 'empty',
  'nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type',
  'first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type', 'only-of-type',
]);

function isDynamicSelector(selector) {
  let dynamic = false;
  cssTree.walk(selector, (item) => {
    if (item.type === 'PseudoElementSelector' ||
      (item.type === 'PseudoClassSelector' && !staticPseudoClasses.has(item.name?.toLowerCase()))) dynamic = true;
  });
  return dynamic;
}

function nativeStylePolicies(mode, state) {
  let warned = false;
  const unmatchedSelectors = new Set();
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
      fn: (root) => {
        const parents = mapNodesToParents(root);
        return {
          element: {
            enter(node) {
              if (node.name !== 'style') return;
              const css = node.children.map((child) => child.value || '').join('');
              if (!css.trim()) return;
              let unsupported = false;
              let parseFailed = false;
              let ast;
              const removals = [];
              try {
                ast = cssTree.parse(css, { onParseError: () => { parseFailed = true; } });
                cssTree.walk(ast, (item, listItem, list) => {
                  if (item.type === 'Atrule' && item.name?.toLowerCase() !== 'charset') {
                    unsupported = true;
                    if (list && listItem) removals.push(() => list.remove(listItem));
                  }
                  if (item.type === 'Rule' && item.prelude?.type === 'SelectorList') {
                    const dynamic = [];
                    let total = 0;
                    item.prelude.children.forEach((part, partItem, parts) => {
                      total += 1;
                      const selector = cssTree.generate(part);
                      try {
                        if (querySelectorAll(root, selector, parents).length === 0) unmatchedSelectors.add(selector);
                      } catch {
                        // If the selector cannot be evaluated, the later safety check remains conservative.
                      }
                      if (isDynamicSelector(part)) dynamic.push(() => parts.remove(partItem));
                    });
                    if (dynamic.length) {
                      unsupported = true;
                      if (dynamic.length === total && list && listItem) removals.push(() => list.remove(listItem));
                      else removals.push(...dynamic);
                    }
                  }
                });
              } catch {
                parseFailed = true;
              }
              if (parseFailed || unsupported) {
                report('Native SVG contains CSS that could not be inlined safely');
                if (mode !== 'error') {
                  if (parseFailed) node.children = [{ type: 'text', value: '' }];
                  else {
                    removals.forEach((remove) => remove());
                    node.children = [{ type: 'text', value: cssTree.generate(ast) }];
                  }
                }
              }
            },
          },
        };
      },
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
            if (node.name === 'style') {
              const css = node.children.map((child) => child.value || '').join('');
              if (css.trim()) {
                let inert = true;
                try {
                  const ast = cssTree.parse(css, { onParseError: () => { inert = false; } });
                  ast.children.forEach((item) => {
                    const charset = item.type === 'Atrule' && item.name?.toLowerCase() === 'charset';
                    const unmatched = item.type === 'Rule' && item.prelude?.type === 'SelectorList' &&
                      item.prelude.children.toArray().every((selector) => unmatchedSelectors.has(cssTree.generate(selector)));
                    if (!charset && !unmatched) inert = false;
                  });
                } catch {
                  inert = false;
                }
                if (!inert) report('Native SVG contains CSS that could not be inlined safely');
              }
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
