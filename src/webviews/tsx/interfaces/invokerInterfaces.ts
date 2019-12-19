/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidityField, vscode } from '../../utils'

export interface InvokerProps {
    vscode: vscode<InvokerState>
    initialState?: InvokerState
}

export interface InvokerState {
    region: ValidityField
    lambda: ValidityField
    template: ValidityField
    payload: ValidityField
}
