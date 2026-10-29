'use strict';

const { transformAsync } = require('@babel/core');
const transformJsx = require('@babel/plugin-transform-react-jsx');
const transformTypescript = require('@babel/plugin-transform-typescript');
const { transform } = require('@svgr/core');
const jsxPlugin = require('@svgr/plugin-jsx');
const prettier = require('prettier');
const optimize = require('./index.cjs');

function validateOptions(options) {
  if (options.babel != null && typeof options.babel !== 'boolean') throw new TypeError('svgr-plugin-svgo/loader: babel must be boolean');
  if (![undefined, 'classic', 'automatic', 'classic-preact'].includes(options.jsxRuntime)) {
    throw new Error('svgr-plugin-svgo/loader: unsupported jsxRuntime');
  }
  if (options.jsxRuntimeImport && options.babel !== false) {
    throw new Error('svgr-plugin-svgo/loader: custom jsxRuntimeImport requires babel: false and a custom JSX transform');
  }
}

function previousModule(source) {
  const withoutComments = source.trimStart().replace(/^(?:(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)\s*)*/, '');
  if (withoutComments.startsWith('<')) return false;
  return /^(?:export\b|import\b|(?:const|let|var)\b|module\.exports\b|exports\.)/.test(withoutComments);
}

function asEsModule(source) {
  // An asset loader can return a CommonJS default export. Once an SVG
  // component adds ESM exports, webpack cannot execute module.exports in the
  // same module. Translate the simple assignment used by asset loaders.
  return source.replace(/^(\s*(?:(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)\s*)*)(?:module\.exports|exports\.default)\s*=/,
    '$1export default');
}

module.exports = function svgComponentLoader(source) {
  const callback = this.async();
  const options = this.getOptions();
  const unsupported = ['plugins', 'outDir', 'index', 'indexTemplate', 'ignoreExisting', 'filenameCase', 'ext']
    .find((name) => options[name] != null);
  if (unsupported) {
    callback(new Error(`svgr-plugin-svgo/loader: unsupported option ${unsupported}`));
    return;
  }

  // Runtime config can affect output without appearing in webpack's dependency
  // graph. Avoid persistent stale output rather than claiming it is cacheable.
  if (options.runtimeConfig !== false && typeof this.cacheable === 'function') this.cacheable(false);

  Promise.resolve().then(async () => {
    validateOptions(options);
    const input = source.toString();
    const previousExport = previousModule(input) ? input : undefined;
    let markup = input;
    if (previousExport) {
      if (!this.fs || typeof this.fs.readFile !== 'function') {
        throw new Error('svgr-plugin-svgo/loader: reading SVG after an asset loader requires loader context fs.readFile');
      }
      markup = await new Promise((resolve, reject) => this.fs.readFile(this.resourcePath, (error, data) => {
        if (error) reject(error);
        else resolve(data.toString());
      }));
    }
    let effectiveOptions;
    const optimizer = (markup, config, state) => {
      validateOptions(config);
      effectiveOptions = config;
      return optimize(markup, config, state);
    };
    let jsx = await transform(markup, {
      ...options,
      plugins: [optimizer, jsxPlugin],
    }, {
      filePath: this.resourcePath,
      caller: { name: 'svgr-plugin-svgo/loader', previousExport: previousExport && asEsModule(previousExport) },
    });
    if (effectiveOptions.prettier !== false) {
      const discovered = effectiveOptions.prettierConfig != null || effectiveOptions.runtimeConfig === false
        ? null : await prettier.resolveConfig(this.resourcePath);
      jsx = await prettier.format(jsx, {
        ...(effectiveOptions.prettierConfig ?? discovered ?? {}),
        parser: effectiveOptions.typescript ? 'typescript' : 'babel',
      });
    }
    if (effectiveOptions.babel === false) return jsx;
    const jsxOptions = effectiveOptions.jsxRuntime === 'automatic'
      ? { runtime: 'automatic' }
      : effectiveOptions.jsxRuntime === 'classic-preact'
        ? { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' }
        : { runtime: 'classic' };
    const result = await transformAsync(jsx, {
      filename: this.resourcePath,
      babelrc: false,
      configFile: false,
      plugins: [
        ...(effectiveOptions.typescript ? [[transformTypescript, { isTSX: true, allExtensions: true }]] : []),
        [transformJsx, jsxOptions],
      ],
    });
    if (!result || typeof result.code !== 'string') throw new Error('Babel did not return JavaScript');
    return result.code;
  }).then((code) => callback(null, code), (error) => callback(error));
};
