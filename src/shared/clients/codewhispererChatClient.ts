/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { endpoint, region } from '../../codewhisperer/models/constants'

// Create a a codewhisperer chat streaming client based off of aws sdk v3
export async function createCodeWhispererChatStreamingClient(): Promise<CodeWhispererStreaming> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    const streamingClient = new CodeWhispererStreaming({
        region,
        endpoint,
        token: { token: bearerToken },
        // SETTING max attempts to 0. RE-ENABLE WHEN READY
        // Implement exponential back off starting with a base of 500ms (500 + attempt^10)
        retryStrategy: new ConfiguredRetryStrategy(0, (attempt: number) => 500 + attempt ** 10),
    })
    return streamingClient
}
