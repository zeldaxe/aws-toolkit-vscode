/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createAppRunnerService } from './commands/createApprunnerService'
import { AppRunnerNode } from './explorer/apprunnerNode'
import { AppRunnerServiceNode } from './explorer/apprunnerServiceNode'
import { makeApprunnerConnectionWizard } from './wizards/apprunnerCreateConnectionWizard'

/**
 * Activates the service formely known as Fusion
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.apprunner.createService', (node: AppRunnerNode) => {
            try {
            node.createService()
            } catch(e) {
                console.log(e)
            }
        }),
        vscode.commands.registerCommand('aws.apprunner.pauseService', (node: AppRunnerServiceNode) => node.pause()),
        vscode.commands.registerCommand('aws.apprunner.resumeService', (node: AppRunnerServiceNode) => node.resume()),
        vscode.commands.registerCommand('aws.apprunner.copyServiceUrl', (node: AppRunnerServiceNode) =>
            vscode.env.clipboard.writeText(node.getUrl())
        ),
        vscode.commands.registerCommand('aws.apprunner.startDeployment', (node: AppRunnerServiceNode) => node.deploy()),
        vscode.commands.registerCommand('aws.apprunner.deleteService', (node: AppRunnerServiceNode) => node.delete())
    )
}
