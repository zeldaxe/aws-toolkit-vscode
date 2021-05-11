/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as os from 'os'
import * as vscode from 'vscode'

import * as picker from '../../shared/ui/picker'
import { addCodiconToString } from '../utilities/textUtilities'
import { getLogger } from '../logger/logger'

export interface WizardStep {
    (stepNumber: number): Thenable<Transition>
}

export interface Transition {
    nextState: WizardNextState
    nextStep?: WizardStep
}

export enum WizardNextState {
    /** Instruct the wizard to continue to a new step. Consider using the helper function {@link wizardContinue} instead. */
    CONTINUE,
    /** Instruct the wizard to retry the current step. Consider using the const {@link WIZARD_RETRY} instead. */
    RETRY,
    /** Instruct the wizard to go back to the previous step. Consider using the const{@link WIZARD_GOBACK} instead. */
    GO_BACK,
    /** Instruct the wizard to terminate. Consider using the const {@link WIZARD_TERMINATE} instead. */
    TERMINATE,
}

export const WIZARD_RETRY: Transition = {
    nextState: WizardNextState.RETRY,
}

export const WIZARD_TERMINATE: Transition = {
    nextState: WizardNextState.TERMINATE,
}

export const WIZARD_GOBACK: Transition = {
    nextState: WizardNextState.GO_BACK,
}

export function wizardContinue(step: WizardStep): Transition {
    return {
        nextState: WizardNextState.CONTINUE,
        nextStep: step,
    }
}

export abstract class MultiStepWizard<TResult> {
    protected constructor() {}

    public async run(): Promise<TResult | undefined> {
        let steps: WizardStep[] = [this.startStep]

        // in a wizard, it only make sense to go forwards to an arbitrary step, or backwards in history
        while (steps.length > 0) {
            const step = steps[steps.length - 1]
            // non-terminal if we still have steps
            if (step === undefined) {
                getLogger().warn('encountered an undefined step, terminating wizard')
                break
            }
            const result = await step(steps.length)

            switch (result.nextState) {
                case WizardNextState.TERMINATE:
                    // success/failure both handled by getResult()
                    steps = []
                    break
                case WizardNextState.RETRY:
                    // retry the current step
                    break
                case WizardNextState.GO_BACK:
                    // let history unwind
                    steps.pop()
                    break
                case WizardNextState.CONTINUE:
                    // push the next step to run
                    steps.push(result.nextStep!)
                    break
                default:
                    throw new Error(`unhandled transition in MultiStepWizard: ${result.nextState}`)
            }
        }

        return this.getResult()
    }

    protected abstract get startStep(): WizardStep

    protected abstract getResult(): TResult | undefined
}

export interface FolderQuickPickItem extends vscode.QuickPickItem {
    getUri(): Thenable<vscode.Uri | undefined>
}

export class WorkspaceFolderQuickPickItem implements FolderQuickPickItem {
    public readonly label: string

    public constructor(private readonly folder: vscode.WorkspaceFolder) {
        this.label = addCodiconToString('root-folder-opened', folder.name)
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        return this.folder.uri
    }
}

export class WizardContext {
    public readonly showOpenDialog = vscode.window.showOpenDialog
    public get workspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
        return vscode.workspace.workspaceFolders
    }
}

export class BrowseFolderQuickPickItem implements FolderQuickPickItem {
    public alwaysShow: boolean = true

    public constructor(private readonly context: WizardContext, public readonly detail: string) {}

    public get label(): string {
        if (this.context.workspaceFolders && this.context.workspaceFolders.length > 0) {
            return addCodiconToString(
                'folder-opened',
                localize('AWS.initWizard.location.select.folder', 'Select a different folder...')
            )
        }

        return localize(
            'AWS.initWizard.location.select.folder.empty.workspace',
            'There are no workspace folders open. Select a folder...'
        )
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        const workspaceFolders = this.context.workspaceFolders
        const defaultUri =
            !!workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : vscode.Uri.file(os.homedir())

        const result = await this.context.showOpenDialog({
            defaultUri,
            openLabel: localize('AWS.samcli.initWizard.name.browse.openLabel', 'Open'),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        })

        if (!result || !result.length) {
            return undefined
        }

        return result[0]
    }
}

