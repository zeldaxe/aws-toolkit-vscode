/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VsCode<State> {
    postMessage(state: State): void
    setState(state: State): void
    getState(): State
}

export interface VsCodeReactWebviewProp<State> {
    vscode: VsCode<State>
    defaultState: State
}

export interface VsCodeReactWebviewState {
    validityFields: {
        [fieldName: string]: ValidityField
    }
    booleans: {
        [fieldName: string]: boolean
    }
    strings: {
        [fieldName: string]: string
    }
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
