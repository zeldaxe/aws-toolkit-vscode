/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AppRunnerServiceNode } from './apprunnerServiceNode'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import * as nls from 'vscode-nls'
import { AppRunnerClient } from '../../shared/clients/apprunnerClient'
import { getPaginatedAwsCallIter } from '../../shared/utilities/collectionUtils'
import { AppRunner } from 'aws-sdk'
import { CreateAppRunnerServiceWizard } from '../wizards/apprunnerCreateServiceWizard'
import { ext } from '../../shared/extensionGlobals'
import { PollEvent, PollListener, PollManager } from '../../shared/utilities/pollManager'

const localize = nls.loadMessageBundle()
export class AppRunnerNode extends AWSTreeNodeBase {
    // Maps ServiceIds to nodes
    private readonly serviceNodes: Map<string, AppRunnerServiceNode>
    private poller: PollManager<AppRunner.Service> 
    private readonly client: AppRunnerClient

    public constructor(public readonly region: string) {
        super('App Runner', vscode.TreeItemCollapsibleState.Collapsed)
        this.client = ext.toolkitClientBuilder.createAppRunnerClient(region)
        this.serviceNodes = new Map<string, AppRunnerServiceNode>()
        this.contextValue = 'awsAppRunnerNode'
        this.poller = new PollManager(() => this.listServices())
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.serviceNodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.apprunner.noServices', '[No App Runner services found]')
                ),
            sort: (nodeA: AppRunnerServiceNode, nodeB: AppRunnerServiceNode) =>
                nodeA.label!.localeCompare(nodeB.label!),
        })
    }

    public addListener(listener: PollListener<AppRunner.Service>): void {
        this.poller.addPollListener(listener)
    }

    private async listServices(): Promise<PollEvent<AppRunner.Service>[]> {
        const serviceSummaries = await this.getServiceSummaries()
        const services: Map<string, PollEvent<AppRunner.Service>> = new Map()

        serviceSummaries.forEach(summary => 
            services.set(summary.ServiceArn, { id: summary.ServiceArn, model: summary })
        )

        // Special case for deleted services
        this.serviceNodes.forEach((_, key) => {
            if (!services.has(key)) {
                services.set(key, { id: key, model: { Status: 'DELETED' } as any })
            }
        })

        return [...services.values()]
    }

    private async getServiceSummaries(request: AppRunner.ListServicesRequest = {}): Promise<AppRunner.Service[]> {
        const iterator = getPaginatedAwsCallIter({
            awsCall: async request => (await this.client.listServices(request)),
            nextTokenNames: {
                request: 'NextToken',
                response: 'NextToken',
            },
            request,
        })

        const services: AppRunner.Service[] = []
        
        for await (const list of iterator) {
            await Promise.all(
                list.ServiceSummaryList.map(summary => summary as AppRunner.Service).map(async summary => {
                    services.push(summary)
                })
            )
        }

        return services
    }

    // This could technically be removed as long as the event polling occurs after node construction.
    public async updateChildren(): Promise<void> {
        const serviceSummaries = await this.getServiceSummaries()

        await Promise.all(serviceSummaries.map(async summary => {
            if (this.serviceNodes.has(summary.ServiceArn)) {
                this.serviceNodes.get(summary.ServiceArn)!.update(summary)
            } else {
                // Get top-level operation (always the first element)
                const operations = (
                    await this.client.listOperations({ MaxResults: 1, ServiceArn: summary.ServiceArn })
                ).OperationSummaryList
                const operation = operations && operations[0].EndedAt === undefined ? operations[0] : undefined
                this.serviceNodes.set(
                    summary.ServiceArn,
                    new AppRunnerServiceNode(this, this.client, summary, operation)
                )
            }
        }))
    }

    public deleteNode(id: string): void {
        if (this.serviceNodes.has(id)) {
            this.serviceNodes.delete(id)
        }
    }

    public async createService(): Promise<void> {
        const wizard = new CreateAppRunnerServiceWizard(this.region)
        const result = await wizard.run()
        if (result !== undefined) {
            await this.client.createService(result)
            this.refresh()
        }
    }
}