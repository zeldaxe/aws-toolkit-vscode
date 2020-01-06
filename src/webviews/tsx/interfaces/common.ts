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
export interface VsCode<Values> {
    postMessage(output: AwsComponentToBackendMessage<Values>): void
    setState(state: BackendToAwsComponentMessage<Values>): void
    getState(): BackendToAwsComponentMessage<Values>
}

export interface AwsComponentState<Values> {
    values: Values
    invalidFields: Set<keyof Values>
    inactiveFields: Set<keyof Values>
    loadingFields: Set<keyof Values>
    hiddenFields: Set<keyof Values>
}

export interface AwsComponentToBackendMessage<Values> {
    values: Values
    command: string
}

export interface BackendToAwsComponentMessage<Values> {
    values: Partial<Values>
    invalidFields?: Array<keyof Values>
    inactiveFields?: Array<keyof Values>
    loadingFields?: Array<keyof Values>
    hiddenFields?: Array<keyof Values>
}

/**
 * Base props for the top level object.
 * Enforces state and grants access to the VS Code functions
 */
export interface VsCodeReactWebviewProp<Values> {
    vscode: VsCode<Values>
    defaultState: AwsComponentState<Values>
}

export interface SelectOption {
    displayName: string
    value: string
}
