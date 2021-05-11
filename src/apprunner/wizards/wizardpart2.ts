/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    ExtendedMachineState,
    MachineState,
    MultiStepWizard,
    StateMachineController,
    StateStepFunction,
    WizardContext,
    wizardContinue,
    WizardStep,
    WIZARD_GOBACK,
    WIZARD_TERMINATE,
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
    isPublic?: boolean
    iamClient: IamClient
    ecrClient: EcrClient
    helpButton: vscode.QuickInputButton
}>
// mutates a state's property
// very abstract
// TODO: add capacity for default
// need to differentiate between user hitting enter with no defined quick pick versus back button
// technically can support multiple selections if the state property takes an array
// TODO: picked data needs to be scrubbed upon reaching a new state (have step-specific state information??)
async function promptForProperty<TState extends ExtendedMachineState & { helpButton: vscode.QuickInputButton }, TProp>(
    state: TState,
    items: MetadataQuickPickItem<TProp>[],
    property: keyof TState,
    transformUserInput?: (input?: string) => TProp,
    options?: ExtendedQuickPickOptions
): Promise<TState | undefined> {
    const picked: MetadataQuickPickItem<any>[] = state.stepSpecific ? state.stepSpecific.picked : undefined
    const isUserInput = picked && picked[0].metadata === CUSTOM_USER_INPUT

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

    if (!isUserInput) {
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
        state.stepSpecific = { picked: [choice] }
        if (transformUserInput && choice.metadata === CUSTOM_USER_INPUT) {
            Object.defineProperty(state, property, { value: transformUserInput(choice.description), enumerable: true })
        } else {
            Object.defineProperty(state, property, { value: choice.metadata, enumerable: true })
        }
    }

    return choice ? state : undefined
}

async function promptForServiceName(state: CreateServiceState): Promise<string | undefined> {
    const inputBox = input.createInputBox({
        options: {
            title: localize('AWS.apprunner.createService.name.title', 'Name your service'),
            ignoreFocusOut: true,
            step: state.currentStep,
            totalSteps: state.totalSteps,
        },
        buttons: [state.helpButton, vscode.QuickInputButtons.Back],
    })

    return await input.promptUser({
        inputBox: inputBox,
        onValidateInput: (value: string) => {
            if (!value || value.length < 4) {
                return localize(
                    'AWS.apprunner.createService.name.validation',
                    'Service names must be at least 4 characters'
                )
            }

            return undefined
        },
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === state.helpButton) {
                // TODO: add URL
                vscode.env.openExternal(vscode.Uri.parse(''))
            }
        },
    })
}

async function promptForImageIdentifier(state: CreateServiceState): Promise<TaggedEcrRepository | undefined> {
    const imageRepos = await toArrayAsync(state.ecrClient.describeRepositories())

    const quickPick = createQuickPick<vscode.QuickPickItem & { repo: TaggedEcrRepository }>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
            step: state.currentStep,
            totalSteps: state.totalSteps,
            placeHolder: '111111111111.dkr.ecr.us-east-1.amazonaws.com/myrepo:latest',
            customUserInputLabel: 'Custom ECR URL',
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: imageRepos.map(repo => ({ label: repo.repositoryName, detail: repo.repositoryUri, repo: repo })),
    })

    const choices = await promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            }
        },
    })

    const result = verifySinglePickerOutput(choices)

    if (result?.repo === undefined) {
        const userInputParts = result?.description?.split(':')
        return userInputParts?.length === 2
            ? {
                  repositoryArn: '',
                  repositoryName: 'UserDefined',
                  repositoryUri: userInputParts[0],
                  tag: userInputParts[1],
              }
            : undefined
    }

    return result?.repo
}

async function promptForImageTag(state: CreateServiceState): Promise<string | undefined> {
    const imageTags = await toArrayAsync(state.ecrClient.describeTags(state.imageRepo!.repositoryName))

    const quickPick = createQuickPick<vscode.QuickPickItem>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select an ECR tag'),
            step: state.currentStep,
            totalSteps: state.totalSteps,
            placeHolder: 'latest',
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: imageTags.map(tag => ({ label: tag })),
    })

    const choices = await promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            }
        },
    })

    return verifySinglePickerOutput(choices)?.label
}

async function promptForPort(state: CreateServiceState): Promise<string | undefined> {
    const inputBox = input.createInputBox({
        options: {
            title: localize('AWS.apprunner.createService.selectPort.title', 'Enter a port for the new service'),
            ignoreFocusOut: true,
            step: state.currentStep,
            totalSteps: state.totalSteps,
            placeHolder: 'Enter a port',
        },
        buttons: [state.helpButton, vscode.QuickInputButtons.Back],
    })

    inputBox.value = DEFAULT_PORT

    return await input.promptUser({
        inputBox: inputBox,
        onValidateInput: (value: string) => {
            if (isNaN(Number(value)) || value === '') {
                return localize('AWS.apprunner.createService.selectPort.invalidPort', 'Port must be a number')
            }

            return undefined
        },
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === state.helpButton) {
                // TODO: add URL
                vscode.env.openExternal(vscode.Uri.parse(''))
            }
        },
    })
}

/**
 * The service formerly known as Fusion is supposedly planning on making the access role automatically
 * created. Right now it is incredibly cumbersome to ask users for this information.
 */
