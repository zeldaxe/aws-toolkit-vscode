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

let browser: puppeteer.Browser
let mainPage: puppeteer.Page

// RUN THIS WITH THE FOLLOWING COMMAND!!!!!
// mocha .\uitests\noWrapper.ts --require ts-node/register
// how do we integrate this into a normal flow
describe('UI Tests', async function () {
    // tslint:disable-next-line:no-invalid-this
    this.timeout(60000)
    console.log('activated!')

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

    after(async function () {
        await browser.close()
    })

    it('activates the extension and closes', async function () {
        // We know it will take at least 1 second, so lets wait for 1 second, no point trying before then.
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Wait for bootstrap extension to load (when this extension is ready, that means VSC is ready for user interaction).
        // Based on assumption that if extensions have been activated, then VSC is ready for user interaction.
        // Note: This extension loads very quickly (nothing in activation method to slow activation).

        // click AWS extension in sidebar
        // action-label activity-workbench-view-extension-aws-explorer-9c78ba63e25309e4bf4aa7bdc2f058661d3190cc
        const activationLink = await mainPage.waitForSelector(
            'a[class*="activity-workbench-view-extension-aws-explorer"]'
        )
        assert.ok(activationLink, 'no link')
        const activityBarIcon = await mainPage.waitForSelector(
            'a[class*="activity-workbench-view-extension-aws-explorer"]'
        )
        await activityBarIcon!.click()
        // validate AWS explorer opens
        const select = await mainPage.waitForSelector('h3[title="Explorer"]')
        assert.ok(select, 'no select')
        // for some reason, this doesn't work, but the below does: const statusbar = await mainPage.$('#amazonwebservices.aws-toolkit-vscode')
        const statusbar = await mainPage.waitForSelector('#amazonwebservices\\.aws-toolkit-vscode a', {
            visible: true,
            hidden: false,
        })
        assert.ok(statusbar, 'no status')
        await statusbar.click()
        await clickOptionFromQuickPick(mainPage, 'profile:default')
        await mainPage.waitFor(3000)
        await clickOptionFromQuickPick(mainPage, 'Yes')
        await mainPage.waitFor(3000)
        const oregon = await mainPage.waitForSelector('div[aria-label="US West (Oregon) [us-west-2]"]')
        assert.ok(oregon, "Can't find Oregon!")
        await mainPage.screenshot({ path: 'proofOfConcept.png' })
    })

    it('opens a blank doc with ctrl + n and types stuff', async () => {
        // open new text editor
        await mainPage.keyboard.down('ControlLeft')
        await mainPage.keyboard.press('KeyN')
        await mainPage.keyboard.up('ControlLeft')

        const newTab = await mainPage.waitForSelector('div[data-resource-name^="Untitled-1"][role="tab"]')
        assert.ok(newTab, 'no new tab!')
        const newEditor = await mainPage.waitForSelector('div[class="editor-instance"][aria-label^="Untitled-1"]')
        assert.ok(newEditor, 'no new editor!')
        await mainPage.type('.monaco-editor', 'Woo! I am automating Visual Studio Code with puppeteer!\n')
        await mainPage.type('.monaco-editor', 'This would be a super cool way of generating foolproof demos.')
        await mainPage.screenshot({ path: 'newEditor.png' })
    })
})

async function clickOptionFromQuickPick(page: puppeteer.Page, targetText: string) {
    let target: puppeteer.ElementHandle<Element> | undefined
    await page.waitForSelector('.quick-input-widget a span', {
        visible: true,
        hidden: false,
    })
    // quick pick item selectors
    const quickPickSelects = await page.$$('.quick-input-widget a span')
    for (const quickPickSelect of quickPickSelects) {
        const text = await quickPickSelect.evaluate(node => {
            return node.textContent
        })
        if (text === targetText) {
            target = quickPickSelect
            break
        }
    }
    assert.ok(target, `${targetText} not found`)
    await target?.click()
}
