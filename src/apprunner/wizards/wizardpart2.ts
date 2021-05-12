/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    ExtendedMachineState,
    MachineState,
    StateMachineController,
    StateStepFunction,
} from '../../shared/wizards/multiStepWizard'
import {
    createQuickPick,
    CUSTOM_USER_INPUT,
    ExtendedQuickPickOptions,
    promptUser,
    verifySinglePickerOutput,
} from '../../shared/ui/picker'
import * as AppRunner from '../models/apprunner'
import * as nls from 'vscode-nls'
import { createHelpButton } from '../../shared/ui/buttons'
import * as input from '../../shared/ui/input'
import { ext } from '../../shared/extensionGlobals'
import { IamClient } from '../../shared/clients/iamClient'
import { Remote, Branch } from '../../../types/git'
import { getRemotes, getApiForGit, getBranchesForRemote } from '../../shared/utilities/gitUtils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { EcrClient, EcrRepository } from '../../shared/clients/ecrClient'

const localize = nls.loadMessageBundle()

const DEFAULT_PORT = '8080'

// These types are in the AppRunner API but they're unioned with the string type.
type AppRunnerSourceType = 'ECR' | 'ECR-Public' | 'Repository' | 'API'
type AppRunnerRuntime = 'PYTHON_3' | 'NODEJS_12'
type TaggedEcrRepository = EcrRepository & { tag?: string }

type MetadataQuickPickItem<T> = vscode.QuickPickItem & { metadata: T }
// The state machine controller currently only makes shallow copies of states, so having state fields be top-level
// is preferred to perserve immutability of states.
// TODO: it may be better to map state 1:1 (or as close as possible) to the output type
type CreateServiceState = MachineState<{
    //picked?: MetadataQuickPickItem<any>[]
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
    iamClient: IamClient
    ecrClient: EcrClient
    helpButton: vscode.QuickInputButton
}>
// mutates a state's property
//
// TODO: add capacity for default
// need to differentiate between user hitting enter with no defined quick pick versus back button
// technically can support multiple selections if the state property takes an array
// TODO: picked data needs to be scrubbed upon reaching a new state (have step-specific state information??)
async function promptForProperty<TState extends ExtendedMachineState & { helpButton: vscode.QuickInputButton }, TProp>(
    state: TState,
    property: keyof TState,
    items?: MetadataQuickPickItem<TProp>[],
    transformUserInput?: (input?: string) => TProp,
    options?: ExtendedQuickPickOptions
): Promise<TState | undefined> {
    const picked: MetadataQuickPickItem<any>[] = state.stepCache ? state.stepCache.picked : undefined
    const isUserInput = picked && picked[0].metadata === CUSTOM_USER_INPUT

    // TODO: undefined items will be inferred as a quick input by convention

    const quickPick = createQuickPick<MetadataQuickPickItem<TProp | symbol>>({
        options: {
            value: isUserInput ? picked[0].description! : undefined,
            step: state.currentStep,
            totalSteps: state.totalSteps,
            ...options,
        },
        buttons: [state.helpButton, vscode.QuickInputButtons.Back],
        items: items,
    })

    if (!isUserInput && items) {
        quickPick.activeItems = items.filter(item => picked?.map(item => item.label).includes(item.label))

        if (quickPick.activeItems.length === 0) {
            quickPick.activeItems = [quickPick.items[0]]
        }
    }

    const choices = await promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === state.helpButton) {
                // TODO: add URL option
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/aws/aws-toolkit-vscode'))
            }
        },
    })

    const choice = verifySinglePickerOutput(choices)
    if (choice !== undefined) {
        state.stepCache = { picked: [choice] }
        if (transformUserInput && choice.metadata === CUSTOM_USER_INPUT) {
            Object.defineProperty(state, property, {
                value: transformUserInput(choice.description),
                enumerable: true,
                configurable: true,
            })
        } else {
            Object.defineProperty(state, property, { value: choice.metadata, enumerable: true, configurable: true })
        }
    }

    return choice ? state : undefined
}

export async function promptForPropertyInput<
    TState extends ExtendedMachineState & { helpButton: vscode.QuickInputButton },
    TProp
>(
    state: TState,
    property: keyof TState,
    onValidateInput?: (value: string) => string | undefined,
    options?: input.ExtendedInputBoxOptions
): Promise<TState | undefined> {
    const picked: MetadataQuickPickItem<any>[] = state.stepCache ? state.stepCache.picked : undefined

    const inputBox = input.createInputBox({
        options: {
            value: picked ? picked[0].label : undefined,
            step: state.currentStep,
            totalSteps: state.totalSteps,
            ...options,
        },
        buttons: [state.helpButton, vscode.QuickInputButtons.Back],
    })

    const userInput = await input.promptUser({
        inputBox: inputBox,
        onValidateInput: onValidateInput,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === state.helpButton) {
                // TODO: add URL
                vscode.env.openExternal(vscode.Uri.parse(''))
            }
        },
    })

    if (userInput !== undefined) {
        state.stepCache = { picked: [{ label: userInput }] }
        Object.defineProperty(state, property, { value: userInput, enumerable: true, configurable: true })
    }

    return userInput ? state : undefined
}

