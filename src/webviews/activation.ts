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
                onDidReceiveMessageFunction: async (message, postMessage) => {
                    vscode.window.showInformationMessage(message.payload.value)
                    vscode.window.showInformationMessage('posting message!')
                    const result = await postMessage({
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
                },
                onDidDisposeFunction: () => {
                    vscode.window.showInformationMessage("That's all, folks!")
                },
                context
            }),
        telemetryName: {
            namespace: TelemetryNamespace.Aws,
            name: 'reactInvoker'
        }
    })
}
