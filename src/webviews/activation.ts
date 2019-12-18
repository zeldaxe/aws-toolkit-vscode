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
                onDidReceiveMessageFunction: message => {
                    vscode.window.showInformationMessage(message.payload.value)
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
