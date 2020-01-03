/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { SelectOption } from '../../interfaces/common'

export interface SelectDropDownProps {
    options: SelectOption[]
    value: string
    name: string
    setState(key: string, value: string, callback?: () => void): void
    onSelectAction?(): void
}

export class SelectDropDown extends React.Component<SelectDropDownProps, {}> {
    public render() {
        const options: JSX.Element[] = []

        for (const option of this.props.options) {
            options.push(<option value={option.value}>{option.displayName}</option>)
        }

        return (
            <select name={this.props.name} value={this.props.value} onChange={e => this.onSelect(e)}>
                {options}
            </select>
        )
    }

    private onSelect(event: React.ChangeEvent<HTMLSelectElement>) {
        const target = event.target
        this.props.setState(target.name, target.value, this.props.onSelectAction)
    }
}
