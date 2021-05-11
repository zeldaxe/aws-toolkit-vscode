/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    MultiStepWizard,
    WizardContext,
    wizardContinue,
    WizardStep,
    WIZARD_GOBACK,
    WIZARD_TERMINATE,
} from '../../shared/wizards/multiStepWizard'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
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

/**
 * Contains a number of prompts for user input
 */
interface AppRunnerCreateServiceWizardContext {
    promptForServiceName(): Promise<string | undefined>
    promptForSourceType(): Promise<AppRunnerSourceType | undefined>
    promptForImageIdentifier(): Promise<TaggedEcrRepository | undefined>
    promptForImageTag(ecrRepo: EcrRepository): Promise<string | undefined>
    promptForRepository(): Promise<Remote | undefined>
    promptForBranch(remote: Remote): Promise<Branch | undefined>
    promptForRuntime(): Promise<AppRunnerRuntime | undefined>
    promptForPort(): Promise<string | undefined>
    promptForAccessRole(): Promise<string | undefined>
}

export class DefaultAppRunnerCreateServiceWizardContext
    extends WizardContext
    implements AppRunnerCreateServiceWizardContext
{
    // TODO: link help button to docs specifically to the service formerly known as Fusion
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))
    //private iamRoles: IAM.roleListType | undefined
    private readonly iamClient: IamClient
    private readonly ecrClient: EcrClient
    private readonly totalSteps = 4
    private additionalSteps: number = 0

    public constructor(private readonly defaultRegion: string) {
        super()
        this.iamClient = ext.toolkitClientBuilder.createIamClient(this.defaultRegion)
        this.ecrClient = ext.toolkitClientBuilder.createEcrClient(this.defaultRegion)
    }
    public async promptForRepository(): Promise<any | undefined> {
        this.additionalSteps = 2 // Have to prompt for branch + runtime now
        const remotes = getRemotes(await getApiForGit())

        const quickPick = createQuickPick<vscode.QuickPickItem & { remote: Remote }>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.apprunner.createService.selectRepository.title',
                    'Select a remote GitHub repository'
                ),
                step: 3,
                totalSteps: this.totalSteps + this.additionalSteps,
                placeHolder: localize(
                    'AWS.apprunner.createService.selectRepository.placeholder',
                    'Select a remote repository or enter a URL'
                ),
                customUserInputLabel: 'GitHub URL',
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: remotes.map((remote: Remote) => ({ label: remote.name, detail: remote.fetchUrl, remote: remote })),
        })

        const choices = await promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })

        const choice = verifySinglePickerOutput(choices)

        if (choice?.remote === undefined && choice?.description !== undefined) {
            return { name: 'UserRemote', isReadOnly: true, fetchUrl: choice.description } as Remote
        }

        return choice?.remote
    }

    public async promptForBranch(remote: Remote): Promise<Branch | undefined> {
        const branches = await getBranchesForRemote(await getApiForGit(), remote)

        const quickPick = createQuickPick<vscode.QuickPickItem & { branch: Branch }>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectBranch.title', 'Select a branch'),
                step: 4,
                totalSteps: this.totalSteps + this.additionalSteps,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: branches.map((branch: any) => ({ label: branch.name, branch: branch })),
        })

        const choices = await promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })

        return verifySinglePickerOutput(choices)?.branch
    }

    public async promptForServiceName(): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.apprunner.createService.name.title', 'Name your service'),
                ignoreFocusOut: true,
                step: 1,
                totalSteps: this.totalSteps + this.additionalSteps,
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
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
                } else if (button === this.helpButton) {
                    // TODO: add URL
                    vscode.env.openExternal(vscode.Uri.parse(''))
                }
            },
        })
    }

    public async promptForSourceType(): Promise<AppRunnerSourceType | undefined> {
        this.additionalSteps = 0
        const quickPick = createQuickPick<vscode.QuickPickItem & { sourceType: AppRunnerSourceType }>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
                value: '',
                step: 2,
                totalSteps: this.totalSteps + this.additionalSteps,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: [
                { label: 'ECR', sourceType: 'ECR' },
                { label: 'Public ECR', sourceType: 'ECR-Public' },
                { label: 'Repository', sourceType: 'Repository' },
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

        return verifySinglePickerOutput(choices)?.sourceType
    }

    public async promptForImageIdentifier(): Promise<TaggedEcrRepository | undefined> {
        const imageRepos = await toArrayAsync(this.ecrClient.describeRepositories())

        const quickPick = createQuickPick<vscode.QuickPickItem & { repo: TaggedEcrRepository }>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
                step: 3 + this.additionalSteps,
                totalSteps: this.totalSteps + this.additionalSteps,
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

    public async promptForImageTag(ecrRepo: EcrRepository): Promise<string | undefined> {
        const imageTags = await toArrayAsync(this.ecrClient.describeTags(ecrRepo.repositoryName))

        const quickPick = createQuickPick<vscode.QuickPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
                step: 3 + this.additionalSteps,
                totalSteps: this.totalSteps + this.additionalSteps,
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

        return verifySinglePickerOutput(choices)?.label ?? 'latest'
    }

    public async promptForPort(): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            options: {
                title: localize('AWS.apprunner.createService.selectPort.title', 'Enter a port for the new service'),
                ignoreFocusOut: true,
                step: 4 + this.additionalSteps,
                totalSteps: this.totalSteps + this.additionalSteps,
                placeHolder: 'Enter a port',
            },
            buttons: [this.helpButton, vscode.QuickInputButtons.Back],
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
                } else if (button === this.helpButton) {
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
    public async promptForAccessRole(currRoleArn?: string): Promise<string | undefined> {
        this.additionalSteps = 1
        // TODO: don't actually do this to filter out access roles...
        const resp = (await this.iamClient.listRoles()).Roles.filter(role =>
            (role.AssumeRolePolicyDocument ?? '').includes('bullet')
        )

        const quickPick = createQuickPick<vscode.QuickPickItem & { arn: AppRunner.FusionResourceArn }>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
                value: '',
                step: 3,
                totalSteps: this.totalSteps + this.additionalSteps,
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

    public async promptForRuntime(): Promise<AppRunnerRuntime | undefined> {
        const quickPick = createQuickPick<vscode.QuickPickItem & { runtime: AppRunnerRuntime }>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.apprunner.createService.selectAccessRole.title', 'Select ECR access role'),
                value: '',
                step: 5,
                totalSteps: this.totalSteps + this.additionalSteps,
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
}

export class CreateAppRunnerServiceWizard extends MultiStepWizard<AppRunner.CreateServiceRequest> {
    private name?: string
    private source?: AppRunnerSourceType
    private imageRepo?: TaggedEcrRepository
    private port?: string
    private accessRole?: string
    private repository?: Remote
    private branch?: Branch
    private runtime?: AppRunnerRuntime

    public constructor(private readonly context: AppRunnerCreateServiceWizardContext) {
        super()
    }

    protected get startStep() {
        return this.NAME_ACTION
    }

    // TODO: verify that these things are actually defined...
    protected getResult(): AppRunner.CreateServiceRequest {
        const result: AppRunner.CreateServiceRequest = {
            ServiceName: this.name!,
            SourceConfiguration: {
                CodeRepository:
                    this.source === 'Repository'
                        ? {
                              RepositoryUrl: this.repository!.fetchUrl!,
                              SourceCodeVersion: {
                                  Type: 'BRANCH', // don't trust the provided model...
                                  Value: this.branch!.name!.replace(`${this.repository!.name}/`, ''),
                              },
                              CodeConfiguration: {
                                  ConfigurationSource: 'API', // TODO: check for apprunner.yaml (do it for the user by checking either local root or remote root)
                                  CodeConfigurationValues: {
                                      Port: this.port!,
                                      Runtime: this.runtime!,
                                      BuildCommand: 'npm install', // PROMPT FOR THESE
                                      StartCommand: 'node server.js',
                                  },
                              },
                          }
                        : undefined,
                ImageRepository:
                    this.source === 'ECR' || this.source === 'ECR-Public'
                        ? {
                              ImageIdentifier: `${this.imageRepo?.repositoryUri}:${this.imageRepo?.tag}`,
                              ImageConfiguration: {
                                  Port: this.port!,
                              },
                              ImageRepositoryType: this.source!,
                          }
                        : undefined,
                AuthenticationConfiguration:
                    this.source === 'ECR' || this.source === 'Repository'
                        ? {
                              AccessRoleArn: this.source === 'ECR' ? this.accessRole : undefined,
                              // TODO: either prompt user for connection (bad) or store have some persistence
                              //ConnectionArn: this.source === 'Repository' ? this.connection : undefined,
                              ConnectionArn:
                                  this.source === 'Repository'
                                      ? 'arn:aws:apprunner:us-east-1:794366244892:connection/fooosion/bfbf12b8f3fb4f8c8f2032298f5bf364'
                                      : undefined,
                          }
                        : undefined,
            },
        }

        return JSON.parse(JSON.stringify(result))
    }

    private readonly NAME_ACTION: WizardStep = async () => {
        this.name = await this.context.promptForServiceName()
        return this.name ? wizardContinue(this.SOURCE_ACTION) : WIZARD_TERMINATE
    }

    private readonly SOURCE_ACTION: WizardStep = async () => {
        this.source = await this.context.promptForSourceType()
        if (this.source === 'Repository') {
            return wizardContinue(this.REPOSITORY_ACTION)
        } else if (this.source === 'ECR') {
            return wizardContinue(this.IMAGE_ACTION)
        }
        return this.source ? wizardContinue(this.ROLE_ACTION) : WIZARD_GOBACK
    }

    private readonly REPOSITORY_ACTION: WizardStep = async () => {
        this.repository = await this.context.promptForRepository()
        return this.repository ? wizardContinue(this.BRANCH_ACTION) : WIZARD_GOBACK
    }

    private readonly BRANCH_ACTION: WizardStep = async () => {
        this.branch = await this.context.promptForBranch(this.repository!)
        return this.branch ? wizardContinue(this.RUNTIME_ACTION) : WIZARD_GOBACK
    }

    private readonly RUNTIME_ACTION: WizardStep = async () => {
        this.runtime = await this.context.promptForRuntime()
        return this.runtime ? wizardContinue(this.PORT_ACTION) : WIZARD_GOBACK
    }

    private readonly IMAGE_ACTION: WizardStep = async () => {
        this.imageRepo = await this.context.promptForImageIdentifier()
        // User may have inputted an ECR URL not associated with their account
        if (this.imageRepo?.tag !== undefined) {
            return wizardContinue(this.PORT_ACTION)
        }

        return this.imageRepo ? wizardContinue(this.IMAGE_TAG_ACTION) : WIZARD_GOBACK
    }

    private readonly IMAGE_TAG_ACTION: WizardStep = async () => {
        this.imageRepo!.tag = await this.context.promptForImageTag(this.imageRepo!)
        console.log(this.imageRepo)
        // If this is a public image then we can skip asking for a role
        if (this.imageRepo && this.imageRepo.repositoryUri.search(/$public.ecr.aws/) !== -1) {
            return this.imageRepo!.tag ? wizardContinue(this.PORT_ACTION) : WIZARD_GOBACK
        }
        return this.imageRepo!.tag ? wizardContinue(this.ROLE_ACTION) : WIZARD_GOBACK
    }

    private readonly PORT_ACTION: WizardStep = async () => {
        this.port = await this.context.promptForPort()
        return this.port ? WIZARD_TERMINATE : WIZARD_GOBACK
    }

    private readonly ROLE_ACTION: WizardStep = async () => {
        this.accessRole = await this.context.promptForAccessRole()
        return this.accessRole ? wizardContinue(this.PORT_ACTION) : WIZARD_GOBACK
    }
}
