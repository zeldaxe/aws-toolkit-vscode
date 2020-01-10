/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { AwsComponent } from './components/awsComponent'
import { LambdaTemplateInput } from './components/lambdaTemplateInput'
// import { SelectDropDown } from './components/primitives/selectDropDown'
// import { TextArea } from './components/primitives/textArea'
import { AwsComponentState, VsCode } from './interfaces/common'
import { InvokerCommands, InvokerValues } from './interfaces/invoker'

declare const vscode: VsCode<InvokerValues, InvokerCommands>

function generateDefaultInvokerState(): AwsComponentState<InvokerValues> {
    return {
        values: {
            lambda: '',
            payload: '',
            region: '',
            template: '',
            availableTemplates: []
        },
        invalidFields: new Set<keyof InvokerValues>(),
        inactiveFields: new Set<keyof InvokerValues>(),
        loadingFields: new Set<keyof InvokerValues>(),
        hiddenFields: new Set<keyof InvokerValues>()
    }
}

export class Invoker extends AwsComponent<InvokerValues, InvokerCommands> {
    public render() {
        return (
            <div>
                <h1>
                    Calling Lambda function: {this.state.values.lambda} in Region: {this.state.values.region}
                </h1>
                <br />
                <LambdaTemplateInput
                    templateName="template"
                    jsonName="payload"
                    templateValue={this.state.values.template}
                    jsonValue={this.state.values.payload}
                    templateOptions={this.state.values.availableTemplates}
                    invalidJsonMessage="Payload is not valid JSON."
                    onSelectTemplate={() => this.onSelectTemplate()}
                    setState={(key: string, value: string, callback: () => void) =>
                        this.setSingleValueInState<string>(key, value, callback)
                    }
                    setInvalidField={(isInvalid: boolean) => this.setInvalidJsonField(isInvalid)}
                    checkInvalid={(field: keyof InvokerValues) => this.state.invalidFields.has(field)}
                    checkInactive={(field: keyof InvokerValues) => this.state.inactiveFields.has(field)}
                    checkLoading={(field: keyof InvokerValues) => this.state.loadingFields.has(field)}
                />
                <br />
                <button onClick={e => this.onSubmit(e)}>Submit!</button>
            </div>
        )
    }

    private setInvalidJsonField(isInvalid: boolean) {
        if (isInvalid) {
            this.addInvalidField('payload')
        } else {
            this.removeInvalidField('payload')
        }
    }

    private onSelectTemplate() {
        this.addInactiveField('template')
        this.addInactiveField('payload')
        this.addLoadingField('payload')
        this.postMessageToVsCode('sampleRequestSelected')
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
