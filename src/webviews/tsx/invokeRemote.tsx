/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { AwsComponent } from './components/awsComponent'
import { ValidityInput } from './components/primitives/validityInput'
import { ValidityTextArea } from './components/primitives/validityTextArea'
import { generateDefaultValidityField, ValidityField, VsCode, VsCodeReactWebviewProp } from './interfaces/common'
import { InvokerState } from './interfaces/invoker'

declare const vscode: VsCode<InvokerState>

function generateDefaultInvokerState(): InvokerState {
    return {
        lambda: generateDefaultValidityField(),
        payload: generateDefaultValidityField(),
        region: generateDefaultValidityField(),
        template: generateDefaultValidityField()
    }
}

export class Invoker extends AwsComponent<VsCodeReactWebviewProp<InvokerState>, InvokerState> {
    public render() {
        return (
            <div>
                <ValidityInput
                    name="region"
                    placeholder="region"
                    validityField={this.state.region}
                    setState={(key: string, value: ValidityField) => this.setSingleState<ValidityField>(key, value)}
                />
                <br />
                <ValidityInput
                    name="lambda"
                    placeholder="lambda"
                    validityField={this.state.lambda}
                    setState={(key: string, value: ValidityField) => this.setSingleState<ValidityField>(key, value)}
                />
                <br />
                <ValidityInput
                    name="template"
                    placeholder="template"
                    validityField={this.state.template}
                    setState={(key: string, value: ValidityField) => this.setSingleState<ValidityField>(key, value)}
                />
                <br />
                <ValidityTextArea
                    name="payload"
                    placeholder="JSON Payload"
                    validityField={this.state.payload}
                    setState={(key: string, value: ValidityField) => this.setSingleState<ValidityField>(key, value)}
                />
                <br />
                <button onClick={e => this.onSubmit(e)}>Submit!</button>
            </div>
        )
    }

    private onSubmit(event: React.MouseEvent) {
        try {
            // basic client-side validation test. We should probably offload something like this to the controller.
            JSON.parse(this.state.payload.value)
            this.props.vscode.postMessage(this.state)
        } catch (e) {}
    }
}

ReactDOM.render(
    <Invoker vscode={vscode} defaultState={generateDefaultInvokerState()} />,
    document.getElementById('reactApp')
)
