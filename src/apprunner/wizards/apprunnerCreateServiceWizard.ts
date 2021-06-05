/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    createQuickPick,
    CUSTOM_USER_INPUT,
    ExtendedQuickPickOptions,
    promptUser,
    verifySinglePickerOutput,
} from '../../shared/ui/picker'
import { AppRunner } from 'aws-sdk'
import * as nls from 'vscode-nls'
import { createHelpButton } from '../../shared/ui/buttons'
import { ext } from '../../shared/extensionGlobals'
import { IamClient } from '../../shared/clients/iamClient'
import { Remote, Branch } from '../../../types/git'
import { getRemotes, getApiForGit, getBranchesForRemote } from '../../shared/utilities/gitUtils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { EcrClient, EcrRepository } from '../../shared/clients/ecrClient'
import { StateMachineController, StateStepFunction } from '../../shared/wizards/stateController'
import * as input from '../../shared/ui/input'

const localize = nls.loadMessageBundle()

const DEFAULT_PORT = '8080'

// These types are in the AppRunner API but they're unioned with the string type.
type AppRunnerSourceType = 'ECR' | 'ECR-Public' | 'Repository' | 'API'
type AppRunnerRuntime = 'PYTHON_3' | 'NODEJS_12'
type TaggedEcrRepository = EcrRepository & { tag?: string }

// The state machine controller currently only makes shallow copies of states, so having state fields be top-level
// is preferred to perserve immutability of states.
// TODO: it may be better to map state 1:1 (or as close as possible) to the output type
// Note: recursively determining types using the Typescript compiler was too slow to be usable
// because of this, it might be better to just stick with the flat state structure.
// modularity can be created by breaking up the state types into mutliple logical chunks

type CreateServiceState = {
    lastPicked?: any
    name?: string
    source?: AppRunnerSourceType
    imageRepo?: TaggedEcrRepository
    port?: string
    accessRole?: string
    repository?: Remote
    branch?: Branch
    runtime?: AppRunnerRuntime
    buildCommand?: string
    startCommand?: string
    isPublic?: boolean
    instanceConfig?: { cpu: number; mem: number }
}

type DataQuickPickItem<T> = vscode.QuickPickItem & { data: T }
interface CreateAppRunnerServiceContext {
    readonly region: string,
    readonly iamClient: IamClient,
    readonly ecrClient: EcrClient,

    promptWithQuickPick<T>(
        items?: DataQuickPickItem<T>[],
        lastPicked?: DataQuickPickItem<T | symbol>,
        options?: ExtendedQuickPickOptions,
    ): Promise<DataQuickPickItem<T | symbol> | undefined>

    promptWithInputBox(
        lastInput?: string,
        onValidateInput?: (input: string) => string | undefined,
        options?: input.ExtendedInputBoxOptions,
    ): Promise<string | undefined>
}

class DefaultCreateAppRunnerServiceContext {
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))
    public readonly iamClient: IamClient
    public readonly ecrClient: EcrClient

    constructor(public readonly region: string) {
        this.iamClient = ext.toolkitClientBuilder.createIamClient(region)
        this.ecrClient = ext.toolkitClientBuilder.createEcrClient(region)
    }

    public async promptWithQuickPick<T>(
        items?: DataQuickPickItem<T>[],
        lastPicked?: DataQuickPickItem<T | symbol>,
        options?: ExtendedQuickPickOptions,
    ): Promise<DataQuickPickItem<T | symbol> | undefined> {
        const lastPickedIsUserInput = lastPicked !== undefined && lastPicked.data === CUSTOM_USER_INPUT
    
        // TODO: undefined items will be inferred as a quick input by convention
    
        const quickPick = createQuickPick({
            options: {
                value: lastPickedIsUserInput ? lastPicked!.description! : undefined,
                ...options,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
            items: items,
        })
    
        if (lastPickedIsUserInput && items !== undefined) {
            quickPick.activeItems = items.filter(item => lastPicked!.label.includes(item.label))
    
            if (quickPick.activeItems.length === 0) {
                quickPick.activeItems = [quickPick.items[0]]
            }
        }
    
        const choices = await promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    // TODO: add URL option
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/aws/aws-toolkit-vscode'))
                }
            },
        })
    
        return choices !== undefined ? verifySinglePickerOutput(choices) : undefined
    }

    public async promptWithInputBox(
        lastInput?: string,
        onValidateInput?: (input: string) => string | undefined,
        options?: input.ExtendedInputBoxOptions,
    ): Promise<string | undefined> {
        const inputBox = input.createInputBox({ options, buttons: [this.helpButton, vscode.QuickInputButtons.Back] })
        inputBox.value = lastInput ?? ''

        const userInput = await input.promptUser({
            inputBox: inputBox,
            onValidateInput: onValidateInput,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === this.helpButton) {
                    // TODO: add URL
                    vscode.env.openExternal(vscode.Uri.parse(''))
                }
            },
        })
    
        return userInput
    }
}

