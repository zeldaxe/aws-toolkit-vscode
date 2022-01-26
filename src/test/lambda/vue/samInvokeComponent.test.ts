/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as util from '../../webviews/util'
import { render, screen, fireEvent, within } from '@testing-library/vue'
import { anything, verify, when, instance } from 'ts-mockito'
import { SamInvokeWebview } from '../../../lambda/vue/samInvokeBackend'
import Component from '../../../lambda/vue/samInvokeComponent.vue'
import { capture } from '../../utilities/mockito'
import { getSettingsPanel } from '../../webviews/components/settingsPanel.test'
import { WebviewClient } from '../../../webviews/client'

// Convenience functions to cast types based off their tag, should be moved to a shared file
// There may also be a library for this?

function isSelectElement(element: HTMLElement | null): element is HTMLSelectElement {
    return element?.tagName === 'SELECT'
}

function isOption(element: HTMLElement | null): element is HTMLOptionElement {
    return element?.tagName === 'OPTION'
}

describe('samInvokeComponent', function () {
    function createCodeDebugConfig() {
        return {
            name: 'foo',
            invokeTarget: {
                lambdaHandler: '',
                projectRoot: '',
                target: 'code' as const,
            },
            request: '',
            type: '',
        }
    }

    let client: WebviewClient<SamInvokeWebview['protocol']>
    const runtimes = ['nodejs14.x', 'go1.x']

    beforeEach(async function () {
        client = util.mockClient<SamInvokeWebview>()

        // These commands are called in the component's `created` lifecycle event so they should
        // always be mocked with something
        when(client.init()).thenResolve(createCodeDebugConfig())
        when(client.getRuntimes()).thenResolve(runtimes)

        // Render the component and pass in the mock client
        // Note that we can't leverage any type-safety here since Typescript does not understand '.vue' files
        render(Component, { props: { client: instance(client) } })

        // Components can load data asychronously, so we add a short delay to give Vue time to re-render
        await new Promise(r => setTimeout(r, 25))
    })

    afterEach(async function () {
        // This clears any state held by the VS Code API
        util.MockWebviewApi.instance.clear()

        // This clears state within `saveData`
        // Otherwise the mixin will think each test is the same instance of a component
        await fireEvent(window, new Event('remount'))
    })

    it('loads initial configuration on init', async function () {
        // We try to find the input for target type by searching for the text contained within a label tag
        const invokeTarget = screen.queryByLabelText('Invoke Target Type')

        // The expectation is that the invoke target input is a 'dropdown' (<select> tag) and is currently set to 'code'
        assert.ok(isSelectElement(invokeTarget))
        assert.strictEqual(invokeTarget.selectedOptions.length, 1)
        assert.strictEqual(invokeTarget.selectedOptions[0].textContent, 'Code')
        assert.strictEqual(invokeTarget.value, 'code')

        // We should see a div with 3 options: project directory, lambda handler name, and runtime
        const projects = screen.queryByLabelText('Project Root')
        const handler = screen.queryByLabelText('Lambda Handler')
        const runtime = screen.queryByLabelText('Runtime')

        // Queries can return 'null' if the element does not exist
        // You can also use `getBy___` instead which will throw if the element does not exist
        // The error messages for `getBy___` aren't very good so I'd suggest using your own asserts
        assert.ok(projects, `Projects option does not exist`)
        assert.ok(handler, `Lambda handler option does not exist`)
        assert.ok(runtime, `Runtime option does not exist`)

        // You can use `within` to query against a specific element
        const templateOption = within(invokeTarget).queryByText('Template', { exact: true })
        assert.ok(isOption(templateOption), 'No option named "Template" found')

        // `fireEvent` allows you to interact with elements as if you were a user
        await fireEvent.update(templateOption)
        assert.strictEqual(invokeTarget.value, 'template')

        // Project path should be gone now since it's dependent on the invoke target
        assert.ok(!screen.queryByLabelText('Project Root'), 'Projects option still exists')
    })

    it('has an "Additional Fields" panel that is collapsed by default', async function () {
        // Re-usable components should describe their own 'accessibility model' for other tests to use
        // In this case we're using a collapseable settings panel
        const panel = getSettingsPanel('Additional Fields')

        assert.strictEqual(panel.collapseable, true)
        assert.strictEqual(panel.collapsed, true)

        // Internally `toggle` will call `fireEvent` on a button that is otherwise not exposed
        await panel.toggle()

        assert.strictEqual(panel.collapsed, false)
        assert.ok(panel.subPanel)
    })

    it('it can format JSON input (Environment Variables)', async function () {
        const panel = getSettingsPanel('Additional Fields')
        await panel.toggle()
        assert.ok(panel.subPanel)

        const envVar = within(panel.subPanel).getByLabelText(/Variables/)
        await fireEvent.update(envVar, JSON.stringify({ foo: 'bar' }))

        when(client.saveLaunchConfig(anything())).thenResolve()

        // Querying by 'role' is the best way to find elements in the DOM
        // Aria roles describe the purpose of an element and are more in-line with how a user interacts with the UI
        const save = screen.getByRole('button', { name: /save/i })
        await fireEvent.click(save)

        const [config] = capture(client.saveLaunchConfig).first()
        assert.deepStrictEqual(config.lambda?.environmentVariables, { foo: 'bar' })
    })

    it('it can show an error for invalid JSON (Environment Variables)', async function () {
        const panel = getSettingsPanel('Additional Fields')
        await panel.toggle()
        assert.ok(panel.subPanel)

        const envVar = within(panel.subPanel).getByLabelText(/Variables/)
        await fireEvent.update(envVar, 'not JSON :(')

        when(client.saveLaunchConfig(anything())).thenResolve()

        const save = screen.getByRole('button', { name: /save/i })
        await fireEvent.click(save)

        verify(client.saveLaunchConfig(anything())).never()
        assert.strictEqual(envVar.attributes.getNamedItem('aria-invalid')?.value, 'true')

        // Could also use the id provided by `aria-errormessage` to find the message
        // But doing it this way is much simpler
        assert.ok(within(panel.subPanel).queryByText(/Error parsing JSON/))
    })

    it('it can get runtimes from the backend', async function () {
        const runtime = screen.getByLabelText('Runtime')
        const options = within(runtime)
            .getAllByRole('option')
            .filter(o => isOption(o) && !o.disabled)

        assert.strictEqual(options.length, 2)

        for (const opt of options) {
            assert.strictEqual(opt.textContent, runtimes.shift())
        }
    })
})
