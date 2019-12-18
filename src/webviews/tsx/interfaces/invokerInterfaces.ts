/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { vscode } from '../../utils'

export interface InvokerProps {
    vscode: vscode<InvokerState>
    initialState?: InvokerState
}

export interface InvokerState {
    region: InvokerField
    lambda: InvokerField
    template: InvokerField
    payload: InvokerField
}

export interface InvokerField {
    value: string
    isValid: boolean
}
