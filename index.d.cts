import type { Config, State } from '@svgr/core';

type PluginState = Omit<Partial<State>, 'caller'> & {
  caller?: NonNullable<State['caller']> & { projectRoot?: string };
};

/** Optimizes SVG markup for an SVGR pipeline. */
declare function svgrPluginSvgo(source: string, options?: Config, state?: PluginState): string;

export = svgrPluginSvgo;
