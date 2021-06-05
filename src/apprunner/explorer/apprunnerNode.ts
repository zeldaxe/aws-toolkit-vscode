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

const localize = nls.loadMessageBundle()
export class AppRunnerNode extends AWSTreeNodeBase {
    // Maps ServiceIds to nodes
    private readonly serviceNodes: Map<string, AppRunnerServiceNode>
    private poller: AppRunnerPollManager
    private readonly client: AppRunnerClient

    public constructor(public readonly region: string) {
        super('App Runner', vscode.TreeItemCollapsibleState.Collapsed)
        this.client = ext.toolkitClientBuilder.createAppRunnerClient(region)
        this.serviceNodes = new Map<string, AppRunnerServiceNode>()
        this.contextValue = 'awsAppRunnerNode'
        this.poller = new AppRunnerPollManager(() => this.listServices())
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

    public addListener(listener: Listener<AppRunner.Service>): void {
        this.poller.addListener(listener)
    }

    private async listServices(): Promise<PollEvent<AppRunner.Service>[]> {
        const request: AppRunner.ListServicesRequest = {}

        const iterator = getPaginatedAwsCallIter({
            awsCall: async request => (await this.client.listServices(request)),
            nextTokenNames: {
                request: 'NextToken',
                response: 'NextToken',
            },
            request,
        })

        const services: Map<string, PollEvent<AppRunner.Service>> = new Map()

        for await (const list of iterator) {
            await Promise.all(
                list.ServiceSummaryList.map(summary => summary as AppRunner.Service).map(async summary => {
                    services.set(summary.ServiceArn, { id: summary.ServiceArn, model: summary })
                })
            )
        }

        // Special case for deleted services
        this.serviceNodes.forEach((_, key) => {
            if (!services.has(key)) {
                services.set(key, { id: key, model: { Status: 'DELETED' } as any })
            }
        })

        return [...services.values()]
    }

    public async updateChildren(): Promise<void> {
        const request: AppRunner.ListServicesRequest = {}

        const iterator = getPaginatedAwsCallIter({
            awsCall: async request => (await this.client.listServices(request)),
            nextTokenNames: {
                request: 'NextToken',
                response: 'NextToken',
            },
            request,
        })

        for await (const list of iterator) {
            await Promise.all(
                list.ServiceSummaryList.map(summary => summary as AppRunner.Service).map(async summary => {
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
        const wizard = new CreateAppRunnerServiceWizard(this.region)
        const result = await wizard.run()
        if (result !== undefined) {
            await this.client.createService(result)
            this.refresh()
        }
    }
}


/**
 * A polling event. This is generated by a 'ListResources' call and is used to determine if a Listener
 * should be removed from the event pool, firing callbacks.
 */
 interface PollEvent<Model = any> {
    id: string
    model: Model
    retryAfter?: number
}

/**
 * A listener for resource updates. 
 */
interface Listener<Model = any> {
    id: string
    update(model: Model): void
    isPending(model: Model): boolean
}

/**
 * Generic polling class. Allows for batch polling operations and asynchonrous updating of resource nodes.
 * Will eventually be moved into the base resource tree node.
 */
abstract class PollManager<Model = any> {
    protected listenerPool: Map<
        string,
        { model?: Model, listener: Listener<Model>, collisions: number, retryAfter: number }
    > = new Map()
    protected pollTimer: NodeJS.Timeout | undefined
    protected timerEnd: number = Number.MAX_VALUE

    public constructor(protected readonly baseTime: number = 5000, protected readonly jitter: number = 0.1) {}

    // Exponential backoff will only occur if the event's 'retryAfter' time occured before the current time
    private exponentialBackoff(collisions: number): number {
        return (
            this.baseTime * (1 + this.jitter * (Math.random() - 0.5)) * (1 + Math.pow(2, Math.max(0, collisions)) * 0.5)
        )
    }

    // Updates collisions and returns the polling delta
    private updateCollisions(): number {
        let pollDelta = Number.MAX_VALUE
        this.listenerPool.forEach(element => {
            if (element.retryAfter < Date.now()) {
                element.retryAfter = Date.now() + this.exponentialBackoff(++element.collisions)
            } else {
                element.retryAfter = Math.max(
                    element.retryAfter,
                    Date.now() + this.exponentialBackoff(element.collisions - 1)
                )
            }
            pollDelta = Math.min(pollDelta, element.retryAfter - Date.now())
        })
        return pollDelta
    }

    private setTimer(delta: number) {
        if (this.pollTimer !== undefined) {
            clearTimeout(this.pollTimer)
        }
        this.pollTimer = setTimeout(() => this.updateEventPool(), delta)
        this.timerEnd = Date.now() + delta
    }

    public addListener(listener: Listener<Model>, model?: Model): void {
        this.listenerPool.set(listener.id, {
            model: model,
            listener: listener,
            collisions: 0,
            retryAfter: Date.now() + this.baseTime,
        })

        if (this.listenerPool.size === 1) {
            // start polling
            this.setTimer(this.baseTime)
            console.log('poll manager: started')
        } else {
            // reset the timer
            this.setTimer(this.updateCollisions())
        }
    }

    public removeListener(listener: Listener<Model>): void {
        this.listenerPool.delete(listener.id)

        if (this.listenerPool.size === 0 && this.pollTimer !== undefined) {
            clearTimeout(this.pollTimer)
        }
    }

    private async updateEventPool(): Promise<void> {
        console.log(`poll manager: refresh ${new Date(Date.now()).toISOString()}`)
        const newEvents = await this.listEvents()
        newEvents.forEach(event => {
            const listener = this.listenerPool.get(event.id)?.listener
             if (listener !== undefined && !listener.isPending(event.model)) {
                if (listener.update !== undefined) {
                    console.log(`poll manager: updated ${event.id}`)
                    listener.update(event.model)
                }
                this.removeListener(listener)
            }
        })

        if (this.listenerPool.size !== 0) {
            // recalculate new time from group of events
            this.setTimer(this.updateCollisions())
        } else {
            console.log('poll manager: stopped')
        }
    }

    protected abstract listEvents(maxPage?: number, nextToken?: string): Promise<PollEvent<Model>[]>
}

export class AppRunnerPollManager extends PollManager<AppRunner.Service> {
    public constructor(private readonly listServices: () => Promise<PollEvent<AppRunner.Service>[]>) {
        super()
    }

    protected async listEvents(maxPage?: number, nextToken?: string): Promise<PollEvent<AppRunner.Service>[]> {
        return this.listServices()
    }
}
