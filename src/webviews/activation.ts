/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TelemetryNamespace } from '../shared/telemetry/telemetryTypes'
import { registerCommand } from '../shared/telemetry/telemetryUtils'
import { createReactWebview } from './reactLoader'
import { InvokerState } from './tsx/interfaces/invokerInterfaces'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // invoker
    registerCommand({
        command: 'aws.reactInvoker',
        callback: async () =>
            await createReactWebview<InvokerState>({
                id: 'invoke',
                name: 'Sample Invoker!',
                webviewJs: 'invokeRemote.js',
                onDidReceiveMessageFunction: async (message, postMessageFn) => myMessageHandler(message, postMessageFn),
                onDidDisposeFunction: myDisposal,
                context,
                initialState: {
                    region: {
                        value: 'us-weast-1',
                        isValid: true
                    },
                    lambda: {
                        value: '',
                        isValid: true
                    },
                    payload: {
                        value: '{"whoop": "there it is"}',
                        isValid: false
                    },
                    template: {
                        value: "not your mama's template",
                        isValid: true
                    }
                }
            }),
        telemetryName: {
            namespace: TelemetryNamespace.Aws,
            name: 'reactInvoker'
        }
    })
}

async function myMessageHandler(message: InvokerState, postMessageFn: (event: InvokerState) => Thenable<boolean>) {
    vscode.window.showInformationMessage(message.payload.value)
    vscode.window.showInformationMessage('posting message!')
    const result = await postMessageFn({
        region: {
            value: 'modified region!',
            isValid: true
        },
        lambda: {
            value: 'modified lambda!',
            isValid: true
        },
        payload: {
            value: 'modified payload!',
            isValid: false
        },
        template: {
            value: 'modified template!',
            isValid: true
        }
    })
    vscode.window.showInformationMessage(`Posted message!: ${result.toString()}`)
}

function myDisposal() {
    vscode.window.showInformationMessage("That's all, folks!")
}
