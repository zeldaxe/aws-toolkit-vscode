/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'
import { CreateAppRunnerServiceWizard } from '../wizards/apprunnerCreateServiceWizard'

export async function createAppRunnerService(region: string): Promise<AppRunner.CreateServiceRequest | undefined> {
    // Do all the error handling from the wizard here? this file is very empty
    const wizard = new CreateAppRunnerServiceWizard(region)
    const result = await wizard.run()
    return result
}
