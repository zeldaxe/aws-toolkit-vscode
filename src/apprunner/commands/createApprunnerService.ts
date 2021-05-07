/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { MultiStepWizard } from '../../shared/wizards/multiStepWizard'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import AppRunner = require('../models/apprunner')
import * as nls from 'vscode-nls'
import {
    CreateAppRunnerServiceWizard,
    DefaultAppRunnerCreateServiceWizardContext,
} from '../wizards/apprunnerCreateServiceWizard'
const localize = nls.loadMessageBundle()

export async function createAppRunnerService(): Promise<AppRunner.CreateServiceRequest | undefined> {
    // Do all the error handling from the wizard here? this file is very empty
    const wizard = new CreateAppRunnerServiceWizard(new DefaultAppRunnerCreateServiceWizardContext('us-east-1'))
    const result = await wizard.run()
    return result
}
