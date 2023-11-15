/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import sanitizeHtml from 'sanitize-html'
import { collectFiles, prepareRepoData } from '../util/files'
import { getLogger } from '../../shared/logger'
import { FileSystemCommon } from '../../srcShared/fs'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { weaverbirdScheme } from '../constants'
import {
    SessionStateAction,
    SessionStateConfig,
    SessionStateInteraction,
    SessionState,
    NewFileContents,
    SessionStatePhase,
} from '../types'
import globals from '../../shared/extensionGlobals'
import { ToolkitError } from '../../shared/errors'
import { telemetry } from '../../shared/telemetry/telemetry'
import { randomUUID } from 'crypto'
import { uploadCode } from '../util/upload'
import { UserMessageNotFoundError } from '../errors'
import { TelemetryHelper } from '../util/telemetryHelper'

const fs = FileSystemCommon.instance

export class ConversationNotStartedState implements Omit<SessionState, 'uploadId'> {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Init'

    constructor(public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.approach = ''
    }

    async interact(_action: SessionStateAction): Promise<SessionStateInteraction> {
        throw new ToolkitError('Illegal transition between states, restart the conversation')
    }
}

export class PrepareRefinementState implements Omit<SessionState, 'uploadId'> {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Approach'
    constructor(private config: Omit<SessionStateConfig, 'uploadId'>, public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }
    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(
            this.config.sourceRoot,
            this.config.conversationId
        )

        const { uploadUrl, uploadId, kmsKeyArn } = await this.config.proxyClient.createUploadUrl(
            this.config.conversationId,
            zipFileChecksum
        )

        await uploadCode(uploadUrl, zipFileBuffer, kmsKeyArn)
        const nextState = new RefinementState({ ...this.config, uploadId }, this.approach, this.tabID, 0)
        return nextState.interact(action)
    }
}

export class RefinementState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly conversationId: string
    public readonly uploadId: string
    public readonly phase = 'Approach'

    constructor(
        private config: SessionStateConfig,
        public approach: string,
        public tabID: string,
        private currentIteration: number
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
        this.uploadId = config.uploadId
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        return telemetry.amazonq_approachInvoke.run(async span => {
            try {
                span.record({ amazonqConversationId: this.conversationId })
                TelemetryHelper.instance.setGenerateApproachIteration(this.currentIteration)
                TelemetryHelper.instance.setGenerateApproachLastInvocationTime()
                if (!action.msg) {
                    throw new UserMessageNotFoundError()
                }

                const approach = await this.config.proxyClient.generatePlan(
                    this.config.conversationId,
                    this.config.uploadId,
                    action.msg
                )

                this.approach = sanitizeHtml(
                    approach ??
                        'There has been a problem generating an approach. Please open a conversation in a new tab',
                    {}
                )
                getLogger().info(`Approach response: ${JSON.stringify(this.approach)}`)

                TelemetryHelper.instance.recordUserApproachTelemetry(this.conversationId)
                return {
                    nextState: new RefinementState(
                        {
                            ...this.config,
                            conversationId: this.conversationId,
                        },
                        this.approach,
                        this.tabID,
                        this.currentIteration + 1
                    ),
                    interaction: {
                        content: `${this.approach}\n`,
                    },
                }
            } catch (e) {
                throw e instanceof ToolkitError ? e : ToolkitError.chain(e, 'Server side error')
            }
        })
    }
}

async function createFilePaths(
    fs: VirtualFileSystem,
    newFileContents: NewFileContents,
    uploadId: string,
    conversationId: string
): Promise<string[]> {
    const filePaths: string[] = []
    for (const { filePath, fileContent } of newFileContents) {
        const encoder = new TextEncoder()
        const contents = encoder.encode(fileContent)
        const generationFilePath = path.join(uploadId, filePath)
        const uri = vscode.Uri.from({ scheme: weaverbirdScheme, path: generationFilePath })
        fs.registerProvider(uri, new VirtualMemoryFile(contents))
        filePaths.push(filePath)
    }

    return filePaths
}

abstract class CodeGenBase {
    private pollCount = 180
    private requestDelay = 10000
    readonly tokenSource: vscode.CancellationTokenSource
    public phase: SessionStatePhase = 'Codegen'
    public readonly conversationId: string
    public readonly uploadId: string

    constructor(protected config: SessionStateConfig, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
        this.uploadId = config.uploadId
    }

