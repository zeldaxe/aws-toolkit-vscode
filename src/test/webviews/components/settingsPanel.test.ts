/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { screen, fireEvent, within } from '@testing-library/vue'

export interface SettingsPanel {
    readonly title: string
    readonly collapsed: boolean
    readonly collapseable: boolean
    /** Gets the 'sub-pane' of the panel. This is `undefined` if the panel is collapsed. */
    readonly subPanel?: HTMLDivElement
    /** Attempts to expand/collapse the panel. */
    toggle(): Promise<void>
}

export function getSettingsPanel(matcher: string | RegExp, container = screen): SettingsPanel {
    const panel = container.queryByRole('region', { name: matcher })
    assert.ok(panel, `Could not find settings panel with pattern "${matcher}"`)

    // note: `aria___` fields seem to be broken
    const title = panel.attributes.getNamedItem('aria-label')?.value
    assert.ok(title, `Settings panel "${panel.id}" did not have an accesibility label`)

    const button = within(panel).queryByLabelText(new RegExp(`${title}`))

    const base = {
        title,
        collapseable: !!button,
        async toggle() {
            assert.ok(button)
            await fireEvent.click(button)
        },
    }

    const collapsed = () => button && button.attributes.getNamedItem('aria-expanded')?.value === 'false'

    // TODO: write utility function to 'build' objects using property descriptors
    Object.defineProperty(base, 'subPanel', {
        get: () => {
            if (collapsed()) {
                return undefined
            }

            const subPanel = within(panel).queryByRole('group')
            assert.ok(subPanel, `Sub-panel not found within panel "${panel.id}"`)

            return subPanel
        },
    })

    Object.defineProperty(base, 'collapsed', { get: collapsed })

    return base as SettingsPanel
}

// This file just contains utilities related to testing a settings panel for now
describe('SettingsPanel', function () {})
