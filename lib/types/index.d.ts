/**
 * Type surface for the dsh-tech-stack-survey Host half (lib/index.js).
 * The module is a standard Cordis plugin: named exports { name, inject, apply },
 * following the @deepseek-ai/dsh-tool-* package convention.
 */

/** Stable plugin id used by the Loader entry. */
export declare const name: string;

/** Cordis service injections required by `apply` (tools registry + userQuestions seam). */
export declare const inject: string[];

/**
 * Register the `design_stack_survey` tool into the tools registry.
 * @param ctx - the plugin context (injects `tools` and `userQuestions`).
 */
export declare function apply(ctx: any): void;
