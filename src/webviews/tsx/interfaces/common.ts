/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wrapper interface for the Webview VS Code API:
 * @function postMessage: Posts a message to the Node controller
 * @function setState: Sets the VS Code webview state so the webview can reload the view if the webview loses focus and isn't persistant.
 * @function getState: Gets the VS Code webview state, used upon regaining focus without full persistence
 */
export interface VsCode<State> {
    postMessage(output: WebviewOutputMessage<State>): void
    setState(state: State): void
    getState(): State
}

/**
 * Base props for the top level object.
 * Enforces state and grants access to the VS Code functions
 */
export interface VsCodeReactWebviewProp<State> {
    vscode: VsCode<State>
    defaultState: State
}

export interface WebviewOutputMessage<State> {
    message: Partial<State>
    command: string
}

/**
 * ValidityFields are used for input fields whose validity you want to check upstream.
 * Only usable for input fields whose value is a string.
 * @field value: Value to add to input field.
 * @field isValid: Whether or not the value is valid. Useful for highlighting the field in case it's invalid.
 */
export interface ValidityField {
    value: string
    isValid: boolean
}

/**
 * Generates a default ValidityField (blank string as value, isValid is true)
 */
export function generateDefaultValidityField(): ValidityField {
    return {
        value: '',
        isValid: true
    }
}
