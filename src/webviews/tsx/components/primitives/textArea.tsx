/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'

export interface TextAreaProps {
    value: string | number
    isInactive?: boolean
    isInvalid?: boolean
    isHidden?: boolean
    isLoading?: boolean
    name: string
    placeholder: string
    rows?: number
    cols?: number
    setState(key: string, value: string | number): void
    onChangeAction?(): void
}

export class TextArea extends React.Component<TextAreaProps, {}> {
    public render() {
        const classString =
            `${this.props.isInvalid ? 'invalid' : 'valid'}` +
            ` ${this.props.isInactive ? 'inactive' : 'active'}` +
            ` ${this.props.isHidden ? 'hidden' : 'unhidden'}` +
            ` ${this.props.isLoading ? 'loading' : 'loaded'}`

        return (
            <textarea
                name={this.props.name}
                placeholder={this.props.placeholder}
                value={this.props.value}
                onChange={event => this.updateParentStateAndCallback(event, this.props.onChangeAction)}
                className={classString}
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
