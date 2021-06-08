/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as FakeTimers from '@sinonjs/fake-timers'
import { PollManager, PollEvent, PollListener, PollManagerOptions } from '../../../shared/utilities/pollManager'
import * as assert from 'assert'

interface TestModel {
    data: string
}

describe('PollManager', function() {
    const TEST_OPTIONS: Required<PollManagerOptions> = {
        name: 'test manager',
        baseTime: 5000,
        jitter: 0,
        logging: false,
    }

    let sandbox: sinon.SinonSandbox
    let clock: FakeTimers.InstalledClock
    let manager: PollManager<TestModel>
    let fakePollEvents: PollEvent<TestModel>[]

    async function listFakePollEvents(): Promise<PollEvent<TestModel>[]> {
        const events = [...fakePollEvents]
        fakePollEvents = []
        return events
    }

    function createListener(id: number | string, update: ((model: TestModel) => void)): PollListener<TestModel> {
        return { id, update, isPending: model => model.data === 'pending' }
    }

    function registerFakeEvent(event: PollEvent<TestModel>, updateTime?: number): void {
        if ((updateTime ?? 0) === 0) {
            fakePollEvents.push(event)
        } else {
            setTimeout(() => fakePollEvents.push(event), updateTime)
        }
    }

    before(function () {
        sandbox = sinon.createSandbox()
        clock = FakeTimers.install()
    })

    after(function() {
        sandbox.restore()
        clock.uninstall()
    })

    this.beforeEach(function() {
        manager = new PollManager(listFakePollEvents, TEST_OPTIONS)
        fakePollEvents = []
    })

    it(`Requests events after ${TEST_OPTIONS.baseTime} (base time) milliseconds`, async function () {
        let updatedModel: TestModel | undefined = undefined
        const testInput: TestModel = { data: 'not pending' }
        const testEvent: PollEvent<TestModel> = { id: 0, model: testInput }
        fakePollEvents.push(testEvent)
        manager.addPollListener(createListener(testEvent.id, model => updatedModel = model))

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel, testInput)
    })

    it(`Requests more events if listeners are still waiting`, async function () {
        let updatedModel: TestModel | undefined = undefined
        const firstEvent: PollEvent<TestModel> = { id: 0, model: { data: 'pending' } }
        const secondEvent: PollEvent<TestModel> = { id: 0, model: { data: 'not pending' } }
        fakePollEvents.push(firstEvent)
        manager.addPollListener(createListener(firstEvent.id, model => updatedModel = model))

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        fakePollEvents.push(secondEvent)

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel, undefined)
        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel, secondEvent.model)
    })

    it(`Handles multiple listeners`, async function () {
        let updatedModel1: TestModel | undefined = undefined
        let updatedModel2: TestModel | undefined = undefined
        const finalEvent1 = { id: 0, model: { data: 'not pending'} }
        const finalEvent2 = { id: 1, model: { data: 'definitely not pending'} }
        registerFakeEvent({ id: 0, model: { data: 'pending' } }, 100)
        registerFakeEvent({ id: 1, model: { data: 'pending' } }, 100)
        registerFakeEvent(finalEvent1, TEST_OPTIONS.baseTime + 100)
        registerFakeEvent({ id: 1, model: { data: 'pending' } }, TEST_OPTIONS.baseTime + 100)
        registerFakeEvent(finalEvent2, TEST_OPTIONS.baseTime * 4 + 100)

        manager.addPollListener(createListener(finalEvent1.id, model => updatedModel1 = model))
        manager.addPollListener(createListener(finalEvent2.id, model => updatedModel2 = model))

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel1, undefined)
        await clock.tickAsync(TEST_OPTIONS.baseTime * 2)
        assert.strictEqual(updatedModel1, finalEvent1.model)
        assert.strictEqual(updatedModel2, undefined)
        await clock.tickAsync(TEST_OPTIONS.baseTime * 2)
        assert.strictEqual(updatedModel2, finalEvent2.model)
    })

    it(`Adding another listener pushes the timeout to at least the base time`, async function () {
        let updatedModel1: TestModel | undefined = undefined
        let updatedModel2: TestModel | undefined = undefined
        const finalEvent1 = { id: 0, model: { data: 'not pending'} }
        const finalEvent2 = { id: 1, model: { data: 'definitely not pending'} }
        registerFakeEvent(finalEvent1)
        registerFakeEvent(finalEvent2, TEST_OPTIONS.baseTime + 100)

        manager.addPollListener(createListener(finalEvent1.id, model => updatedModel1 = model))

        await clock.tickAsync(TEST_OPTIONS.baseTime / 2)
        assert.strictEqual(updatedModel1, undefined)
        assert.strictEqual(updatedModel2, undefined)
        manager.addPollListener(createListener(finalEvent2.id, model => updatedModel2 = model))
        await clock.tickAsync(TEST_OPTIONS.baseTime / 2)
        assert.strictEqual(updatedModel1, undefined)
        assert.strictEqual(updatedModel2, undefined)
        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel1, finalEvent1.model)
        assert.strictEqual(updatedModel2, finalEvent2.model)
    })
})
