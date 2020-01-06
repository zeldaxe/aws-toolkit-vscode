/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { generateClassString, SubComponentProps } from '../../interfaces/common'

export interface TextAreaProps extends SubComponentProps {
    value: string | number
    name: string
    placeholder: string
    rows?: number
    cols?: number
    setState(key: string, value: string | number): void
    onChangeAction?(): void
}

export class TextArea extends React.Component<TextAreaProps, {}> {
    public render() {
        return (
            <textarea
                name={this.props.name}
                placeholder={this.props.placeholder}
                value={this.props.value}
                onChange={event => this.updateParentStateAndCallback(event, this.props.onChangeAction)}
                className={generateClassString(this.props)}
                rows={this.props.rows}
                cols={this.props.cols}
            />
        )
    }

    private updateParentStateAndCallback(
        event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>,
        callback?: () => void
    ) {
        const target = event.target
        this.props.setState(target.name, target.value)
        if (callback) {
            callback()
        }
    }
}

export function NewTextArea(props: TextAreaProps) {
    const callback = props.onChangeAction

    return (
        <textarea
            name={props.name}
            placeholder={props.placeholder}
            value={props.value}
            onChange={event => updateParentStateAndCallback(event, props, callback)}
            className={generateClassString(props)}
            rows={props.rows}
            cols={props.cols}
        />
    )
}

function updateParentStateAndCallback(
    event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>,
    props: TextAreaProps,
    callback?: () => void
) {
    const target = event.target
    props.setState(target.name, target.value)
    if (callback) {
        callback()
    }
}