export async function promptUserForLocation(
    context: WizardContext,
    additionalParams?: {
        helpButton?: { button: vscode.QuickInputButton; url: string }
        overrideText?: { detail?: string; title?: string }
        step?: number
        totalSteps?: number
    }
): Promise<vscode.Uri | undefined> {
    const items: FolderQuickPickItem[] = (context.workspaceFolders || [])
        .map<FolderQuickPickItem>(f => new WorkspaceFolderQuickPickItem(f))
        .concat([
            new BrowseFolderQuickPickItem(
                context,
                additionalParams?.overrideText?.detail
                    ? additionalParams.overrideText.detail
                    : localize(
                          'AWS.wizard.location.select.folder.detail',
                          'The selected folder will be added to the workspace.'
                      )
            ),
        ])

    const quickPick = picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: additionalParams?.overrideText?.title
                ? additionalParams.overrideText.title
                : localize('AWS.wizard.location.prompt', 'Select a workspace folder for your new project'),
            step: additionalParams?.step,
            totalSteps: additionalParams?.totalSteps,
        },
        items: items,
        buttons: [
            ...(additionalParams?.helpButton ? [additionalParams.helpButton.button] : []),
            vscode.QuickInputButtons.Back,
        ],
    })

    const choices = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === additionalParams?.helpButton?.button) {
                vscode.env.openExternal(vscode.Uri.parse(additionalParams.helpButton.url))
            }
        },
    })
    const pickerResponse = picker.verifySinglePickerOutput<FolderQuickPickItem>(choices)

    if (!pickerResponse) {
        return undefined
    }

    if (pickerResponse instanceof BrowseFolderQuickPickItem) {
        const browseFolderResult = await pickerResponse.getUri()

        // If user cancels from Open Folder dialog, send them back to the folder picker.
        return browseFolderResult ? browseFolderResult : await promptUserForLocation(context, additionalParams)
    }

    return pickerResponse.getUri()
}

export interface StateMacineStep<TState> {
    nextState?: TState
    nextSteps?: StateStepFunction<TState>[]
}

export interface ExtendedMachineState {
    currentStep: number
    totalSteps: number
    /** Errors are injected into the current state if the next state failed */
    /** This essentially allows steps to communicate to previous steps */
    error?: Error
    // TODO: design step specific state
    stepSpecific?: { [key: string]: any }
}

export type StateStepFunction<TState> = (state: TState, lastState?: TState) => Promise<StateMacineStep<TState>>
export type MachineState<TState> = TState & ExtendedMachineState
/**
 * A multi-step wizard controller. Very fancy, very cool.
 * TODO: add forward-state preservation
 * anonymous branches may need to be convrted to SMCs upon their addition
 */
export class StateMachineController<TState, TResult> {
    private previousStates: MachineState<TState>[] = []
    private extraSteps = new Map<number, number>()
    private steps: StateStepFunction<MachineState<TState>>[] = []
    private internalStep = 0
    private state!: MachineState<TState>
    private finalState: MachineState<TState> | undefined

    public constructor(
        private outputResult: (state: MachineState<TState>) => TResult,
        initState?: TState | MachineState<TState>
    ) {
        this.setState(initState)
    }

    public setState<AltTState>(state?: AltTState) {
        this.state = { ...state } as MachineState<TState>
        this.state.currentStep = this.state.currentStep ?? 1
        this.state.totalSteps = (this.steps.length ?? 0) + (this.state.totalSteps ?? 0)
    }

