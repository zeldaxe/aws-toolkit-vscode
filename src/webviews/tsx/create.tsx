/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { Hello } from './components/primitives/hello'

declare global {
    interface Window {
        acquireVsCodeApi(): any
    }
}

// const vscode = window.acquireVsCodeApi();

ReactDOM.render(<Hello compiler="TypeScript" framework="React" />, document.getElementById('reactApp'))
