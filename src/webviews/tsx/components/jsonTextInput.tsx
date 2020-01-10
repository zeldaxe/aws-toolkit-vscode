/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { TextArea, TextAreaProps } from './primitives/textArea'

export interface JsonTextInputProps extends TextAreaProps {
    isInvalidMessage?: string
    setInvalidField(isInvalid: boolean): void
}

export function JsonTextInput(props: JsonTextInputProps) {
    return (
        <div>
            <TextArea
                {...props}
                onBlurAction={target =>
                    validateJsonOnBlur(target, (isInvalid: boolean) => props.setInvalidField(isInvalid))
                }
            />
            {props.isInvalid ? <p>{props.isInvalidMessage}</p> : undefined}
        </div>
    )
}

function validateJsonOnBlur(target: HTMLTextAreaElement, setInvalidField: (isInvalid: boolean) => void) {
    try {
        JSON.parse(target.value)
        setInvalidField(false)
    } catch {
        setInvalidField(true)
    }
}