async function promptForAccessRole(state: CreateServiceState): Promise<string | undefined> {
    // TODO: don't actually do this to filter out access roles...
    const resp = (await state.iamClient.listRoles()).Roles.filter(role =>
        (role.AssumeRolePolicyDocument ?? '').includes('bullet')
    )

    const quickPick = createQuickPick<vscode.QuickPickItem & { arn: AppRunner.FusionResourceArn }>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
            value: '',
            step: state.currentStep,
            totalSteps: state.totalSteps,
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: resp.map(role => ({ label: role.RoleName, arn: role.Arn })),
    })

    const choices = await promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            }
        },
    })

    return verifySinglePickerOutput(choices)?.arn
}

async function promptForRuntime(state: CreateServiceState): Promise<AppRunnerRuntime | undefined> {
    const quickPick = createQuickPick<vscode.QuickPickItem & { runtime: AppRunnerRuntime }>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
            value: '',
            step: state.currentStep,
            totalSteps: state.totalSteps,
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: [
            // labels and runtimes are separate in case we want the user-facing name to be different
            { label: 'python3', runtime: 'PYTHON_3' },
            //{ label: 'nodejs10', runtime: 'nodejs10' },
            { label: 'nodejs12', runtime: 'NODEJS_12' },
        ],
    })

    const choices = await promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            }
        },
    })

    return verifySinglePickerOutput(choices)?.runtime
}

export class CreateAppRunnerServiceWizard extends StateMachineController<
    Omit<CreateServiceState, keyof ExtendedMachineState>,
    AppRunner.CreateServiceRequest
> {
    public constructor(private readonly defaultRegion: string) {
        super(state => CreateAppRunnerServiceWizard.stateToResult(state), {
            iamClient: ext.toolkitClientBuilder.createIamClient(defaultRegion),
            ecrClient: ext.toolkitClientBuilder.createEcrClient(defaultRegion),
            helpButton: createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation')),
        })
        this.addStep(CreateAppRunnerServiceWizard.nameStep)
        this.addStep(CreateAppRunnerServiceWizard.sourceStep)
        this.addStep(CreateAppRunnerServiceWizard.portStep)
    }

    // TODO: verify that these things are actually defined...
    private static stateToResult(state: CreateServiceState): AppRunner.CreateServiceRequest {
        const result: AppRunner.CreateServiceRequest = {
            ServiceName: state.name!,
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
                                      BuildCommand: 'npm install', // PROMPT FOR THESE
                                      StartCommand: 'node server.js',
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
        state.name = await promptForServiceName(state)
        return { nextState: state.name !== undefined ? state : undefined }
    }

    private static sourceStep: StateStepFunction<CreateServiceState> = async state => {
        //state.source = await promptForSourceType(state)
        const outState = await promptForProperty(
            state,
            [
                { label: 'ECR', metadata: 'ECR' },
                { label: 'ECR2', metadata: 'ECR' },
                { label: 'ECR3', metadata: 'ECR' },
                //{ label: 'Public ECR', sourceType: 'ECR-Public' },
                { label: 'Repository', metadata: 'Repository' },
            ],
            'source',
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
            remotes.map((remote: any) => ({ label: remote.name, detail: remote.fetchUrl, metadata: remote })),
            'repository',
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
            nextSteps: [CreateAppRunnerServiceWizard.branchStep, CreateAppRunnerServiceWizard.runtimeStep],
        }
    }

    private static branchStep: StateStepFunction<CreateServiceState> = async state => {
        const branches = await getBranchesForRemote(await getApiForGit(), state.repository!)
        const outState = await promptForProperty(
            state,
            branches
                .filter(b => b.name !== '')
                .map((branch: any) => ({
                    label: branch.name.replace(state.repository!.name + '/', ''),
                    metadata: branch,
                })),
            'branch',
            undefined,
            {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectBranch.title', 'Select a branch'),
            }
        )
        return { nextState: outState }
    }

    private static runtimeStep: StateStepFunction<CreateServiceState> = async state => {
        state.runtime = await promptForRuntime(state)
        return { nextState: state.runtime ? state : undefined }
    }

    private static imageStep: StateStepFunction<CreateServiceState> = async state => {
        state.imageRepo = await promptForImageIdentifier(state)
        return {
            nextState: state.imageRepo ? state : undefined,
            nextSteps: state.imageRepo?.tag ? undefined : [CreateAppRunnerServiceWizard.tagStep],
        }
    }

    private static tagStep: StateStepFunction<CreateServiceState> = async state => {
        state.imageRepo!.tag = await promptForImageTag(state)

        // If this is a public image then we can skip asking for a role
        if (state.imageRepo && state.imageRepo.repositoryUri.search(/$public.ecr.aws/) !== -1) {
            state.isPublic = true
        }

        return {
            nextState: state.imageRepo?.tag ? state : undefined,
            nextSteps: state.isPublic !== true ? [CreateAppRunnerServiceWizard.roleStep] : undefined,
        }
    }

    private static portStep: StateStepFunction<CreateServiceState> = async state => {
        state.port = await promptForPort(state)
        return { nextState: state.port ? state : undefined }
    }

    private static roleStep: StateStepFunction<CreateServiceState> = async state => {
        state.accessRole = await promptForAccessRole(state)
        return { nextState: state.accessRole ? state : undefined }
    }
}
