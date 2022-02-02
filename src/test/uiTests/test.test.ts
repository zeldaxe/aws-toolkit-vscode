/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as puppeteer from 'puppeteer-core'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { installVSCodeExtension, setupVSCodeTestInstance } from '../../../test-scripts/launchTestUtilities'

async function setupVSCode(): Promise<string> {
    console.log('Setting up VS Code Test instance...')
    const vsCodeExecutablePath = await setupVSCodeTestInstance()
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.awstoolkit)
    console.log('VS Code Test instance has been set up')

    return vsCodeExecutablePath
}

// RUN WITH `mocha .\uitests\noWrapper.ts --require ts-node/register`
describe('UI Tests', async () => {
    console.log('activated!')
    let browser: puppeteer.Browser
    let mainPage: puppeteer.Page

    before(async () => {
        const vscodePath = await setupVSCode()
        const args = [
            // `--user-data-dir=${this.options.userDataPath}`,
            // `--extensions-dir=${this.options.extensionsPath}`,
            '--skip-getting-started',
            '--skip-release-notes',
            '--sticky-quickopen',
            '--disable-telemetry',
            '--disable-updates',
            '--disable-crash-reporter',
            '--no-sandbox',
            '--no-first-run',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            // `--folder-uri=${URI.file(this.options.workspacePathOrFolder)}`
        ]
        browser = await puppeteer.launch({
            executablePath: vscodePath,
            args,
            headless: true,
            devtools: false,
            // This must be set to `null`, else VSC UI resizes in a funky way.
            // tslint:disable-next-line: no-null-keyword
            defaultViewport: null,
            // This must be set to ensure puppeteer doesn't send default (additional) args.
            ignoreDefaultArgs: true,
        })
        const pages = await browser.pages()
        pages.forEach(page => {
            page.on('error', error => console.log('One of the pages have errored', error))
        })
        mainPage = pages[0]
        console.log('VS Code successfully launched')
    })

    after(async () => {
        await browser.close()
    })

    it('activates the extension and closes', async () => {
        // We know it will take at least 1 second, so lets wait for 1 second, no point trying before then.
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Wait for bootstrap extension to load (when this extension is ready, that means VSC is ready for user interaction).
        // Based on assumption that if extensions have been activated, then VSC is ready for user interaction.
        // Note: This extension loads very quickly (nothing in activation method to slow activation).

        // await mainPage.waitForSelector('#amazonwebservices.aws-toolkit-vscode')
        const activationLink = await mainPage.waitForSelector('.activity-workbench-view-extension-aws-explorer')
        assert.ok(activationLink)
        await mainPage.click('.activity-workbench-view-extension-aws-explorer')
        await mainPage.screenshot({ path: 'proofOfConcept.png' })
    })
})
