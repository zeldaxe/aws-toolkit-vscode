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
import { AwsComponentState, StatusFields, VsCode } from './interfaces/common'
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
        statusFields: {
            invalidFields: new Set<keyof InvokerValues>(),
            inactiveFields: new Set<keyof InvokerValues>(),
            loadingFields: new Set<keyof InvokerValues>(),
            hiddenFields: new Set<keyof InvokerValues>()
        }
    }
}

export class Invoker extends AwsComponent<InvokerValues, InvokerCommands> {
    public render() {
        const y = 'hiddenFields'
        const x = this.state.statusFields[y]
        console.log(x)

        return (
            <div>
                <h1>
                    Calling Lambda function: {this.state.values.lambda} in Region: {this.state.values.region}
                </h1>
                <br />
                <LambdaTemplateInput<InvokerValues>
                    templateName="template"
                    jsonName="payload"
                    templateValue={this.state.values.template}
                    jsonValue={this.state.values.payload}
                    templateOptions={this.state.values.availableTemplates}
                    invalidJsonMessage="Payload is not valid JSON."
                    // move to LambdaTemplateInput, param = command name
                    onSelectTemplate={() => this.onSelectTemplate()}
                    stateInteractors={{
                        setSingleState: (key: keyof InvokerValues, value: string, callback: () => void) =>
                            this.setSingleValueInState(key, value, callback),
                        setStatusInSet: (set: keyof StatusFields<InvokerValues>, value: keyof InvokerValues) =>
                            this.addFieldToSet(set, value),
                        removeStatusFromSet: (set: keyof StatusFields<InvokerValues>, value: keyof InvokerValues) =>
                            this.removeFieldFromSet(set, value),
                        getStatusFromSet: (set: keyof StatusFields<InvokerValues>, field: keyof InvokerValues) =>
                            this.checkFieldInSet(set, field)
                    }}
                />
                <br />
                <button onClick={e => this.onSubmit(e)}>Submit!</button>
            </div>
        )
    }

    // private setInvalidJsonField(isInvalid: boolean) {
    //     if (isInvalid) {
    //         this.addInvalidField('payload')
    //     } else {
    //         this.removeInvalidField('payload')
    //     }
    // }

    private onSelectTemplate() {
        this.addInactiveField('template')
        this.addInactiveField('payload')
        this.addLoadingField('payload')
        this.postMessageToVsCode('sampleRequestSelected')
    }

    // create button primitive that returns the command to post?
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
