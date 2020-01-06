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
    setState(key: string, value: string | number): void
    onChangeAction?(): void
}

export class Input extends React.Component<InputProps, {}> {
    public render() {
        return (
            <input
                name={this.props.name}
                placeholder={this.props.placeholder}
                value={this.props.value}
                onChange={event => this.updateParentStateAndCallback(event, this.props.onChangeAction)}
                className={generateClassString(this.props)}
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
