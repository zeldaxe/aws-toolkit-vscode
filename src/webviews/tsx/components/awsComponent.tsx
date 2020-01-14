/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import React = require('react')
import {
    AwsComponentProps,
    AwsComponentState,
    BackendAlteredFields,
    BackendToAwsComponentMessage,
    StatusFields,
    VsCodeRetainedState
} from '../interfaces/common'

/**
 * Generic top-level class for AWS React Components
 * This class offers the following functionality:
 * * Typesafe React state handling and handling of VS Code Webview API functions
 *   * Includes support for VS Code get/setState for persisting a webview if it loses focus
 * * Typesafe parent state setters for child components
 * * General field state handling: can mark fields tied to values as: hidden, inactive, invalid, loading
 *   * (child components need to implement how the states are displayed; this just handles coordination)
 *
 * @type Values: A list of values that will be reflected in the AWS Component's state
 */
export abstract class AwsComponent<Values, Commands> extends React.Component<
    AwsComponentProps<Values, Commands>,
    AwsComponentState<Values>
> {
    public constructor(props: AwsComponentProps<Values, Commands>) {
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
            this.generateStateFromMessage((event.data as any) as BackendToAwsComponentMessage<Values>)
        )
    }

    /**
     * Tears down VS Code event listener. This should be called by React automatically.
     */
    public componentWillUnmount(): void {
        window.removeEventListener('message', event =>
            this.generateStateFromMessage((event.data as any) as BackendToAwsComponentMessage<Values>)
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
    public setState(state: AwsComponentState<Values>, callback?: () => void): void {
        super.setState(state, () => {
            this.props.vscode.setState({
                inactiveFields: Array.from(this.state.statusFields.inactiveFields),
                invalidFields: Array.from(this.state.statusFields.invalidFields),
                loadingFields: Array.from(this.state.statusFields.loadingFields),
                hiddenFields: Array.from(this.state.statusFields.hiddenFields),
                values: this.state.values
            })
            if (callback) {
                callback()
            }
        })
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
    protected setSingleValueInState<T>(key: keyof Values, value: T, callback?: () => void): void {
        const typesafeKey = key as keyof Values
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
     * Posts all of the state's values to the VS Code Node backend with a given command name for backend handling.
     * Does not provide any validity fields; backend logic should be able to handle everything that is passed to parent.
     * @param command Command name to send to VS Code
     */
    protected postMessageToVsCode(command: Commands): void {
        this.props.vscode.postMessage({
            values: this.state.values,
            command: command
        })
    }

    /**
     * Handles messaging from VS Code, either via posted message or by restoring state from VS Code.
     * Can be overwritten; it is *HIGHLY* recommended to call `super.generateStateFromMessage(message)` for state handling.
     * @param message Partial state to merge with current state
     */
    protected generateStateFromMessage(message: BackendToAwsComponentMessage<Values>): void {
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
        if (message.hiddenFields) {
            this.handleBackendAlteredFields('hiddenFields', message.hiddenFields)
        }
    }

    /**
     * Returns a boolean based on whether or not a field is in a defined set.
     * @param set Set to check
     * @param field Field name to check
     */
    protected checkFieldInSet(set: keyof StatusFields<Values>, field: keyof Values): boolean {
        return this.state.statusFields[set].has(field)
    }

    /**
     * Adds a field to a state's status set.
     * This will mark the field as a part of the set (e.g. marking a field as an invalid field)
     * @param set Set to add to
     * @param field Field to add to set
     * @throws if specified set is not a Set
     */
    protected addFieldToSet(set: keyof StatusFields<Values>, field: keyof Values): void {
        const modifiedSet = this.state.statusFields[set]
        modifiedSet.add(field)
        this.setState({
            ...this.state,
            [set]: modifiedSet
        })
    }

    /**
     * Removes a field from a state's status set.
     * This will unmark the field as a part of the set (e.g. marking a field as valid)
     * @param set Set to remove from
     * @param field Field to remove from set
     * @throws if specified set is not a Set
     */
    protected removeFieldFromSet(set: keyof StatusFields<Values>, field: keyof Values): void {
        const modifiedSet = this.state.statusFields[set]
        modifiedSet.delete(field)
        this.setState({
            ...this.state,
            [set]: modifiedSet
        })
    }

    /**
     * Creates stateInteractors for SubComponentProps.
     */
    protected createStateInteractors() {
        return {
            getStatusFromSet: (set: keyof StatusFields<Values>, field: keyof Values) =>
                this.checkFieldInSet(set, field),
            postMessageToVsCode: (command: Commands) => this.postMessageToVsCode(command),
            removeStatusFromSet: (set: keyof StatusFields<Values>, value: keyof Values) =>
                this.removeFieldFromSet(set, value),
            setSingleState: (key: keyof Values, value: string, callback: () => void) =>
                this.setSingleValueInState(key, value, callback),
            setStatusInSet: (set: keyof StatusFields<Values>, value: keyof Values) => this.addFieldToSet(set, value)
        }
    }

    /**
     * Handles the BackendAlteredFields type, which contains changes to be made to the AWS Component's state
     * Added fields will always be added before computing removed fields.
     * @param set Name of set in state to handle
     * @param alteredFields BackendAlteredFields from message.
     */
    private handleBackendAlteredFields(
        set: keyof StatusFields<Values>,
        alteredFields: BackendAlteredFields<Values>
    ): void {
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

    /**
     * Sets the previous state of the webview if it exists in vscode.getState().
     * This state exists if a user navigates away from the webview and back without closing it.
     * Otherwise, this sets the default state.
     * Note that this function does not handle a state that is messaged in as the event listener is not initialized.
     * @param defaultState Default webview state if no other states exist
     */
    private setExistingState(defaultState: AwsComponentState<Values>): void {
        const message = this.props.vscode.getState() as VsCodeRetainedState<Values>
        // Writes directly to state because this is called before the component is mounted (so this.setState cannot be called)
        // We will update the state with this.setState(this.state) in the componentDidMount function
        if (message) {
            this.state = {
                statusFields: {
                    invalidFields: message.invalidFields
                        ? new Set<keyof Values>(message.invalidFields)
                        : defaultState.statusFields.invalidFields,
                    inactiveFields: message.inactiveFields
                        ? new Set<keyof Values>(message.inactiveFields)
                        : defaultState.statusFields.inactiveFields,
                    loadingFields: message.loadingFields
                        ? new Set<keyof Values>(message.loadingFields)
                        : defaultState.statusFields.loadingFields,
                    hiddenFields: message.hiddenFields
                        ? new Set<keyof Values>(message.hiddenFields)
                        : defaultState.statusFields.hiddenFields
                },
                values: {
                    ...defaultState.values,
                    ...message.values
                }
            }
        } else {
            this.state = defaultState
        }
    }
}
