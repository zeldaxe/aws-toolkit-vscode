/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AppRunnerClient } from '../../shared/clients/apprunnerClient'
import * as AppRunner from '../models/apprunner'
import { AppRunnerNode } from './apprunnerNode'
import * as nls from 'vscode-nls'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'
import { toArrayAsync, toMap } from '../../shared/utilities/collectionUtils'
import { CloudWatchLogsParentNode } from '../../cloudWatchLogs/explorer/cloudWatchLogsNode'
import { CloudWatchLogs } from 'aws-sdk'
const localize = nls.loadMessageBundle()

const AUTO_REFRESH_INTERVAL = 5000
const CONTEXT_BASE = 'awsAppRunnerServiceNode'

const OPERATION_STATUS: { [key: string]: string } = {
    START_DEPLOYMENT: localize('AWS.apprunner.operationStatus.deploy', 'Deploying...'),
    CREATE_SERVICE: localize('AWS.apprunner.operationStatus.create', 'Creating...'),
    PAUSE_SERVICE: localize('AWS.apprunner.operationStatus.pause', 'Pausing...'),
    RESUME_SERVICE: localize('AWS.apprunner.operationStatus.resume', 'Resuming...'),
}

export class AppRunnerServiceNode extends CloudWatchLogsParentNode {
    private refreshTimer: NodeJS.Timeout | undefined

    constructor(
        public readonly parent: AppRunnerNode,
        private readonly client: AppRunnerClient,
        private info: AppRunner.Service,
        private currentOperation: AppRunner.Operation = {}
    ) {
        super(
            'App Runner Service',
            'us-east-1',
            localize('AWS.explorerNode.apprunner.nologs', '[No App Runner logs found]')
        )
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.apprunner),
            light: vscode.Uri.file(ext.iconPaths.light.apprunner),
        }
        this.update(info)
    }

    protected async getLogGroups(client: CloudWatchLogsClient): Promise<Map<string, CloudWatchLogs.LogGroup>> {
        return toMap(
            await toArrayAsync(
                client.describeLogGroups({ logGroupNamePrefix: `/aws/apprunner/${this.info.ServiceName}/` })
            ),
            configuration => configuration.logGroupName
        )
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
        this.contextValue = `${CONTEXT_BASE}.${this.info.Status}`
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
}