    public reset() {
        // Clean up state so the wizard can be reused
        this.state = this.previousStates[0]
        this.previousStates = this.previousStates.slice(0, 1)
        this.internalStep = 0
        this.extraSteps.clear()
    }

    public addStep(step: StateStepFunction<MachineState<TState>>): void

    public addStep<AltTState, AltTResult>(
        machine: StateMachineController<AltTState, AltTResult>,
        nextState: (state: MachineState<AltTState>, result: AltTResult | undefined) => MachineState<TState>,
        nextSteps: (
            state: MachineState<AltTState>,
            result: AltTResult | undefined
        ) => StateStepFunction<MachineState<TState>>[]
    ): void

    /** Adds a single step to the state machine. A step can also be another state machine. */
    public addStep<AltTState, AltTResult>(
        step: StateStepFunction<MachineState<TState>> | StateMachineController<AltTState, AltTResult>,
        nextState?: (state: MachineState<AltTState>, result: AltTResult | undefined) => MachineState<TState>,
        nextSteps?: (
            state: MachineState<AltTState>,
            result: AltTResult | undefined
        ) => StateStepFunction<MachineState<TState>>[]
    ): void {
        if (typeof step === 'function') {
            this.steps.push(step)
        } else if (typeof step === 'object' && step.internalStep !== undefined) {
            this.steps.push(async state => {
                step.setState(state)
                step.rollback()
                const result = await step.run()
                const finalState = step.finalState
                if (finalState !== undefined) {
                    finalState.currentStep -= 1
                    finalState.totalSteps -= 1
                    return {
                        nextState: nextState!(finalState, result),
                        nextSteps: nextSteps!(finalState, result),
                    }
                } else {
                    return { nextState: undefined }
                }
            })
        } else {
            throw Error('Invalid wizard step')
        }
        this.state.totalSteps += 1
    }

    public getFinalState(): MachineState<TState> | undefined {
        return this.finalState ? { ...this.finalState } : undefined
    }

    public rollback(): void {
        if (this.internalStep === 0) {
            return
        }

        if (this.extraSteps.has(this.internalStep)) {
            this.steps.splice(this.internalStep, this.extraSteps.get(this.internalStep))
            this.extraSteps.delete(this.internalStep)
        }

        this.state = this.previousStates.pop()!
        this.internalStep -= 1
    }

    /**
     * Runs the added steps until termination or failure
     */
    public async run(): Promise<TResult | undefined> {
        if (this.previousStates.length === 0) {
            this.previousStates.push({ ...this.state })
        }
        this.finalState = undefined

        while (this.internalStep < this.steps.length) {
            try {
                const stepOutput = await this.steps[this.internalStep](this.state)

                if (stepOutput.nextState === undefined) {
                    if (this.internalStep === 0) {
                        return undefined
                    }

                    this.rollback()
                } else {
                    if (stepOutput.nextState.error !== undefined) {
                        throw stepOutput.nextState.error
                    }

                    this.previousStates.push({ ...stepOutput.nextState })
                    this.state = stepOutput.nextState
                    this.state.stepSpecific = undefined
                    this.internalStep += 1
                    this.state.currentStep += 1

                    if (stepOutput.nextSteps !== undefined && stepOutput.nextSteps.length > 0) {
                        this.steps.splice(this.internalStep, 0, ...stepOutput.nextSteps)
                        this.extraSteps.set(this.internalStep, stepOutput.nextSteps.length)
                        this.state.totalSteps += stepOutput.nextSteps.length
                    }
                }
            } catch (err) {
                if (this.state.error !== undefined) {
                    this.state.error = err
                } else {
                    getLogger().debug('state machine controller: terminated due to unhandled exception %O', err)
                    throw { ...err, state: (err.state ?? []).concat([this.state]) }
                }
            }
        }

        const result = this.getResult()
        this.finalState = this.state

        return result
    }

    private getResult(): TResult {
        return this.outputResult(this.state)
    }
}
