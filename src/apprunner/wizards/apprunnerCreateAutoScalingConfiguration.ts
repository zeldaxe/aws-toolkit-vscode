/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
import { ExtendedMachineState, MachineState, StateMachineController } from '../../shared/wizards/multiStepWizard'
import * as vscode from 'vscode'
import * as AppRunner from '../models/apprunner'
import { createHelpButton } from '../../shared/ui/buttons'
import { promptForPropertyWithInputBox } from './wizardpart2'

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

            const outState = await promptForPropertyWithInputBox(state, 'name', validateName, {
                title: localize('AWS.apprunner.createService.name.title', 'Name your config'),
                ignoreFocusOut: true,
            })
            return { nextState: outState }
        })

        this.addStep(async state => {
            const outState = await promptForPropertyWithInputBox(state, 'maxConcurrency', minValue, {
                title: localize('AWS.apprunner.createService.name.title', 'Enter max concurrency'),
                ignoreFocusOut: true,
            })
            return { nextState: outState }
        })

        this.addStep(async state => {
            const outState = await promptForPropertyWithInputBox(state, 'maxInstances', minValue, {
                title: localize('AWS.apprunner.createService.name.title', 'Name your config'),
                ignoreFocusOut: true,
            })
            return { nextState: outState }
        })

        this.addStep(async state => {
            const outState = await promptForPropertyWithInputBox(
                state,
                'minInstances',
                v => minValue(v, state.maxInstances),
                {
                    title: localize('AWS.apprunner.createService.name.title', 'Name your config'),
                    ignoreFocusOut: true,
                }
            )
            return { nextState: outState }
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
