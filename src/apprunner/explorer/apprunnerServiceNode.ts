/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AppRunnerClient } from '../../shared/clients/apprunnerClient'
import AppRunner = require('../models/apprunner')
import { AppRunnerNode } from './apprunnerNode'
import * as nls from 'vscode-nls'
import { LogGroupNode } from '../../cloudWatchLogs/explorer/logGroupNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
const localize = nls.loadMessageBundle()

const AUTO_REFRESH_INTERVAL = 1000

const OPERATION_STATUS: { [key: string]: string } = {
    START_DEPLOYMENT: localize('AWS.apprunner.operationStatus.deploy', 'Deploying...'),
    CREATE_SERVICE: localize('AWS.apprunner.operationStatus.create', 'Creating...'),
    PAUSE_SERVICE: localize('AWS.apprunner.operationStatus.pause', 'Pausing...'),
    RESUME_SERVICE: localize('AWS.apprunner.operationStatus.resume', 'Resuming...'),
}

export class AppRunnerServiceNode extends AWSTreeNodeBase {
    private refreshTimer: NodeJS.Timeout | undefined
    private logNodes: Map<string, LogGroupNode>

    constructor(
        public readonly parent: AppRunnerNode,
        private readonly client: AppRunnerClient,
        private info: AppRunner.Service,
        private currentOperation: AppRunner.Operation = {}
    ) {
        super('App Runner Service', vscode.TreeItemCollapsibleState.Collapsed)
        this.logNodes = new Map<string, LogGroupNode>()
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.apprunner),
            light: vscode.Uri.file(ext.iconPaths.light.apprunner),
        }
        this.update(info)
    }

    // Service node will have application + service logs as children
    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                // Probably not worth it to keep trying to update the service nodes
                // await this.updateChildren()
                if (this.logNodes.size === 0) {
                    await this.createLogNodes(this.info.ServiceName)
                }

                return [...this.logNodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.apprunner.nologs', '[No App Runner logs found]')),
            sort: (nodeA: AppRunnerServiceNode, nodeB: AppRunnerServiceNode) =>
                nodeA.label!.localeCompare(nodeB.label!),
        })
    }

    private setLabel(): void {
        const displayStatus = this.currentOperation.Type
            ? OPERATION_STATUS[this.currentOperation.Type]
            : this.info.Status.charAt(0) + this.info.Status.slice(1).toLowerCase().replace(/\_/g, ' ')
        this.label = `${this.info.ServiceName} [${displayStatus}]`
    }

    public update(info: AppRunner.ServiceSummary | AppRunner.Service): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
        }

        this.info = Object.assign(this.info, info)
        this.contextValue = `awsAppRunnerServiceNode.${this.info.Status}`
        this.setLabel()

        this.refresh()

        if (this.currentOperation.Id) {
            this.refreshTimer = setTimeout(async () => {
                this.currentOperation = this.info.Status === 'OPERATION_IN_PROGRESS' ? this.currentOperation : {}
                this.update(
                    (await this.client.describeService({ ServiceArn: this.info.ServiceArn })).DescribeServiceResult
                        .Service
                )
            }, AUTO_REFRESH_INTERVAL)
        }
    }

    public async pause(): Promise<void> {
        const resp = await this.client.pauseService({ ServiceArn: this.info.ServiceArn })
        this.currentOperation.Id = resp.PauseServiceResult.OperationId
        this.currentOperation.Type = 'PAUSE_SERVICE'
        this.update(resp.PauseServiceResult.Service)
    }

    public async resume(): Promise<void> {
        const resp = await this.client.resumeService({ ServiceArn: this.info.ServiceArn })
        this.currentOperation.Id = resp.ResumeServiceResult.OperationId
        this.currentOperation.Type = 'RESUME_SERVICE'
        this.update(resp.ResumeServiceResult.Service)
    }

    public getUrl(): string {
        return this.info.ServiceUrl
    }

    public async deploy(): Promise<void> {
        const resp = await this.client.startDeployment({ ServiceArn: this.info.ServiceArn })
        this.currentOperation.Id = resp.StartDeploymentResult.OperationId
        this.currentOperation.Type = 'START_DEPLOYMENT'
        this.update({})
    }

    public async delete(): Promise<void> {
        try {
            const resp = await this.client.deleteService({ ServiceArn: this.info.ServiceArn })
            this.currentOperation.Id = resp.DeleteServiceResult.OperationId
        } catch (e) {
            console.log(e)
        }
        this.update({})
        // Node will disappear after 2 seconds
        setTimeout(() => this.parent.refresh(), 2000)
    }

    // Generates two log nodes per service node
    private async createLogNodes(name: string): Promise<void> {
        const cloudWatchClient: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient('us-east-1')
        const logs = await toArrayAsync(
            cloudWatchClient.describeLogGroups({ logGroupNamePrefix: `/aws/apprunner/${name}/` })
        )

        logs.forEach(log => {
            this.logNodes.set(log.arn!, new LogGroupNode(this, 'us-east-1', log))
        })
    }
}
