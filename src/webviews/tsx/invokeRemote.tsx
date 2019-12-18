/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { vscode } from '../utils'
import { Invoker } from './components/invoker'
import { InvokerState } from './interfaces/invokerInterfaces'

// declare function acquireVsCodeApi(): vscode;
declare const vscode: vscode<InvokerState>

ReactDOM.render(<Invoker vscode={vscode} />, document.getElementById('reactApp'))
