// Type declarations for json-logic-js
declare module 'json-logic-js' {
    export function apply(
        logic: Record<string, unknown> | boolean,
        data: Record<string, unknown>,
    ): unknown;

    export function add_operation(
        name: string,
        code: (...args: unknown[]) => unknown,
    ): void;

    export function rm_operation(name: string): void;

    export function is_logic(logic: unknown): boolean;

    export function truthy(value: unknown): boolean;

    export function get_operator(logic: Record<string, unknown>): string;

    export function get_values(logic: Record<string, unknown>): unknown[];
}
