/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { InvokerField, InvokerProps, InvokerState } from '../interfaces/invokerInterfaces'

const defaultInvokerState: InvokerState = {
    lambda: {
        isValid: true,
        value: ''
    },
    payload: {
        isValid: true,
        value: ''
    },
    region: {
        isValid: true,
        value: ''
    },
    template: {
        isValid: true,
        value: ''
    }
}

export class Invoker extends React.Component<InvokerProps, InvokerState> {
    public constructor(props: InvokerProps) {
        super(props)

        const existingState = this.props.vscode.getState() as InvokerState
        if (existingState) {
            this.state = existingState
        } else {
            this.state = defaultInvokerState
        }
    }

    public render() {
        return (
            <div>
                <input
                    name="region"
                    placeholder="region"
                    value={this.state.region.value}
                    onChange={e => this.onChange(e)}
                    className={`${this.state.region.isValid ? '' : 'invalid'}`}
                />
                <br />
                <input
                    name="lambda"
                    placeholder="lambda"
                    value={this.state.lambda.value}
                    onChange={e => this.onChange(e)}
                    className={`${this.state.lambda.isValid ? '' : 'invalid'}`}
                />
                <br />
                <input
                    name="template"
                    placeholder="template"
                    value={this.state.template.value}
                    onChange={e => this.onChange(e)}
                    className={`${this.state.template.isValid ? '' : 'invalid'}`}
                />
                <br />
                <textarea
                    name="payload"
                    placeholder="JSON Payload"
                    value={this.state.payload.value}
                    onChange={e => this.onChange(e)}
                    className={`${this.state.payload.isValid ? '' : 'invalid'}`}
                />
                <br />
                <button onClick={e => this.onSubmit(e)}>Submit!</button>
            </div>
        )
    }

    private onChange(event: React.ChangeEvent) {
        // enforce that the element has value and name fields
        const target = event.target as HTMLInputElement
        // enforce that the name is a key
        const name = target.name as keyof InvokerState
        const stateForName: InvokerField = this.state[name]
        stateForName.value = target.value
        this.setState(({
            [name]: stateForName
        } as any) as Pick<InvokerState, keyof InvokerState>)
        this.props.vscode.setState(this.state)
    }

    private onSubmit(event: React.MouseEvent) {
        try {
            JSON.parse(this.state.payload.value)
            this.props.vscode.postMessage(this.state)
        } catch (e) {}
    }
}