export class CreateAppRunnerServiceWizard {
    private readonly controller = new StateMachineController<CreateServiceState>()

    public constructor(
        region: string, 
        private readonly context: CreateAppRunnerServiceContext = new DefaultCreateAppRunnerServiceContext(region)
    ) {
        this.controller.addStep(this.nameStep)
        this.controller.addStep(this.sourceStep)
        this.controller.addStep(this.portStep)
        this.controller.addStep(this.instanceConfigStep)
    }

    public async run(): Promise<AppRunner.CreateServiceRequest | undefined> {
        const response = await this.controller.run()

        return response !== undefined ? this.stateToResult(response) : undefined
    }

    // TODO: verify that these things are actually defined...
    private stateToResult(state: CreateServiceState): AppRunner.CreateServiceRequest {
        const result: AppRunner.CreateServiceRequest = {
            ServiceName: state.name!,
            InstanceConfiguration: {
                Cpu: `${state.instanceConfig?.cpu} vCPU`,
                Memory: `${state.instanceConfig?.mem} GB`,
            },
            SourceConfiguration: {
                CodeRepository:
                    state.source === 'Repository'
                        ? {
                              RepositoryUrl: state.repository!.fetchUrl!,
                              SourceCodeVersion: {
                                  Type: 'BRANCH', // don't trust the provided model...
                                  Value: state.branch!.name!.replace(`${state.repository!.name}/`, ''),
                              },
                              CodeConfiguration: {
                                  ConfigurationSource: 'API', // TODO: check for apprunner.yaml (do it for the user by checking either local root or remote root)
                                  CodeConfigurationValues: {
                                      Port: state.port!,
                                      Runtime: state.runtime!,
                                      BuildCommand: state.buildCommand!,
                                      StartCommand: state.startCommand!,
                                  },
                              },
                          }
                        : undefined,
                ImageRepository:
                    state.source === 'ECR'
                        ? {
                              ImageIdentifier: `${state.imageRepo?.repositoryUri}:${state.imageRepo?.tag}`,
                              ImageConfiguration: {
                                  Port: state.port!,
                              },
                              ImageRepositoryType: state.isPublic ? 'ECR-Public' : 'ECR',
                          }
                        : undefined,
                AuthenticationConfiguration:
                    state.source === 'ECR' || state.source === 'Repository'
                        ? {
                              AccessRoleArn: state.source === 'ECR' ? state.accessRole : undefined,
                              // TODO: either prompt user for connection (bad) or store have some persistence
                              //ConnectionArn: this.source === 'Repository' ? this.connection : undefined,
                              ConnectionArn:
                                  state.source === 'Repository'
                                      ? 'arn:aws:apprunner:us-east-1:794366244892:connection/fooosion/bfbf12b8f3fb4f8c8f2032298f5bf364'
                                      : undefined,
                          }
                        : undefined,
            },
        }

        // Removes any undefined properties
        return JSON.parse(JSON.stringify(result))
    }

    private nameStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const validateName = (name: string) => {
            if (!name || name.length < 4) {
                return localize(
                    'AWS.apprunner.createService.name.validation',
                    'Service names must be at least 4 characters'
                )
            }

            return undefined
        }

