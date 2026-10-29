import type { Config, State } from '@svgr/core';

type PluginState = Omit<Partial<State>, 'caller'> & {
  caller?: NonNullable<State['caller']> & { projectRoot?: string; onNativeCssWarning?: (warning: Error) => void };
};

/** Optimizes SVG markup for an SVGR pipeline. */
declare function svgrPluginSvgo(source: string, options?: Config & {
  nativeCss?: 'error' | 'warn' | 'drop';
  prefixIds?: 'auto' | false;
}, state?: PluginState): string;

export = svgrPluginSvgo;
