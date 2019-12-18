/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface vscode<State> {
    postMessage(state: State): void
    setState(state: State): void
    getState(): State
}
