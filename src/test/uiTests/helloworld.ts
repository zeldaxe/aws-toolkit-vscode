/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import { runTests } from '../testRunner'

// async function start(): Promise<void> {
//     await runTests({rootTestsPath: __dirname})
// }
// // tslint:disable-next-line: no-floating-promises
// ; (async () => {await start()})()

import { runTestsInFolder } from '../testRunner'
import * as path from 'path'

export function run(): Promise<void> {
    console.log('hi')
    return runTestsInFolder(path.join('test', 'uiTests'), [])
}

;(async () => {
    run()
})()
