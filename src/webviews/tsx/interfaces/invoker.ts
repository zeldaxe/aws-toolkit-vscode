/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidityField, VsCodeReactWebviewState } from './common'

export interface InvokerState extends VsCodeReactWebviewState {
    validityFields: {
        region: ValidityField
        lambda: ValidityField
        template: ValidityField
        payload: ValidityField
    }
}
