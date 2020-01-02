/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TelemetryNamespace } from '../shared/telemetry/telemetryTypes'
import { registerCommand } from '../shared/telemetry/telemetryUtils'
import { createReactWebview } from './reactLoader'
import { WebviewOutputMessage } from './tsx/interfaces/common'
import { InvokerState } from './tsx/interfaces/invoker'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // invoker
    registerCommand({
        command: 'aws.reactInvoker',
        callback: async () =>
            await createReactWebview<InvokerState, {}>({
                id: 'invoke',
                name: 'Sample Invoker!',
                webviewJs: 'invokeRemote.js',
                onDidReceiveMessageFunction: async (message, postMessageFn) => myMessageHandler(message, postMessageFn),
                onDidDisposeFunction: myDisposal,
                context,
                initialState: {
                    region: 'us-east-1',
                    lambda: 'function',
                    payload: {
                        value: '{"whoop": "there it is"}',
                        isValid: true
                    },
                    template: '',
                    availableTemplates: []
                }
            }),
        telemetryName: {
            namespace: TelemetryNamespace.Aws,
            name: 'reactInvoker'
        }
    })
}

async function myMessageHandler(
    output: WebviewOutputMessage<InvokerState>,
    postMessageFn: (event: Partial<InvokerState>) => Thenable<boolean>
) {
    if (output.message.template === 'hi!') {
        await postMessageFn({
            region: 'us-east-1',
            lambda: 'function',
            payload: {
                value: 'modified payload!',
                isValid: true
            },
            template: 'Hi!'
        })
    } else {
        await postMessageFn({
            region: 'us-east-1',
            lambda: 'function',
            payload: {
                value: 'modified payload!',
                isValid: true
            },
            template: 'it is polite to say hi...'
        })
    }
}

function myDisposal() {
    vscode.window.showInformationMessage("That's all, folks!")
}
