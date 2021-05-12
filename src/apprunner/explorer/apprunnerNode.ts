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
import * as AppRunner from '../models/apprunner'
import { CreateAppRunnerServiceWizard } from '../wizards/wizardpart2'
const localize = nls.loadMessageBundle()

export class AppRunnerNode extends AWSTreeNodeBase {
    // Maps ServiceIds to nodes
    private readonly serviceNodes: Map<string, AppRunnerServiceNode>

    public constructor(private readonly client: AppRunnerClient) {
        super('App Runner', vscode.TreeItemCollapsibleState.Collapsed)
        this.serviceNodes = new Map<string, AppRunnerServiceNode>()
        this.contextValue = 'awsAppRunnerNode'
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

    public async updateChildren(): Promise<void> {
        const request: AppRunner.ListServicesRequest = {}

        const iterator = getPaginatedAwsCallIter({
            awsCall: async request => (await this.client.listServices(request)).ListServicesResult,
            nextTokenNames: {
                request: 'NextToken',
                response: 'NextToken',
            },
            request,
        })

        for await (const list of iterator) {
            await Promise.all(
                list.ServiceSummaryList.map(summary => summary as AppRunner.Service).map(async summary => {
                    if (this.serviceNodes.has(summary.ServiceId)) {
                        this.serviceNodes.get(summary.ServiceId)!.update(summary)
                    } else {
                        // Get top-level operation (always the first element)
                        const operations = (
                            await this.client.listOperations({ MaxResults: 1, ServiceArn: summary.ServiceArn })
                        ).ListOperationsResult?.OperationSummaryList
                        const operation = operations && operations[0].EndedAt === undefined ? operations[0] : undefined
                        this.serviceNodes.set(
                            summary.ServiceId,
                            new AppRunnerServiceNode(this, this.client, summary, operation)
                        )
                    }
                })
            )
        }
    }

    public deleteNode(id: string): void {
        if (this.serviceNodes.has(id)) {
            this.serviceNodes.delete(id)
        }
    }

    public async createService(): Promise<void> {
        const wizard = new CreateAppRunnerServiceWizard('us-east-1')
        try {
            const result = await wizard.run()
            if (result !== undefined) {
                try {
                    await this.client.createService(result)
                    this.refresh()
                } catch (e) {
                    console.log(e)
                }
            }
        } catch (err) {
            console.log(err)
        }
    }
}
