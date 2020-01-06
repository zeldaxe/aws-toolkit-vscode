/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { AwsComponent } from './components/awsComponent'
import { SelectDropDown } from './components/primitives/selectDropDown'
import { TextArea } from './components/primitives/textArea'
import { AwsComponentState, VsCode } from './interfaces/common'
import { InvokerState } from './interfaces/invoker'

declare const vscode: VsCode<InvokerState>

function generateDefaultInvokerState(): AwsComponentState<InvokerState> {
    return {
        values: {
            lambda: '',
            payload: '',
            region: '',
            template: '',
            availableTemplates: []
        },
        invalidFields: new Set<keyof InvokerState>(),
        inactiveFields: new Set<keyof InvokerState>(),
        loadingFields: new Set<keyof InvokerState>(),
        hiddenFields: new Set<keyof InvokerState>()
    }
}

export class Invoker extends AwsComponent<InvokerState> {
    public render() {
        return (
            <div>
                <h1>
                    Calling Lambda function: {this.state.values.lambda} in Region: {this.state.values.region}
                </h1>
                <br />
                <h3>Enter a JSON payload (or select a template from the list below)</h3>
                <SelectDropDown
                    name="template"
                    options={this.state.values.availableTemplates}
                    value={this.state.values.template}
                    setState={(key: string, value: string, callback: () => void) =>
                        this.setSingleValueInState<string>(key, value, callback)
                    }
                    onSelectAction={() => this.postMessageToVsCode('sampleRequestSelected')}
                    placeholder="Templates"
                />
                <br />
                <h3>JSON Payload</h3>
                <TextArea
                    name="payload"
                    placeholder="JSON Payload"
                    value={this.state.values.payload}
                    setState={(key: string, value: string) => this.setSingleValueInState<string>(key, value)}
                    isInvalid={this.state.invalidFields.has('payload')}
                    rows={20}
                    cols={75}
                />
                <br />
                <button onClick={e => this.onSubmit(e)}>Submit!</button>
            </div>
        )
    }

    private onSubmit(event: React.MouseEvent) {
        try {
            // basic client-side validation test. We should probably offload something like this to the controller.
            JSON.parse(this.state.values.payload)
            this.removeInvalidField('payload')
            this.setSingleValueInState('payload', this.state.values.payload, () =>
                this.postMessageToVsCode('invokeLambda')
            )
        } catch (e) {
            this.addInvalidField('payload')
        }
    }
}

ReactDOM.render(
    <Invoker vscode={vscode} defaultState={generateDefaultInvokerState()} />,
    document.getElementById('reactApp')
)
