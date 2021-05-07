/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    MultiStepWizard,
    NewMultiStepWizard,
    WizardContext,
    wizardContinue,
    WizardState,
    WizardStep,
    WIZARD_GOBACK,
    WIZARD_TERMINATE,
} from '../../shared/wizards/multiStepWizard'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import AppRunner = require('../models/apprunner')
import * as nls from 'vscode-nls'
import { createHelpButton } from '../../shared/ui/buttons'
import * as input from '../../shared/ui/input'
import { ext } from '../../shared/extensionGlobals'
import { IAM } from 'aws-sdk'
import { IamClient } from '../../shared/clients/iamClient'
import { String } from 'aws-sdk/clients/lambda'
import { stat } from 'fs-extra'

const localize = nls.loadMessageBundle()

/**
 * Contains a number of prompts for user input
 */
interface AppRunnerCreateConnectionWizardContext {
    promptForAuthorization(): Promise<void>
}

export class DefaultAppRunnerCreateConnectionWizardContext
    extends WizardContext
    implements AppRunnerCreateConnectionWizardContext {
    private readonly helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))

    private readonly totalSteps = 2
    private additionalSteps: number = 0

    public constructor(private readonly defaultRegion: string) {
        super()
    }

    // TODO: direct user to AWS console to finish authorizing the connection
    // https://console.aws.amazon.com/codesuite/settings/connections
    promptForAuthorization(): Promise<void> {
        throw new Error('Method not implemented.')
    }
}

async function promptForConnectionName(
    currentStep: number,
    totalSteps: number,
    lastValue?: string
): Promise<string | undefined> {
    const inputBox = input.createInputBox({
        options: {
            title: localize('AWS.apprunner.createConnection.connectionName.title', 'Name your state machine'),
            ignoreFocusOut: true,
            step: currentStep,
            totalSteps: totalSteps,
            value: lastValue,
        },
        buttons: [vscode.QuickInputButtons.Back],
    })

    return await input.promptUser({
        inputBox: inputBox,
        onValidateInput: (value: string) => {
            if (!value) {
                return localize(
                    'AWS.stepFunctions.publishWizard.stateMachineName.validation.empty',
                    'State machine name cannot be empty'
                )
            }

            return undefined
        },
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            }
        },
    })
}

interface ConnectionState {
    name: string
    name2: string
}

function MapStateToRequest(state: WizardState<ConnectionState>): AppRunner.CreateConnectionRequest {
    return {
        ConnectionName: state.name,
        ProviderType: 'GITHUB',
    }
}

export function makeApprunnerConnectionWizard(): NewMultiStepWizard<
    ConnectionState,
    AppRunner.CreateConnectionRequest
> {
    const wizard = new NewMultiStepWizard(MapStateToRequest)
    const nameStep = async (state: WizardState<ConnectionState>) => {
        state.name = (await promptForConnectionName(state.currentStep, state.totalSteps, state.name))!
        return { nextState: state.name === undefined ? undefined : state }
    }

    const nameStep2 = async (state: WizardState<ConnectionState>) => {
        const wizard2 = new NewMultiStepWizard(MapStateToRequest, state)
        wizard2.addStep(nameStep)
        wizard2.addStep(nameStep)
        wizard2.addStep(nameStep)
        wizard2.addStep(nameStep)
        const r = await wizard2.run()
        state = wizard2.getFinalState()!
        if (state) {
            state.name2 = r?.ConnectionName!
            state.currentStep -= 1
            state.totalSteps -= 1
        }
        return {
            nextState: state?.name2 === undefined ? undefined : state,
            nextSteps: state?.name2 === 'yes' ? [nameStep2] : [nameStep, nameStep],
        }
    }

    wizard.addStep(nameStep)
    wizard.addStep(nameStep)
    wizard.addStep(nameStep2)
    wizard.addStep(nameStep2)

    return wizard
}
