/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { PrimitiveProps } from '../../interfaces/common'
import { GenericActions, setState } from '../awsReducerFunctions'
import { generateClassString } from './common'

export interface InputProps<Values, Commands> extends PrimitiveProps {
    value: string | number
    name: keyof Values
    dispatch: React.Dispatch<GenericActions<Values, Commands>>
    placeholder?: string
    onChangeAction?(): void
}

export function Input<Values, Commands>(props: InputProps<Values, Commands>) {
    const firstRun = React.useRef(true)

    React.useEffect(() => {
        if (!firstRun.current && props.onChangeAction) {
            props.onChangeAction()
        }
    }, [props.value])

    React.useEffect(() => {
        firstRun.current = false
    }, [])

    return (
        <input
            name={props.name.toString()}
            placeholder={props.placeholder}
            value={props.value}
            onChange={event => updateParentStateAndCallback(event, props)}
            className={generateClassString(props)}
        />
    )
}

function updateParentStateAndCallback<Values, Commands>(
    event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>,
    props: InputProps<Values, Commands>
) {
    const target = event.target
    setState(props.dispatch, props.name, target.value)
}
