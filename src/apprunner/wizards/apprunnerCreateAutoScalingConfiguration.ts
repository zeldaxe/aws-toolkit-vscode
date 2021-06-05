/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
import { ExtendedMachineState, MachineState, StateMachineController } from '../../shared/wizards/multiStepWizard'
import * as vscode from 'vscode'
import { AppRunner } from 'aws-sdk'
import { createHelpButton } from '../../shared/ui/buttons'
import { this.context.promptWithInputBox } from './apprunnerCreateServiceWizard'

const localize = nls.loadMessageBundle()

type CreateAutoScalingState = MachineState<{
    name?: string
    maxConcurrency?: number
    maxInstances?: number
    minInstances?: number
    helpButton: vscode.QuickInputButton
}>

export class CreateAppRunnerServiceWizard extends StateMachineController<
    Omit<CreateAutoScalingState, keyof ExtendedMachineState>,
    AppRunner.CreateAutoScalingConfigurationRequest
> {
    public constructor(private readonly defaultRegion: string) {
        super(state => CreateAppRunnerServiceWizard.stateToResult(state), {
            initState: {
                helpButton: createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation')),
            },
        })

        const minValue = (value: string, minValue: number = 0) => {
            if (!value || typeof value !== 'number' || value <= minValue) {
                return localize('AWS.apprunner.naturalinputs', `Input must be greater than {0}`, minValue)
            }

            return undefined
        }

        this.addStep(async state => {
            const validateName = (name: string) => {
                if (!name || name.length < 4) {
                    return localize(
                        'AWS.apprunner.createService.name.validation',
                        'Service names must be at least 4 characters'
                    )
                }

                return undefined
            }

            const response = await this.context.promptWithInputBox('name', validateName, {
                title: localize('AWS.apprunner.createService.name.title', 'Name your config'),
                ignoreFocusOut: true,
            })
            return { nextState: state }
        })

        this.addStep(async state => {
            const response = await this.context.promptWithInputBox('maxConcurrency', minValue, {
                title: localize('AWS.apprunner.createService.name.title', 'Enter max concurrency'),
                ignoreFocusOut: true,
            })
            return { nextState: state }
        })

        this.addStep(async state => {
            const response = await this.context.promptWithInputBox('maxInstances', minValue, {
                title: localize('AWS.apprunner.createService.name.title', 'Name your config'),
                ignoreFocusOut: true,
            })
            return { nextState: state }
        })

        this.addStep(async state => {
            const response = await this.context.promptWithInputBox(
                state,
                'minInstances',
                v => minValue(v, state.maxInstances),
                {
                    title: localize('AWS.apprunner.createService.name.title', 'Name your config'),
                    ignoreFocusOut: true,
                }
            )
            return { nextState: state }
        })
    }

    private static stateToResult(state: CreateAutoScalingState): AppRunner.CreateAutoScalingConfigurationRequest {
        const result: AppRunner.CreateAutoScalingConfigurationRequest = {
            AutoScalingConfigurationName: state.name!,
            MaxConcurrency: state.maxConcurrency!,
            MaxSize: state.maxInstances,
            MinSize: state.minInstances,
        }

        return JSON.parse(JSON.stringify(result))
    }
}
