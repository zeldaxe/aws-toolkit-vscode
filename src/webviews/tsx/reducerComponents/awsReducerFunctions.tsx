/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AwsComponentState,
    BackendAlteredFields,
    BackendToAwsComponentMessage,
    StatusFields,
    VsCode,
    VsCodeRetainedState
} from '../interfaces/common'

export interface BaseAction {
    type: string
}

/**
 * Handles initial state on webview reload
 */
interface SetExistingStateAction<Values> extends BaseAction {
    type: 'setExistingState'
    defaultState: AwsComponentState<Values>
    existingState: VsCodeRetainedState<Values> | undefined
}

/**
 * Handles messages posted from Node backend
 */
interface ReceiveIncomingMessageAction<Values> extends BaseAction {
    type: 'incomingMessage'
    message: BackendToAwsComponentMessage<Values>
}

/**
 * Updates values in state. Does not update any statuses
 */
interface UpdateValuesAction<Values> extends BaseAction {
    type: 'updateValues'
    values: Partial<Values>
}

interface SetStatusAction<Values> extends BaseAction {
    type: 'setStatus'
    set: keyof StatusFields<Values>
    field: keyof Values
}

interface RemoveStatusAction<Values> extends BaseAction {
    type: 'removeStatus'
    set: keyof StatusFields<Values>
    field: keyof Values
}

/**
 * Sends the state's full values to the backend along with a selected command
 */
interface SendCommandAction<Values, Commands> extends BaseAction {
    type: 'sendCommand'
    command: Commands
}

export type GenericActions<Values, Commands> =
    | UpdateValuesAction<Values>
    | SendCommandAction<Values, Commands>
    | ReceiveIncomingMessageAction<Values>
    | SetExistingStateAction<Values>
    | SetStatusAction<Values>
    | RemoveStatusAction<Values>

export function defaultMountEffect<Values, Commands>(
    dispatch: React.Dispatch<ReceiveIncomingMessageAction<Values> | SetExistingStateAction<Values>>,
    defaultState: AwsComponentState<Values>,
    vscode: VsCode<Values, Commands>
): () => void {
    // check for VS Code persisted state
    dispatch({
        type: 'setExistingState',
        existingState: vscode.getState(),
        defaultState
    })

    // check for incoming default values. If this uses `reactLoader.ts`, this should only happen when the webview is initially launched.
    window.addEventListener('message', event =>
        dispatch({
            type: 'incomingMessage',
            message: (event.data as any) as BackendToAwsComponentMessage<Values>
        })
    )

    return function cleanupEventListener() {
        window.removeEventListener('message', event =>
            dispatch({
                type: 'incomingMessage',
                message: (event.data as any) as BackendToAwsComponentMessage<Values>
            })
        )
    }
}

export function defaultReducer<Values, Commands>(
    prevState: AwsComponentState<Values>,
    action: GenericActions<Values, Commands>,
    vscode: VsCode<Values, Commands>
): AwsComponentState<Values> {
    // return previous state if action does not mutate state.
    let finalState: AwsComponentState<Values> = prevState

    switch (action.type) {
        // BEGIN COMPONENT STATE INTERACTION COMMANDS
        // handle updates to values (from UpdateValuesAction)
        case 'updateValues':
            finalState = {
                ...prevState,
                values: {
                    ...prevState.values,
                    ...action.values
                }
            }
            break
        // handles state updates (from SetStatusAction and RemoveStatusAction)
        case 'setStatus':
        case 'removeStatus':
            finalState = handleSetModification(action, prevState)
            break
        // sends an arbitrary command to Node backend, along with all values (from SendCommandAction)
        case 'sendCommand':
            vscode.postMessage({
                command: action.command,
                values: prevState.values
            })
            break

        // END USER COMPONENT STATE INTERACTION COMMANDS
        // BEGIN COMPONENT LIFECYCLE COMMANDS

        // handles an existing state from a restored session (via VS Code API, from SetExistingStateAction)
        case 'setExistingState':
            if (action.existingState) {
                finalState = {
                    statusFields: {
                        invalidFields: action.existingState.invalidFields
                            ? new Set<keyof Values>(action.existingState.invalidFields)
                            : action.defaultState.statusFields.invalidFields,
                        inactiveFields: action.existingState.inactiveFields
                            ? new Set<keyof Values>(action.existingState.inactiveFields)
                            : action.defaultState.statusFields.inactiveFields,
                        loadingFields: action.existingState.loadingFields
                            ? new Set<keyof Values>(action.existingState.loadingFields)
                            : action.defaultState.statusFields.loadingFields,
                        hiddenFields: action.existingState.hiddenFields
                            ? new Set<keyof Values>(action.existingState.hiddenFields)
                            : action.defaultState.statusFields.hiddenFields
                    },
                    values: {
                        ...action.defaultState.values,
                        ...action.existingState.values
                    },
                    messageQueue: action.existingState.messageQueue
                }
            } else {
                finalState = action.defaultState
            }
            break
        // handles incoming messages from Node backend (from ReceiveIncomingMessageAction)
        case 'incomingMessage':
            const updatedStatusFields: StatusFields<Values> = {
                inactiveFields: handleBackendAlteredFields(
                    prevState.statusFields.inactiveFields,
                    action.message.inactiveFields
                ),
                invalidFields: handleBackendAlteredFields(
                    prevState.statusFields.invalidFields,
                    action.message.invalidFields
                ),
                hiddenFields: handleBackendAlteredFields(
                    prevState.statusFields.hiddenFields,
                    action.message.hiddenFields
                ),
                loadingFields: handleBackendAlteredFields(
                    prevState.statusFields.loadingFields,
                    action.message.loadingFields
                )
            }
            finalState = {
                values: {
                    ...prevState.values,
                    ...action.message.values
                },
                statusFields: updatedStatusFields
            }
            break
        // this should never be hit; all cases should be covered
        default:
            break
    }

    return finalState
}

export function setState<Values, Commands>(
    dispatch: React.Dispatch<GenericActions<Values, Commands>>,
    key: keyof Values,
    value: any
) {
    dispatch({
        type: 'updateValues',
        values: ({
            [key]: value
        } as any) as Partial<Values>
    })
}

/**
 * Handles the BackendAlteredFields type, which contains changes to be made to the AWS Component's state
 * Added fields will always be added before computing removed fields.
 * @param set Name of set in state to handle
 * @param alteredFields BackendAlteredFields from message.
 */
function handleBackendAlteredFields<Values>(
    set: Set<keyof Values>,
    alteredFields: BackendAlteredFields<Values> | undefined
): Set<keyof Values> {
    if (alteredFields) {
        if (alteredFields.add) {
            for (const field of alteredFields.add) {
                set.add(field)
            }
        }
        if (alteredFields.remove) {
            for (const field of alteredFields.remove) {
                set.delete(field)
            }
        }
    }

    return set
}

function handleSetModification<Values>(
    action: SetStatusAction<Values> | RemoveStatusAction<Values>,
    prevState: AwsComponentState<Values>
): AwsComponentState<Values> {
    const modifiedSet = prevState.statusFields[action.set]
    action.type === 'setStatus' ? modifiedSet.add(action.field) : modifiedSet.delete(action.field)

    return {
        ...prevState,
        statusFields: {
            ...prevState.statusFields,
            [action.set]: modifiedSet
        }
    }
}