        const response = await this.context.promptWithInputBox(state.lastPicked, validateName, {
            title: localize('AWS.apprunner.createService.name.title', 'Name your service'),
            ignoreFocusOut: true,
            step: this.controller.currentStep,
            totalSteps: this.controller.totalSteps,
        })

        state.name = response

        return { nextState: response !== undefined ? state : undefined }
    }

    private sourceStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        //state.source = await promptForSourceType(state)
        const response = await this.context.promptWithQuickPick(
            [
                { label: 'ECR', data: 'ECR' },
                //{ label: 'Public ECR', sourceType: 'ECR-Public' },
                { label: 'Repository', data: 'Repository' },
            ],
            state.lastPicked,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.sourceType.title', 'Select a source code location type'),
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        state.source = response?.data as AppRunnerSourceType

        return {
            nextState: state.source !== undefined ? state : undefined,
            nextSteps: state.source === 'Repository' ? [this.repoStep] : [this.imageStep]
        }
    }

    private repoStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const remotes = getRemotes(await getApiForGit())
        const response = await this.context.promptWithQuickPick(
            remotes.map((remote: any) => ({ label: remote.name, detail: remote.fetchUrl, data: remote })),
            state.lastPicked,
            {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.apprunner.createService.selectRepository.title',
                    'Select a remote GitHub repository'
                ),
                placeHolder: localize(
                    'AWS.apprunner.createService.selectRepository.placeholder',
                    'Select a remote repository or enter a URL'
                ),
                customUserInputLabel: 'GitHub URL',
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        if (response?.data === CUSTOM_USER_INPUT) {
            state.repository = ({ name: 'UserRemote', isReadOnly: true, fetchUrl: response!.description } as Remote)
        } else {
            state.repository = response?.data
        }

        return {
            nextState: state.repository !== undefined ? state : undefined,
            nextSteps: [
                this.branchStep,
                this.runtimeStep,
                this.buildCommandStep,
                this.startCommandStep
            ],
        }
    }

    private branchStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const branches = await getBranchesForRemote(await getApiForGit(), state.repository!)
        const response = await this.context.promptWithQuickPick(
            branches
                .filter(b => b.name !== '')
                .map((branch: any) => ({
                    label: branch.name.replace(state.repository!.name + '/', ''),
                    data:branch,
                })),
            state.lastPicked,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectBranch.title', 'Select a branch'),
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        state.branch = response?.data as Branch

        return { nextState: response !== undefined ? state : undefined }
    }

    private runtimeStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const response = await this.context.promptWithQuickPick(
            [
                // labels and runtimes are separate in case we want the user-facing name to be different
                { label: 'python3', data:'PYTHON_3' },
                //{ label: 'nodejs10', runtime: 'nodejs10' },
                { label: 'nodejs12', data:'NODEJS_12' },
            ],
            state.lastPicked,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectRuntime.title', 'Select a runtime'),
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        state.runtime = response?.data as AppRunnerRuntime

        return { nextState: response !== undefined ? state : undefined }
    }

    private imageStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const imageRepos = await toArrayAsync(this.context.ecrClient.describeRepositories())
        const response = await this.context.promptWithQuickPick(
            imageRepos.map(repo => ({ label: repo.repositoryName, detail: repo.repositoryUri, data: repo })),
            state.lastPicked,
            {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.apprunner.createService.selectImageRepo.title',
                    'Select or enter an image repository'
                ),
                placeHolder: '111111111111.dkr.ecr.us-east-1.amazonaws.com/myrepo:latest',
                customUserInputLabel: 'Custom ECR URL',
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        if (response?.data === CUSTOM_USER_INPUT) {
            const userInputParts = response!.description!.split(':')
            state.imageRepo = userInputParts.length === 2
                ? {
                    repositoryArn: '',
                    repositoryName: 'UserDefined',
                    repositoryUri: userInputParts[0],
                    tag: userInputParts[1],
                }
                : undefined // Add retry here
        } else {
            state.imageRepo = response?.data as TaggedEcrRepository
        }

        return {
            nextState: response !== undefined ? state : undefined,
            nextSteps: state?.imageRepo?.tag ? undefined : [this.tagStep],
        }
    }

    private tagStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const imageTags = await toArrayAsync(this.context.ecrClient.describeTags(state.imageRepo!.repositoryName))
        const response = await this.context.promptWithQuickPick(
            imageTags.map(tag => ({ label: tag, data: { ...state.imageRepo, tag: tag } })),
            undefined,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select an ECR tag'),
                placeHolder: 'latest',
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        state.imageRepo = response?.data as EcrRepository

        // If this is a public image then we can skip asking for a role
        if (state.imageRepo !== undefined && state.imageRepo.repositoryUri.search(/$public.ecr.aws/) !== -1) {
            state.isPublic = true
        }

        return {
            nextState: response !== undefined ? state : undefined,
            nextSteps: state.isPublic !== true ? [this.roleStep] : undefined,
        }
    }

    private portStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const validatePort = (port: string) => {
            if (isNaN(Number(port)) || port === '') {
                return localize('AWS.apprunner.createService.selectPort.invalidPort', 'Port must be a number')
            }

            return undefined
        }

        const response = await this.context.promptWithInputBox(state.lastPicked, validatePort, {
            title: localize('AWS.apprunner.createService.selectPort.title', 'Enter a port for the new service'),
            ignoreFocusOut: true,
            placeHolder: 'Enter a port',
            step: this.controller.currentStep,
            totalSteps: this.controller.totalSteps,
        })

        state.port = response

        return { nextState: response !== undefined ? state : undefined }
    }

    private roleStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        // TODO: don't actually do this to filter out access roles...
        const resp = (await this.context.iamClient.listRoles()).Roles.filter(role =>
            (role.AssumeRolePolicyDocument ?? '').includes('build.apprunner.amazonaws.com')
        )
        const response = await this.context.promptWithQuickPick(
            resp.map(role => ({ label: role.RoleName, data: role.Arn })),
            state.lastPicked,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        state.accessRole = response?.data as string

        return { nextState: response !== undefined ? state : undefined }
    }

    private buildCommandStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const buildCommandMap = {
            python: 'pip install -r requirements.txt',
            node: 'npm install',
        } as { [key: string]: string }
        const response = await this.context.promptWithInputBox(state.lastPicked, undefined, {
            title: localize('AWS.apprunner.createService.buildCommand.title', 'Enter a build command'),
            ignoreFocusOut: true,
            placeHolder:
                buildCommandMap[
                    Object.keys(buildCommandMap).filter(key => state.runtime!.toLowerCase().includes(key))[0]
                ],
            step: this.controller.currentStep,
            totalSteps: this.controller.totalSteps,
        })

        return { nextState: response !== undefined ? state : undefined }
    }

    private startCommandStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const startCommandMap = {
            python: 'python runapp.py',
            node: 'node app.js',
        } as { [key: string]: string }

        const response = await this.context.promptWithInputBox(state.lastPicked, undefined, {
            title: localize('AWS.apprunner.createService.startCommand.title', 'Enter a start command'),
            ignoreFocusOut: true,
            placeHolder:
                startCommandMap[
                    Object.keys(startCommandMap).filter(key => state.runtime!.toLowerCase().includes(key))[0]
                ],
            step: this.controller.currentStep,
            totalSteps: this.controller.totalSteps,
        })

        state.startCommand = response

        return { nextState: response !== undefined ? state : undefined }
    }

    private instanceConfigStep: StateStepFunction<CreateServiceState> = async (state: CreateServiceState) => {
        const enumerations = [
            [1, 2],
            [1, 3],
            [2, 4],
        ]

        const response = await this.context.promptWithQuickPick(
            enumerations.map(e => ({
                label: `${e[0]} vCPU${e[0] > 1 ? 's' : ''}, ${e[1]} GBs Memory`,
                data: { cpu: e[0], mem: e[1] },
            })),
            undefined,
            {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.apprunner.createService.selectInstanceConfig.title',
                    'Select instance configuration'
                ),
                step: this.controller.currentStep,
                totalSteps: this.controller.totalSteps,
            }
        )

        state.instanceConfig = response?.data as { cpu: number, mem: number }

        return { nextState: state.instanceConfig !== undefined ? state : undefined }
    }
}
