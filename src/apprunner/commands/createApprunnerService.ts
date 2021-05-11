/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { MultiStepWizard } from '../../shared/wizards/multiStepWizard'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import * as AppRunner from '../models/apprunner'
import * as nls from 'vscode-nls'
import { CreateAppRunnerServiceWizard } from '../wizards/wizardpart2'
const localize = nls.loadMessageBundle()

export async function createAppRunnerService(): Promise<AppRunner.CreateServiceRequest | undefined> {
    // Do all the error handling from the wizard here? this file is very empty
    const wizard = new CreateAppRunnerServiceWizard('us-east-1')
    const result = await wizard.run()
    return result
}
