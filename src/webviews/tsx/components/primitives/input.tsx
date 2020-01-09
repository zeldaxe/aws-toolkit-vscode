/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { generateClassString, SubComponentProps } from '../../interfaces/common'

export interface InputProps extends SubComponentProps {
    value: string | number
    name: string
    placeholder: string
    setState(key: string, value: string | number, callback?: () => void): void
    onChangeAction?(target: HTMLInputElement): void
    onBlurAction?(target: HTMLInputElement): void
}

export function Input(props: InputProps) {
    return (
        <input
            name={props.name}
            placeholder={props.placeholder}
            value={props.value}
            className={generateClassString(props)}
            onBlur={event => onBlurAction(event, props)}
            onChange={event => updateParentStateAndCallback(event, props)}
        />
    )
}

function updateParentStateAndCallback(event: React.ChangeEvent<HTMLInputElement>, props: InputProps) {
    const target = event.target
    props.setState(target.name, target.value, () => {
        if (props.onChangeAction) {
            props.onChangeAction(target)
        }
    })
}

function onBlurAction(event: React.FocusEvent<HTMLInputElement>, props: InputProps) {
    if (props.onBlurAction) {
        props.onBlurAction(event.target)
    }
}
