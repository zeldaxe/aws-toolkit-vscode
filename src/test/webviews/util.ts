/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EventEmitter } from 'vscode'
import { WebviewApi } from 'vscode-webview'
import { WebviewClient, WebviewClientAgent } from '../../webviews/client'
import { VueWebview, VueWebviewPanel, VueWebviewView } from '../../webviews/main'
import { mock } from '../utilities/mockito'

/**
 * Mock API construct intended for low-level testing of framework code.
 *
 * Test code that injects their own {@link WebviewClient} should not use this.
 * Only use this class when manually responding to messages as sent by the client agent.
 */
export class MockWebviewApi<T, M = any> implements WebviewApi<T> {
    private static _instance: MockWebviewApi<any, any>
    private postedMessages: M[] = []
    private states: (T | undefined)[] = []

    public static get instance(): MockWebviewApi<any, any> {
        if (!this._instance) {
            throw new Error('The mock webview API should be created by registration before using it.')
        }
        return this._instance
    }

    private constructor(initialState?: T) {
        this.states.push(initialState)
        MockWebviewApi._instance = this
    }

    public get messages(): M[] {
        return this.postedMessages
    }

    /**
     * Adds a mocked version of the API to `globalThis` under `vscode`.
     */
    public static register<U>(initialState?: U): MockWebviewApi<U, any> {
        return ((globalThis as any).vscode = new MockWebviewApi(initialState))
    }

    public postMessage(message: any): void {
        this.postedMessages.push(message)
    }

    public getState(): T | undefined {
        return this.states[this.states.length - 1]
    }

    public setState<U extends T | undefined>(newState: U): U {
        return this.states[this.states.push(newState) - 1] as U
    }

    public assertState<U extends T | undefined>(state: U, when: number = this.states.length): void {
        assert.deepStrictEqual(this.states[when - 1], state)
    }

    public assertMessage(message: M, when: number = this.postedMessages.length): void {
        assert.deepStrictEqual(this.postedMessages[when - 1], message)
    }

    public clear(): void {
        this.states = []
        this.postedMessages = []
    }
}

/**
 * Sets up global state for running tests
 */
export function registerGlobals(): void {
    MockWebviewApi.register()
}

/**
 * Type-helper for creating a mock `WebviewClient` suitable for testing frontend logic.
 *
 * Use methods from `ts-mockito` to configure the mock.
 */
export function mockClient<T extends VueWebviewPanel<any> | VueWebviewView<any>>(): WebviewClient<T['protocol']> {
    return mock()
}

/**
 * Creates a minimalistic implementation of a {@link WebviewClient} suitable for testing backend logic.
 *
 * This re-uses {@link WebviewClientAgent}.
 */
export function createTestClient<T extends VueWebview<any>>(
    receiver: EventEmitter<any>['event'],
    emitter: EventEmitter<any>
): WebviewClient<T['protocol']> {
    type Listener = Parameters<typeof window['addEventListener']>[1]
    type Window = ConstructorParameters<typeof WebviewClientAgent>[0]

    const listeners: Record<string, Listener[]> = {}

    const dispatch = (event: Event) => {
        for (const listener of listeners[event.type] ?? []) {
            if (typeof listener === 'function') {
                listener(event)
            } else {
                listener.handleEvent(event)
            }
        }

        return true // Not technically true to spec but good enough
    }

    const window: Window = {
        addEventListener: (...args: Parameters<typeof window['addEventListener']>) => {
            const [type, listener] = args
            ;(listeners[type] ??= []).push(listener)
        },
        removeEventListener: (...args: Parameters<typeof window['removeEventListener']>) => {
            const [type, listener] = args
            const arr = listeners[type] ?? []
            const ind = arr.indexOf(listener)

            if (ind !== -1) {
                arr.splice(ind, 1)
            }
        },
        dispatchEvent: dispatch,
        clearTimeout: clearTimeout,
    }

    const agent = new WebviewClientAgent(window, {
        // Testing state is not needed right now
        getState: () => {},
        setState: state => state,
        postMessage: message => emitter.fire(message),
    })

    // TODO: add clean-up logic
    receiver(e => dispatch(new MessageEvent('message', { data: e })))

    let counter = 0
    return new Proxy<WebviewClient<T['protocol']>>({} as any, {
        set: () => {
            throw new TypeError('Cannot set property to webview client')
        },
        get: (_, prop) => {
            // Why can't Typescript do CFA with asserts using `typeof` ???
            if (typeof prop !== 'string') {
                assert.fail(`Client property must be a string, got symbol: ${String(prop)}`)
            }
            const id = String(counter++)

            // hard-coded timeout time of 5 seconds for testing
            return (...args: any) => agent.sendRequest(id, prop, args, 5000)
        },
        getPrototypeOf() {
            return Object
        },
    })
}
