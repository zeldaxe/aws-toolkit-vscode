/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import React = require('react')
import { ValidityField, VsCodeReactWebviewProp, VsCodeReactWebviewState } from '../interfaces/common'

export abstract class AwsComponent<
    Props extends VsCodeReactWebviewProp<State>,
    State extends VsCodeReactWebviewState
> extends React.Component<Props, State> {
    public constructor(props: Props) {
        super(props)
        this.setExistingState(this.props.defaultState)
    }

    /**
     * Render TSX nodes here!
     */
    public abstract render(): JSX.Element

    public componentDidMount() {
        // resetting the state with this.setState to ensure that the state is what we want
        // we know that this.setState works at this point considering the component is now mounted
        this.setState(this.state)
        window.addEventListener('message', event => this.overwriteStateWithMessage((event.data as any) as State))
    }

    public componentWillUnmount() {
        window.removeEventListener('message', event => this.overwriteStateWithMessage((event.data as any) as State))
    }

    /**
     * Wrapper function to set both React and VS Code state
     * Sets React state (since it merges state when setting) and uses that as source of truth to set VS Code state with.
     * @param message State message to overwrite React state with
     */
    public setState(message: State) {
        super.setState(message)
        this.props.vscode.setState(this.state)
    }

    /**
     * Sets the previous state of the webview if it exists in vscode.getState().
     * This state exists if a user navigates away from the webview and back without closing it.
     * Otherwise, this sets the default state.
     * @param defaultState Default webview state if no other states exist
     */
    protected setExistingState(defaultState: State): void {
        const existingState = this.props.vscode.getState() as State
        // Writes directly to state because this is called before the component is mounted (so this.setState cannot be called)
        // We will update the state with this.setState(this.state) in the componentDidMount function
        if (existingState) {
            this.state = existingState
        } else {
            this.state = defaultState
        }
    }

    /**
     * Used when changing a validity field; does not change the current validity state while changing the text.
     * @param event React change event, details the target object
     */
    protected onValidityFieldChange(event: React.ChangeEvent) {
        // enforce that the element has value and name fields
        const target = event.target as HTMLInputElement
        // enforce that the name is a key
        const name = target.name as keyof State['validityFields']
        // get whole state so we can preserve the isValid status
        const stateForName: ValidityField = this.state.validityFields[name]
        stateForName.value = target.value
        this.setState(({
            validityFields: {
                ...this.state.validityFields,
                [name]: stateForName
            }
        } as any) as Pick<State, keyof State>)
    }

    /**
     * Used when changing a boolean. Currently only works for checkboxes
     * TODO: Let this handle additional inputs
     * @param event React change event, details the target object
     */
    protected onBooleanChange(event: React.ChangeEvent) {
        // enforce that the element has value and name fields
        const target = event.target as HTMLInputElement
        // enforce that the name is a key
        const name = target.name as keyof State['booleans']
        const value = target.checked
        this.setState(({
            booleans: {
                ...this.state.booleans,
                [name]: value
            }
        } as any) as Pick<State, keyof State>)
    }

    /**
     * Used when changing a string. Does not handle validityField objects, and will not signal validity
     * @param event React change event, details the target object
     */
    protected onStringChange(event: React.ChangeEvent) {
        // enforce that the element has value and name fields
        const target = event.target as HTMLInputElement
        // enforce that the name is a key
        const name = target.name as keyof State['strings']
        const value = target.value
        this.setState(({
            strings: {
                ...this.state.strings,
                [name]: value
            }
        } as any) as Pick<State, keyof State>)
    }

    /**
     * Handles messaging from VS Code
     * @param message State message to overwrite React state with
     */
    private overwriteStateWithMessage(message: State) {
        this.setState(message)
    }
}