export class CreateAppRunnerServiceWizard extends StateMachineController<
    Omit<CreateServiceState, keyof ExtendedMachineState>,
    AppRunner.CreateServiceRequest
> {
    public constructor(private readonly defaultRegion: string) {
        super(state => CreateAppRunnerServiceWizard.stateToResult(state), {
            initState: {
                iamClient: ext.toolkitClientBuilder.createIamClient(defaultRegion),
                ecrClient: ext.toolkitClientBuilder.createEcrClient(defaultRegion),
                helpButton: createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation')),
            },
        })
        this.addStep(CreateAppRunnerServiceWizard.nameStep)
        this.addStep(CreateAppRunnerServiceWizard.sourceStep)
        this.addStep(CreateAppRunnerServiceWizard.portStep)
        this.addStep(CreateAppRunnerServiceWizard.instanceConfigStep)
    }

    // TODO: verify that these things are actually defined...
    private static stateToResult(state: CreateServiceState): AppRunner.CreateServiceRequest {
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

        return JSON.parse(JSON.stringify(result))
    }

    private static nameStep: StateStepFunction<CreateServiceState> = async state => {
        const validateName = (name: string) => {
            if (!name || name.length < 4) {
                return localize(
                    'AWS.apprunner.createService.name.validation',
                    'Service names must be at least 4 characters'
                )
            }

            return undefined
        }

        const outState = await promptForPropertyInput(state, 'name', validateName, {
            title: localize('AWS.apprunner.createService.name.title', 'Name your service'),
            ignoreFocusOut: true,
        })
        return { nextState: outState }
    }

    private static sourceStep: StateStepFunction<CreateServiceState> = async state => {
        //state.source = await promptForSourceType(state)
        const outState = await promptForProperty(
            state,
            'source',
            [
                { label: 'ECR', metadata: 'ECR' },
                //{ label: 'Public ECR', sourceType: 'ECR-Public' },
                { label: 'Repository', metadata: 'Repository' },
            ],
            undefined,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.sourceType.title', 'Select source code location type'),
            }
        )

        return {
            nextState: outState,
            nextSteps: outState
                ? outState.source === 'Repository'
                    ? [CreateAppRunnerServiceWizard.repoStep]
                    : [CreateAppRunnerServiceWizard.imageStep]
                : [],
        }
    }

    private static repoStep: StateStepFunction<CreateServiceState> = async state => {
        const remotes = getRemotes(await getApiForGit())
        const outState = await promptForProperty(
            state,
            'repository',
            remotes.map((remote: any) => ({ label: remote.name, detail: remote.fetchUrl, metadata: remote })),
            (input?: string) =>
                input ? ({ name: 'UserRemote', isReadOnly: true, fetchUrl: input } as Remote) : undefined,
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
            }
        )

        return {
            nextState: outState,
            nextSteps: [
                CreateAppRunnerServiceWizard.branchStep,
                CreateAppRunnerServiceWizard.runtimeStep,
                CreateAppRunnerServiceWizard.buildCommandStep,
                CreateAppRunnerServiceWizard.startCommandStep,
            ],
        }
    }

    private static branchStep: StateStepFunction<CreateServiceState> = async state => {
        const branches = await getBranchesForRemote(await getApiForGit(), state.repository!)
        const outState = await promptForProperty(
            state,
            'branch',
            branches
                .filter(b => b.name !== '')
                .map((branch: any) => ({
                    label: branch.name.replace(state.repository!.name + '/', ''),
                    metadata: branch,
                })),
            undefined,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectBranch.title', 'Select a branch'),
            }
        )
        return { nextState: outState }
    }

    private static runtimeStep: StateStepFunction<CreateServiceState> = async state => {
        const outState = await promptForProperty(
            state,
            'runtime',
            [
                // labels and runtimes are separate in case we want the user-facing name to be different
                { label: 'python3', metadata: 'PYTHON_3' },
                //{ label: 'nodejs10', runtime: 'nodejs10' },
                { label: 'nodejs12', metadata: 'NODEJS_12' },
            ],
            undefined,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectRuntime.title', 'Select a runtime'),
            }
        )

        return { nextState: outState }
    }

    private static imageStep: StateStepFunction<CreateServiceState> = async state => {
        const imageRepos = await toArrayAsync(state.ecrClient.describeRepositories())
        const outState = await promptForProperty(
            state,
            'imageRepo',
            imageRepos.map(repo => ({ label: repo.repositoryName, detail: repo.repositoryUri, metadata: repo })),
            (input: string = '') => {
                const userInputParts = input.split(':')
                return userInputParts.length === 2
                    ? {
                          repositoryArn: '',
                          repositoryName: 'UserDefined',
                          repositoryUri: userInputParts[0],
                          tag: userInputParts[1],
                      }
                    : undefined
            },
            {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.apprunner.createService.selectImageRepo.title',
                    'Select or enter an image repository'
                ),
                placeHolder: '111111111111.dkr.ecr.us-east-1.amazonaws.com/myrepo:latest',
                customUserInputLabel: 'Custom ECR URL',
            }
        )

        return {
            nextState: outState,
            nextSteps: outState?.imageRepo?.tag ? undefined : [CreateAppRunnerServiceWizard.tagStep],
        }
    }

    private static tagStep: StateStepFunction<CreateServiceState> = async state => {
        const imageTags = await toArrayAsync(state.ecrClient.describeTags(state.imageRepo!.repositoryName))
        const outState = await promptForProperty(
            state,
            'imageRepo',
            imageTags.map(tag => ({ label: tag, metadata: { ...state.imageRepo, tag: tag } })),
            undefined,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select an ECR tag'),
                placeHolder: 'latest',
            }
        )

        // If this is a public image then we can skip asking for a role
        if (outState && outState.imageRepo && outState.imageRepo.repositoryUri.search(/$public.ecr.aws/) !== -1) {
            outState.isPublic = true
        }

        return {
            nextState: outState,
            nextSteps: outState?.isPublic !== true ? [CreateAppRunnerServiceWizard.roleStep] : undefined,
        }
    }

    private static portStep: StateStepFunction<CreateServiceState> = async state => {
        const validatePort = (port: string) => {
            if (isNaN(Number(port)) || port === '') {
                return localize('AWS.apprunner.createService.selectPort.invalidPort', 'Port must be a number')
            }

            return undefined
        }

        const outState = await promptForPropertyInput(state, 'port', validatePort, {
            title: localize('AWS.apprunner.createService.selectPort.title', 'Enter a port for the new service'),
            ignoreFocusOut: true,
            placeHolder: 'Enter a port',
        })

        return { nextState: outState }
    }

    private static roleStep: StateStepFunction<CreateServiceState> = async state => {
        // TODO: don't actually do this to filter out access roles...
        const resp = (await state.iamClient.listRoles()).Roles.filter(role =>
            (role.AssumeRolePolicyDocument ?? '').includes('bullet')
        )
        const outState = await promptForProperty(
            state,
            'accessRole',
            resp.map(role => ({ label: role.RoleName, metadata: role.Arn })),
            undefined,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
            }
        )

        return { nextState: outState }
    }

    private static buildCommandStep: StateStepFunction<CreateServiceState> = async state => {
        const buildCommandMap = {
            python: 'pip install -r requirements.txt',
            node: 'npm install',
        } as { [key: string]: string }
        const outState = await promptForPropertyInput(state, 'buildCommand', undefined, {
            title: localize('AWS.apprunner.createService.buildCommand.title', 'Enter a build command'),
            ignoreFocusOut: true,
            placeHolder:
                buildCommandMap[
                    Object.keys(buildCommandMap).filter(key => state.runtime!.toLowerCase().includes(key))[0]
                ],
        })

        return { nextState: outState }
    }

    private static startCommandStep: StateStepFunction<CreateServiceState> = async state => {
        const startCommandMap = {
            python: 'python runapp.py',
            node: 'node app.js',
        } as { [key: string]: string }
        const outState = await promptForPropertyInput(state, 'startCommand', undefined, {
            title: localize('AWS.apprunner.createService.startCommand.title', 'Enter a start command'),
            ignoreFocusOut: true,
            placeHolder:
                startCommandMap[
                    Object.keys(startCommandMap).filter(key => state.runtime!.toLowerCase().includes(key))[0]
                ],
        })

        return { nextState: outState }
    }

    private static instanceConfigStep: StateStepFunction<CreateServiceState> = async state => {
        const enumerations = [
            [1, 2],
            [1, 3],
            [2, 4],
        ]

        const outState = await promptForProperty(
            state,
            'instanceConfig',
            enumerations.map(e => ({
                label: `${e[0]} vCPU${e[0] > 1 ? 's' : ''}, ${e[1]} GBs Memory`,
                metadata: { cpu: e[0], mem: e[1] },
            })),
            undefined,
            {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.apprunner.createService.selectInstanceConfig.title',
                    'Select instance configuration'
                ),
            }
        )

        return { nextState: outState }
    }
}
