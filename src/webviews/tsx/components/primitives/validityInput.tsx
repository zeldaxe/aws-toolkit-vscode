/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { ValidityField } from '../../interfaces/common'

export interface ValidityInputProps {
    validityField: ValidityField
    name: string
    placeholder: string
    isTextArea: boolean
    setState(key: string, value: ValidityField): void
    onChangeAction?(): void
}

export class ValidityInput extends React.Component<ValidityInputProps, {}> {
    public render() {
        if (this.props.isTextArea) {
            return (
                <textarea
                    name={this.props.name}
                    placeholder={this.props.placeholder}
                    value={this.props.validityField.value}
                    onChange={event => this.updateParentStateAndCallback(event, this.props.onChangeAction)}
                    className={`${this.props.validityField.isValid ? 'valid' : 'invalid'}`}
                />
            )
        }

        return (
            <input
                name={this.props.name}
                placeholder={this.props.placeholder}
                value={this.props.validityField.value}
                onChange={event => this.updateParentStateAndCallback(event, this.props.onChangeAction)}
                className={`${this.props.validityField.isValid ? 'valid' : 'invalid'}`}
            />
        )
    }

    private updateParentStateAndCallback(
        event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>,
        callback?: () => void
    ) {
        const target = event.target
        const vf: ValidityField = { value: target.value, isValid: this.props.validityField.isValid }
        this.props.setState(target.name, vf)
        if (callback) {
            callback()
        }
    }
}
