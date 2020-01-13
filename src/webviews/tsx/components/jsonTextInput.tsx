/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { SubComponentProps } from '../interfaces/common'
import { TextArea } from './primitives/textArea'

export interface JsonTextInputProps<Values> extends SubComponentProps<Values> {
    name: keyof Values
    value: string
    placeholder: string
    rows?: number
    cols?: number
    isInvalidMessage?: string
    onChangeAction?(target: HTMLTextAreaElement): void
    onBlurAction?(target: HTMLTextAreaElement): void
}

export function JsonTextInput<Values>(props: JsonTextInputProps<Values>) {
    return (
        <div>
            <TextArea<Values>
                name={props.name}
                value={props.value}
                placeholder={props.placeholder}
                rows={props.rows}
                cols={props.cols}
                onBlurAction={target =>
                    validateJsonOnBlur(target, (isInvalid: boolean) => {
                        if (isInvalid) {
                            props.stateInteractors.setStatusInSet('invalidFields', props.name)
                        } else {
                            props.stateInteractors.removeStatusFromSet('invalidFields', props.name)
                        }
                    })
                }
                setState={(key: keyof Values, value: string, callback: () => void) =>
                    props.stateInteractors.setSingleState(key, value, callback)
                }
            />
            {props.stateInteractors.getStatusFromSet('invalidFields', props.name) ? (
                <p>{props.isInvalidMessage}</p>
            ) : (
                undefined
            )}
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
