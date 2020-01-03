/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import React = require('react')
import { VsCodeReactWebviewProp } from '../interfaces/common'

export abstract class AwsComponent<Props extends VsCodeReactWebviewProp<State>, State> extends React.Component<
    Props,
    State
> {
    public constructor(props: Props) {
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
        window.addEventListener('message', event => this.mergeStateWithMessage((event.data as any) as State))
    }

    /**
     * Tears down VS Code event listener. This should be called by React automatically.
     */
    public componentWillUnmount(): void {
        window.removeEventListener('message', event => this.mergeStateWithMessage((event.data as any) as State))
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
    public setState(state: State, callback?: () => void): void {
        super.setState(state, () => {
            this.props.vscode.setState(this.state)
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
    protected setSingleState<T>(key: string, value: T, callback?: () => void): void {
        const typesafeKey = key as keyof State
        this.setState(
            {
                ...this.state,
                [typesafeKey]: value
            },
            callback
        )
    }

    /**
     * Posts the entire state to the VS Code Node backend with the given command name
     * @param command Command name to send to VS Code
     */
    protected postMessageToVsCode(command: string): void {
        this.props.vscode.postMessage({
            message: this.state,
            command: command
        })
    }

    /**
     * Handles messaging from VS Code
     * @param message Partial state to merge with current state
     */
    private mergeStateWithMessage(message: Partial<State>): void {
        this.setState({ ...this.state, ...message })
    }
}
