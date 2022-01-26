/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { PropType } from 'vue'

/**
 * Creates an anonymous class whose constructor automatically applies default values.
 *
 * Mostly just used for Vue as the types expect a class. Otherwise one would need to
 * manually describe constructor parameters and assignments for every field.
 *
 * Example (type inferred):
 * ```ts
 * export const MyClass = createClass({
 *     foo: 0,
 *     bar: 'a' as 'a' | 'b',
 * })
 * ```
 *
 * @param defaults Defaults to use during construction.
 *
 * @returns Anonymous class. Use `typeof MyClass` to extract its type.
 */
export function createClass<T>(defaults: T): { new (initial?: Partial<T>): T }
export function createClass<T>(defaults: Partial<T>, required: true): { new (initial: T): T }
export function createClass<T>(defaults: T): { new (initial?: Partial<T>): T } | { new (initial: T): T } {
    return class {
        constructor(initial: T | Partial<T> = {}) {
            Object.assign(this, defaults, initial)
        }
    } as any
}

/**
 * Creates a Vue 'type' from a class. Note that nothing is actually created; a type is only inferred from the `Model`.
 *
 * @param Model Model class, usually created from {@link createClass}.
 *
 * @returns The {@link Object} class with the typed coerced as a {@link PropType} for the `Model` instance.
 */
export function createType<T extends new (obj: any) => any>(Model: T): PropType<InstanceType<T>> {
    return Object
}

/**
 * Creates an object specific to Vue's 'props' fields that is typed exclusively by a default value.
 *
 * Most Vue documentation provides examples of constructors as types, however, it is not uncommon
 * to have some default value with an unknown instance type.
 *
 * This function assumes that the default value has Object on its prototype chain which is true for
 * almost all JS objects.
 */
export function createDefaultProp<T>(value: T): { type: new () => T; default: T } {
    return {
        type: Object as unknown as new () => T,
        default: value,
    }
}
