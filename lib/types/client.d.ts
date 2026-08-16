/**
 * Type surface for the dsh-tech-stack-survey Client half (lib/client.js).
 * The browser bundle registers via window.__ModuleLoader__.load({ id, factory })
 * and the factory exports { inject, apply }, mirroring the
 * @deepseek-ai/dsh-client-ui-* bundle convention.
 */

/** Cordis service injections required by the browser half (slot registry + locale). */
export declare const inject: string[];

/**
 * Register the survey composer into the `conversation.composer` chain and the
 * `dss` locale dictionaries.
 * @param ctx - the browser plugin context (injects `slots` and `locale`).
 */
export declare function apply(ctx: any): void;
