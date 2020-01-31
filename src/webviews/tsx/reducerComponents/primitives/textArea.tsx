/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { PrimitiveProps } from '../../interfaces/common'
import { GenericActions, setState } from '../../reducerComponents/awsReducerFunctions'
import { generateClassString } from './common'

export interface TextAreaProps<Values, Commands> extends PrimitiveProps {
    value: string
    name: keyof Values
    dispatch: React.Dispatch<GenericActions<Values, Commands>>
    placeholder?: string
    rows?: number
    cols?: number
    onChangeAction?(): void
    onBlurAction?(target: HTMLTextAreaElement): void
}

export function TextArea<Values, Commands>(props: TextAreaProps<Values, Commands>) {
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
        <textarea
            name={props.name.toString()}
            placeholder={props.placeholder}
            value={props.value}
            onChange={event => updateParentState(event, props)}
            className={generateClassString(props)}
            rows={props.rows}
            cols={props.cols}
            onBlur={event => onBlurAction(event, props)}
        />
    )
}

function updateParentState<Values, Commands>(
    event: React.ChangeEvent<HTMLTextAreaElement>,
    props: TextAreaProps<Values, Commands>
) {
    const target = event.target
    setState(props.dispatch, props.name, target.value)
}

function onBlurAction<Values, Commands>(
    event: React.FocusEvent<HTMLTextAreaElement>,
    props: TextAreaProps<Values, Commands>
) {
    if (props.onBlurAction) {
        props.onBlurAction(event.target)
    }
}
