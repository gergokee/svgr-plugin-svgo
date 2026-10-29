'use strict';

const { transformAsync } = require('@babel/core');
const transformJsx = require('@babel/plugin-transform-react-jsx');
const transformTypescript = require('@babel/plugin-transform-typescript');
const presetEnv = require('@babel/preset-env');
const { DEFAULT_CONFIG, transform } = require('@svgr/core');
const jsxPlugin = require('@svgr/plugin-jsx');
const prettier = require('prettier');
const optimize = require('./index.cjs');
const { registerConfigFiles, resolveSvgrConfig } = require('./config.cjs');

function validateOptions(options) {
  if (options.babel != null && typeof options.babel !== 'boolean') throw new TypeError('svgr-plugin-svgo/loader: babel must be boolean');
  if (![undefined, 'classic', 'automatic', 'classic-preact'].includes(options.jsxRuntime)) {
    throw new Error('svgr-plugin-svgo/loader: unsupported jsxRuntime');
  }
  if (options.jsxRuntimeImport && options.babel !== false) {
    throw new Error('svgr-plugin-svgo/loader: custom jsxRuntimeImport requires babel: false and a custom JSX transform');
  }
  if (options.babel === false && options.babelTargets != null) {
    throw new Error('svgr-plugin-svgo/loader: babelTargets requires the built-in Babel step');
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
  registerConfigFiles(this, options);

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
    const effectiveOptions = { ...DEFAULT_CONFIG, ...resolveSvgrConfig(options, this.resourcePath), ...options };
    if (effectiveOptions.plugins != null) {
      throw new Error('svgr-plugin-svgo/loader: unsupported option plugins in SVGR configuration');
    }
    validateOptions(effectiveOptions);
    const optimizer = (markup, config, state) => {
      return optimize(markup, { ...config, runtimeConfig: effectiveOptions.runtimeConfig }, state);
    };
    let jsx = await transform(markup, {
      ...effectiveOptions,
      runtimeConfig: false,
      plugins: [optimizer, jsxPlugin],
    }, {
      filePath: this.resourcePath,
      caller: { name: 'svgr-plugin-svgo/loader', projectRoot: this.rootContext, previousExport: previousExport && asEsModule(previousExport) },
    });
    if (effectiveOptions.prettier !== false) {
      if (effectiveOptions.runtimeConfig !== false) await prettier.clearConfigCache();
      const discovered = effectiveOptions.prettierConfig != null || effectiveOptions.runtimeConfig === false
        ? null : await prettier.resolveConfig(this.resourcePath);
      jsx = await prettier.format(jsx, {
        ...(effectiveOptions.prettierConfig ?? discovered ?? {}),
        parser: effectiveOptions.typescript ? 'typescript' : 'babel',
      });
    }
    const sourceFileName = `${this.resourcePath}.svgr-generated.${effectiveOptions.typescript ? 'tsx' : 'jsx'}`;
    if (effectiveOptions.babel === false) {
      const map = this.sourceMap ? {
        version: 3, sources: [sourceFileName], sourcesContent: [jsx], names: [],
        mappings: 'AAAA' + ';AACA'.repeat(jsx.split('\n').length - 1),
      } : undefined;
      return { code: jsx, map };
    }
    const jsxOptions = effectiveOptions.jsxRuntime === 'automatic'
      ? { runtime: 'automatic' }
      : effectiveOptions.jsxRuntime === 'classic-preact'
        ? { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' }
        : { runtime: 'classic' };
    const result = await transformAsync(jsx, {
      filename: this.resourcePath,
      sourceMaps: Boolean(this.sourceMap),
      sourceFileName,
      babelrc: false,
      configFile: false,
      browserslistConfigFile: false,
      presets: effectiveOptions.babelTargets == null ? [] : [[presetEnv, { targets: effectiveOptions.babelTargets, modules: false }]],
      plugins: [
        ...(effectiveOptions.typescript ? [[transformTypescript, { isTSX: true, allExtensions: true }]] : []),
        [transformJsx, jsxOptions],
      ],
    });
    if (!result || typeof result.code !== 'string') throw new Error('Babel did not return JavaScript');
    return { code: result.code, map: result.map || undefined };
  }).then(({ code, map }) => callback(null, code, map), (error) => callback(error));
};
