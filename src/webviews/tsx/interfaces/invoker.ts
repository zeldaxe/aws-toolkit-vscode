/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidityField } from './common'

export interface InvokerState {
    region: ValidityField
    lambda: ValidityField
    template: ValidityField
    payload: ValidityField
}