    async generateCode({ fs, codeGenerationId }: { fs: VirtualFileSystem; codeGenerationId: string }): Promise<{
        newFiles: any
        newFilePaths: string[]
    }> {
        for (
            let pollingIteration = 0;
            pollingIteration < this.pollCount && !this.tokenSource.token.isCancellationRequested;
            ++pollingIteration
        ) {
            const codegenResult = await this.config.proxyClient.getCodeGeneration(this.conversationId, codeGenerationId)
            getLogger().info(`Codegen response: ${JSON.stringify(codegenResult)}`)
            TelemetryHelper.instance.setCodeGenerationResult(codegenResult.codeGenerationStatus.status)
            switch (codegenResult.codeGenerationStatus.status) {
                case 'Complete': {
                    // const newFiles = codegenResult.result?.newFileContents ?? []
                    const newFiles = await this.config.proxyClient.exportResultArchive(this.conversationId)
                    const newFilePaths = await createFilePaths(fs, newFiles, this.uploadId, this.conversationId)
                    TelemetryHelper.instance.setNumberOfFilesGenerated(newFilePaths.length)
                    return {
                        newFiles,
                        newFilePaths,
                    }
                }
                case 'predict-ready':
                case 'InProgress': {
                    await new Promise(f => globals.clock.setTimeout(f, this.requestDelay))
                    break
                }
                case 'predict-failed':
                case 'debate-failed':
                case 'Failed': {
                    throw new ToolkitError('Code generation failed')
                }
                default: {
                    const errorMessage = `Unknown status: ${codegenResult.codeGenerationStatus.status}\n`
                    throw new ToolkitError(errorMessage)
                }
            }
        }
        if (!this.tokenSource.token.isCancellationRequested) {
            // still in progress
            const errorMessage = 'Code generation did not finish withing the expected time'
            throw new ToolkitError(errorMessage)
        }
        return {
            newFiles: [],
            newFilePaths: [],
        }
    }
}

export class CodeGenState extends CodeGenBase implements SessionState {
    public filePaths: string[]

    constructor(config: SessionStateConfig, public approach: string, tabID: string, private currentIteration: number) {
        super(config, tabID)
        this.filePaths = []
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        telemetry.amazonq_isApproachAccepted.emit({ amazonqConversationId: this.config.conversationId, enabled: true })

        return telemetry.amazonq_codeGenerationInvoke.run(async span => {
            try {
                span.record({ amazonqConversationId: this.config.conversationId })
                TelemetryHelper.instance.setGenerateCodeIteration(this.currentIteration)
                TelemetryHelper.instance.setGenerateCodeLastInvocationTime()

                const { codeGenerationId } = await this.config.proxyClient.startCodeGeneration(
                    this.config.conversationId,
                    this.config.uploadId
                )

                action.messenger.sendAnswer({
                    message: 'Generating code ...',
                    type: 'answer-part',
                    tabID: this.tabID,
                })

                const codeGeneration = await this.generateCode({
                    fs: action.fs,
                    codeGenerationId,
                })
                this.filePaths = codeGeneration.newFilePaths
                TelemetryHelper.instance.recordUserCodeGenerationTelemetry(this.conversationId)
                const nextState = new PrepareCodeGenState(
                    this.config,
                    this.approach,
                    this.filePaths,
                    this.tabID,
                    this.currentIteration + 1
                )
                return {
                    nextState,
                    interaction: {},
                }
            } catch (e) {
                throw e instanceof ToolkitError ? e : ToolkitError.chain(e, 'Server side error')
            }
        })
    }
}

export class MockCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public filePaths: string[]
    public readonly conversationId: string
    public readonly uploadId: string

    constructor(private config: SessionStateConfig, public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.filePaths = []
        this.conversationId = config.conversationId
        this.uploadId = randomUUID()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        let newFileContents: NewFileContents = []

        // in a `mockcodegen` state, we should read from the `mock-data` folder and output
        // every file retrieved in the same shape the LLM would
        const mockedFilesDir = path.join(this.config.workspaceRoot, './mock-data')
        try {
            const mockDirectoryExists = await fs.stat(mockedFilesDir)
            if (mockDirectoryExists) {
                const files = await collectFiles(mockedFilesDir, false)
                newFileContents = files.map(f => ({
                    filePath: f.filePath.replace('mock-data/', ''),
                    fileContent: f.fileContent,
                }))
                this.filePaths = await createFilePaths(action.fs, newFileContents, this.uploadId, this.conversationId)
            }
        } catch (e) {
            // TODO: handle this error properly, double check what would be expected behaviour if mock code does not work.
            getLogger().error('Unable to use mock code generation: %O', e)
        }

        return {
            // no point in iterating after a mocked code gen?
            nextState: new RefinementState(
                {
                    ...this.config,
                    conversationId: this.conversationId,
                },
                this.approach,
                this.tabID,
                0
            ),
            interaction: {},
        }
    }
}

export class PrepareCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Codegen'
    public uploadId: string
    public conversationId: string
    constructor(
        private config: SessionStateConfig,
        public approach: string,
        public filePaths: string[],
        public tabID: string,
        private currentIteration: number
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.uploadId = config.uploadId
        this.conversationId = config.conversationId
    }
    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        action.messenger.sendAnswer({
            message: 'Uploading code ...',
            type: 'answer-part',
            tabID: this.tabID,
        })

        const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(this.config.sourceRoot, this.conversationId)

        const { uploadUrl, uploadId, kmsKeyArn } = await this.config.proxyClient.createUploadUrl(
            this.config.conversationId,
            zipFileChecksum
        )

        this.uploadId = uploadId
        await uploadCode(uploadUrl, zipFileBuffer, kmsKeyArn)
        const nextState = new CodeGenState({ ...this.config, uploadId }, '', this.tabID, this.currentIteration)
        return nextState.interact(action)
    }
}
