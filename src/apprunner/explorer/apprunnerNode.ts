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

// TODO: split into 'Listener' and 'Event'
interface Event<Model = any> {
    retryAfter?: number
    model?: Model
    isPending(): boolean
    getEventId(): string
    update?(newModel?: Model): void
}

interface PollEvent<Model = any> {
    model?: Model
}

interface Listener<Model = any> {
    update(model?: Model): void
}
export class AppRunnerNode extends AWSTreeNodeBase {
    // Maps ServiceIds to nodes
    private readonly serviceNodes: Map<string, AppRunnerServiceNode>
    private poller: AppRunnerPollManager

    public constructor(private readonly client: AppRunnerClient) {
        super('App Runner', vscode.TreeItemCollapsibleState.Collapsed)
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

    public addEvent(event: Event<AppRunner.Service>): void {
        this.poller.addEvent(event)
    }

    private async listServices(): Promise<Event<AppRunner.Service>[]> {
        const request: AppRunner.ListServicesRequest = {}

        const iterator = getPaginatedAwsCallIter({
            awsCall: async request => (await this.client.listServices(request)).ListServicesResult,
            nextTokenNames: {
                request: 'NextToken',
                response: 'NextToken',
            },
            request,
        })

        const services: Map<string, Event<AppRunner.Service>> = new Map()

        for await (const list of iterator) {
            await Promise.all(
                list.ServiceSummaryList.map(summary => summary as AppRunner.Service).map(async summary => {
                    services.set(summary.ServiceArn, {
                        model: summary,
                        getEventId: () => summary.ServiceArn,
                        isPending: () => summary.Status === 'OPERATION_IN_PROGRESS',
                    })
                })
            )
        }

        // Special case for deleted services
        this.serviceNodes.forEach((_, key) => {
            if (!services.has(key)) {
                services.set(key, {
                    model: { Status: 'DELETED' } as any,
                    getEventId: () => key,
                    isPending: () => false,
                })
            }
        })

        return [...services.values()]
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
                    if (this.serviceNodes.has(summary.ServiceArn)) {
                        this.serviceNodes.get(summary.ServiceArn)!.update(summary)
                    } else {
                        // Get top-level operation (always the first element)
                        const operations = (
                            await this.client.listOperations({ MaxResults: 1, ServiceArn: summary.ServiceArn })
                        ).ListOperationsResult?.OperationSummaryList
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

/****************************************/
/********** EXPERIMENTAL CODE ***********/
/****************************************/
abstract class PollManager<Model = any> {
    protected eventPool: Map<
        string,
        { model?: Model; event: Event<Model>; collisions: number; retryAfter: number }
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
        this.eventPool.forEach(element => {
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

    public addEvent(event: Event<Model>, model?: Model): void {
        this.eventPool.set(event.getEventId(), {
            model: model,
            event: event,
            collisions: 0,
            retryAfter: event.retryAfter ?? Date.now() + this.baseTime,
        })

        if (this.eventPool.size === 1) {
            // start polling
            this.setTimer(this.baseTime)
            console.log('poll manager: started')
        } else {
            // reset the timer
            this.setTimer(this.updateCollisions())
        }
    }

    public removeEvent(event: Event<Model>): void {
        this.eventPool.delete(event.getEventId())

        if (this.eventPool.size === 0 && this.pollTimer !== undefined) {
            clearTimeout(this.pollTimer)
        }
    }

    private async updateEventPool(): Promise<void> {
        console.log(`poll manager: refresh ${new Date(Date.now()).toISOString()}`)
        const newEvents = await this.listEvents()
        newEvents.forEach(event => {
            if (!this.eventPool.has(event.getEventId())) {
                // remove this block
                if (event.isPending()) {
                    this.addEvent(event)
                }
            } else {
                if (!event.isPending()) {
                    const previous = this.eventPool.get(event.getEventId())!.event
                    if (previous.update) {
                        console.log(`poll manager: updated ${event.getEventId()}`)
                        previous.update(event.model)
                    }
                    this.removeEvent(event)
                }
            }
        })

        if (this.eventPool.size !== 0) {
            // recalculate new time from group of events
            this.setTimer(this.updateCollisions())
        } else {
            console.log('poll manager: stopped')
        }
    }

    protected abstract listEvents(maxPage?: number, nextToken?: string): Promise<Event<Model>[]>
}

export class AppRunnerPollManager extends PollManager<AppRunner.Service> {
    public constructor(private readonly listServices: () => Promise<Event<AppRunner.Service>[]>) {
        super()
    }

    protected async listEvents(maxPage?: number, nextToken?: string): Promise<Event<AppRunner.Service>[]> {
        return this.listServices()
    }
}
