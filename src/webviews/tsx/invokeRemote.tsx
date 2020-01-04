/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { AwsComponent } from './components/awsComponent'
import { SelectDropDown } from './components/primitives/selectDropDown'
import { ValidityInput } from './components/primitives/validityInput'
import { AwsComponentState, generateDefaultValidityField, ValidityField, VsCode } from './interfaces/common'
import { InvokerState } from './interfaces/invoker'

declare const vscode: VsCode<InvokerState>

function generateDefaultInvokerState(): AwsComponentState<InvokerState> {
    return {
        values: {
            lambda: '',
            payload: generateDefaultValidityField(),
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
                <SelectDropDown
                    name="template"
                    options={this.state.values.availableTemplates}
                    value={this.state.values.template}
                    setState={(key: string, value: string, callback: () => void) =>
                        this.setSingleValueInState<string>(key, value, callback)
                    }
                    onSelectAction={() => this.postMessageToVsCode('sampleRequestSelected')}
                />
                <br />
                <ValidityInput
                    name="payload"
                    placeholder="JSON Payload"
                    validityField={this.state.values.payload}
                    setState={(key: string, value: ValidityField) =>
                        this.setSingleValueInState<ValidityField>(key, value)
                    }
                    isTextArea={true}
                />
                <br />
                <button onClick={e => this.onSubmit(e)}>Submit!</button>
            </div>
        )
    }

    private onSubmit(event: React.MouseEvent) {
        try {
            // basic client-side validation test. We should probably offload something like this to the controller.
            JSON.parse(this.state.values.payload.value)
            this.setSingleValueInState('payload', { ...this.state.values.payload, isValid: true }, () =>
                this.postMessageToVsCode('invokeLambda')
            )
        } catch (e) {
            this.setSingleValueInState('payload', { ...this.state.values.payload, isValid: false })
        }
    }
}

ReactDOM.render(
    <Invoker vscode={vscode} defaultState={generateDefaultInvokerState()} />,
    document.getElementById('reactApp')
)
