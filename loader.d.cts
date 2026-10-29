import type { Config } from '@svgr/core';

/** Webpack-compatible loader. Use the package subpath as a loader name. */
declare function svgComponentLoader(this: svgComponentLoader.LoaderContext, source: string | Uint8Array): void;

declare namespace svgComponentLoader {
  interface LoaderOptions extends Omit<Config, 'plugins'> {
    babel?: boolean;
    babelTargets?: string | string[] | Record<string, string | boolean>;
    nativeCss?: 'error' | 'warn' | 'drop';
  }
  interface LoaderContext {
    resourcePath: string;
    sourceMap?: boolean;
    getOptions(): LoaderOptions;
    async(): (error: Error | null, code?: string, map?: unknown) => void;
  }
}

export = svgComponentLoader;
