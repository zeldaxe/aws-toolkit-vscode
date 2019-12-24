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
    setState(key: string, value: ValidityField): void
}

export class ValidityInput extends React.Component<ValidityInputProps, {}> {
    public render() {
        return (
            <input
                name={this.props.name}
                placeholder={this.props.placeholder}
                value={this.props.validityField.value}
                onChange={event => this.updateParentState(event)}
                className={`${this.props.validityField.isValid ? 'valid' : 'invalid'}`}
            />
        )
    }

    private updateParentState(event: React.ChangeEvent) {
        const target = event.target as HTMLInputElement
        const vf: ValidityField = { value: target.value, isValid: this.props.validityField.isValid }
        this.props.setState(target.name, vf)
    }
}
