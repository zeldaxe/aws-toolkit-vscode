/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createApp } from 'vue'
import Component from './samInvokeComponent.vue'

const create = () => createApp(Component)
const app = create()
app.mount('#vue-app')

window.addEventListener('remount', () => {
    app.unmount()
    create().mount('#vue-app')
})
