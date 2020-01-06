/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import React = require('react')
import {
    AwsComponentState,
    BackendAlteredFields,
    BackendToAwsComponentMessage,
    VsCodeReactWebviewProp,
    VsCodeRetainedState
} from '../interfaces/common'

export abstract class AwsComponent<State> extends React.Component<
    VsCodeReactWebviewProp<State>,
    AwsComponentState<State>
> {
    public constructor(props: VsCodeReactWebviewProp<State>) {
        super(props)
        this.setExistingState(this.props.defaultState)
    }

    /**
     * Render TSX nodes here!
     */
    public abstract render(): JSX.Element

    /**
     * Sets up VS Code event listener. This should be called by React automatically
     */
    public componentDidMount(): void {
        // resetting the state with this.setState to ensure that the state is what we want
        // we know that this.setState works at this point considering the component is now mounted
        this.setState(this.state)
        window.addEventListener('message', event =>
            this.generateStateFromMessage((event.data as any) as BackendToAwsComponentMessage<State>)
        )
    }

    /**
     * Tears down VS Code event listener. This should be called by React automatically.
     */
    public componentWillUnmount(): void {
        window.removeEventListener('message', event =>
            this.generateStateFromMessage((event.data as any) as BackendToAwsComponentMessage<State>)
        )
    }

    /**
     * Wrapper function to set both React and VS Code state
     *
     * Sets React state (since it merges state when setting) and uses that as source of truth to set VS Code state with.
     *
     * **WARNING:** THIS IS NOT SYNCHRONOUS.
     * @param state State message to overwrite React state with
     * @param callback Callback function to run AFTER state has been set.
     */
    public setState(state: AwsComponentState<State>, callback?: () => void): void {
        super.setState(state, () => {
            this.props.vscode.setState({
                inactiveFields: Array.from(this.state.inactiveFields),
                invalidFields: Array.from(this.state.invalidFields),
                loadingFields: Array.from(this.state.loadingFields),
                hiddenFields: Array.from(this.state.hiddenFields),
                values: this.state.values
            })
            if (callback) {
                callback()
            }
        })
    }

    /**
     * Sets the previous state of the webview if it exists in vscode.getState().
     * This state exists if a user navigates away from the webview and back without closing it.
     * Otherwise, this sets the default state.
     * Note that this function does not handle a state that is messaged in as the event listener is not initialized.
     * @param defaultState Default webview state if no other states exist
     */
    protected setExistingState(defaultState: AwsComponentState<State>): void {
        const message = this.props.vscode.getState() as VsCodeRetainedState<State>
        // Writes directly to state because this is called before the component is mounted (so this.setState cannot be called)
        // We will update the state with this.setState(this.state) in the componentDidMount function
        if (message) {
            this.state = {
                invalidFields: message.invalidFields
                    ? new Set<keyof State>(message.invalidFields)
                    : defaultState.invalidFields,
                inactiveFields: message.inactiveFields
                    ? new Set<keyof State>(message.inactiveFields)
                    : defaultState.inactiveFields,
                loadingFields: message.loadingFields
                    ? new Set<keyof State>(message.loadingFields)
                    : defaultState.loadingFields,
                hiddenFields: message.hiddenFields
                    ? new Set<keyof State>(message.hiddenFields)
                    : defaultState.hiddenFields,
                values: {
                    ...defaultState.values,
                    ...message.values
                }
            }
        } else {
            this.state = defaultState
        }
    }

    /**
     * Typed setState call that also deep merges the top level state object.
     *
     * Any lower-level merges need to be done manually.
     *
     * TODO: Is this really typesafe? Will this really force that this is a key, and that the value is correctly-typed?
     *
     * **WARNING:** THIS IS NOT SYNCHRONOUS.
     * @param key Key to insert as
     * @param value Value to insert
     * @param callback Callback function to run AFTER state has been set.
     */
    protected setSingleValueInState<T>(key: string, value: T, callback?: () => void): void {
        const typesafeKey = key as keyof State
        this.setState(
            {
                ...this.state,
                values: {
                    ...this.state.values,
                    [typesafeKey]: value
                }
            },
            callback
        )
    }

    /**
     * Adds field to invalidFields set
     * @param field field to add
     */
    protected addInvalidField(field: keyof State): void {
        this.addFieldToSet('invalidFields', field)
    }

    /**
     * Removes field from invalidFields set
     * @param field field to remove
     */
    protected removeInvalidField(field: keyof State): void {
        this.removeFieldFromSet('invalidFields', field)
    }

    /**
     * Adds field to inactiveFields set
     * @param field field to add
     */
    protected addInactiveField(field: keyof State): void {
        this.addFieldToSet('inactiveFields', field)
    }

    /**
     * Removes field from inactiveFields set
     * @param field field to remove
     */
    protected removeInactiveField(field: keyof State): void {
        this.removeFieldFromSet('inactiveFields', field)
    }

    /**
     * Adds field to loadingFields set
     * @param field field to add
     */
    protected addLoadingField(field: keyof State): void {
        this.addFieldToSet('loadingFields', field)
    }

    /**
     * Removes field from loadingFields set
     * @param field field to remove
     */
    protected removeLoadingField(field: keyof State): void {
        this.removeFieldFromSet('loadingFields', field)
    }

    /**
     * Adds field to hiddenFields set
     * @param field field to add
     */
    protected addHiddenField(field: keyof State): void {
        this.addFieldToSet('hiddenFields', field)
    }

    /**
     * Removes field from hiddenFields set
     * @param field field to remove
     */
    protected removeHiddenField(field: keyof State): void {
        this.removeFieldFromSet('hiddenFields', field)
    }

    /**
     * Posts the entire state to the VS Code Node backend with the given command name
     * @param command Command name to send to VS Code
     */
    protected postMessageToVsCode(command: string): void {
        this.props.vscode.postMessage({
            values: this.state.values,
            command: command
        })
    }

    /**
     * Handles messaging from VS Code, either via posted message or by restoring state from VS Code
     * @param message Partial state to merge with current state
     */
    private generateStateFromMessage(message: BackendToAwsComponentMessage<State>): void {
        this.setState({
            ...this.state,
            values: {
                ...this.state.values,
                ...message.values
            }
        })
        if (message.loadingFields) {
            this.handleBackendAlteredFields('loadingFields', message.loadingFields)
        }
        if (message.invalidFields) {
            this.handleBackendAlteredFields('invalidFields', message.invalidFields)
        }
        if (message.inactiveFields) {
            this.handleBackendAlteredFields('inactiveFields', message.inactiveFields)
        }
    }

    private handleBackendAlteredFields(
        set: keyof AwsComponentState<State>,
        alteredFields: BackendAlteredFields<State>
    ) {
        if (alteredFields.add) {
            for (const field of alteredFields.add) {
                this.addFieldToSet(set, field)
            }
        }
        if (alteredFields.remove) {
            for (const field of alteredFields.remove) {
                this.removeFieldFromSet(set, field)
            }
        }
    }

    private addFieldToSet(set: keyof AwsComponentState<State>, field: keyof State) {
        const modifiedSet = this.state[set]
        if (!(modifiedSet instanceof Set)) {
            throw new Error(`React application is trying to add to non-set field: ${set}`)
        }
        modifiedSet.add(field)
        this.setState({
            ...this.state,
            [set]: modifiedSet
        })
    }

    private removeFieldFromSet(set: keyof AwsComponentState<State>, field: keyof State) {
        const modifiedSet = this.state[set]
        if (!(modifiedSet instanceof Set)) {
            throw new Error(`React application is trying to remove from non-set field: ${set}`)
        }
        modifiedSet.delete(field)
        this.setState({
            ...this.state,
            [set]: modifiedSet
        })
    }
}
