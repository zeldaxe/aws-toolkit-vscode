/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { AwsComponent } from './components/awsComponent'
import { generateDefaultValidityField, VsCode, VsCodeReactWebviewProp } from './interfaces/common'
import { InvokerState } from './interfaces/invoker'

declare const vscode: VsCode<InvokerState>

function generateDefaultInvokerState(): InvokerState {
    return {
        validityFields: {
            lambda: generateDefaultValidityField(),
            payload: generateDefaultValidityField(),
            region: generateDefaultValidityField(),
            template: generateDefaultValidityField()
        },
        booleans: {},
        strings: {}
    }
}

export class Invoker extends AwsComponent<VsCodeReactWebviewProp<InvokerState>, InvokerState> {
    public render() {
        return (
            <div>
                <input
                    name="region"
                    placeholder="region"
                    value={this.state.validityFields.region.value}
                    onChange={e => this.onValidityFieldChange(e)}
                    className={`${this.state.validityFields.region.isValid ? '' : 'invalid'}`}
                />
                <br />
                <input
                    name="lambda"
                    placeholder="lambda"
                    value={this.state.validityFields.lambda.value}
                    onChange={e => this.onValidityFieldChange(e)}
                    className={`${this.state.validityFields.lambda.isValid ? '' : 'invalid'}`}
                />
                <br />
                <input
                    name="template"
                    placeholder="template"
                    value={this.state.validityFields.template.value}
                    onChange={e => this.onValidityFieldChange(e)}
                    className={`${this.state.validityFields.template.isValid ? '' : 'invalid'}`}
                />
                <br />
                <textarea
                    name="payload"
                    placeholder="JSON Payload"
                    value={this.state.validityFields.payload.value}
                    onChange={e => this.onValidityFieldChange(e)}
                    className={`${this.state.validityFields.payload.isValid ? '' : 'invalid'}`}
                />
                <br />
                <button onClick={e => this.onSubmit(e)}>Submit!</button>
            </div>
        )
    }

    private onSubmit(event: React.MouseEvent) {
        try {
            JSON.parse(this.state.validityFields.payload.value)
            this.props.vscode.postMessage(this.state)
        } catch (e) {}
    }
}

ReactDOM.render(
    <Invoker vscode={vscode} defaultState={generateDefaultInvokerState()} />,
    document.getElementById('reactApp')
)
