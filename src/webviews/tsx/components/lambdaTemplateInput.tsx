/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react'
import { SelectOption, SubComponentProps } from '../interfaces/common'
import { JsonTextInput } from './jsonTextInput'
import { SelectDropDown } from './primitives/selectDropDown'

export interface LambdaTemplateInputProps extends SubComponentProps {
    templateOptions: SelectOption[]
    templateName: string
    templateValue: string
    jsonName: string
    jsonValue: string
    jsonRows?: number
    jsonCols?: number
    invalidJsonMessage?: string
    onSelectTemplate(): void
    setState(key: string, value: string, callback: () => void): void
    setInvalidField(isInvalid: boolean): void
    checkInvalid(field: string): boolean
    checkInactive(field: string): boolean
    checkLoading(field: string): boolean
}

export function LambdaTemplateInput(props: LambdaTemplateInputProps) {
    return (
        <div>
            <h3>Enter a JSON payload (or select a template from the list below)</h3>
            <SelectDropDown
                name={props.templateName}
                value={props.templateValue}
                placeholder="Templates"
                options={props.templateOptions}
                setState={(key: string, value: string, callback: () => void) => props.setState(key, value, callback)}
                isInactive={props.checkInactive(props.templateName)}
                onSelectAction={() => props.onSelectTemplate()}
            />
            <br />
            <h3>JSON Payload</h3>
            <JsonTextInput
                name={props.jsonName}
                value={props.jsonValue}
                placeholder="JSON Payload"
                setState={(key: string, value: string, callback: () => void) => props.setState(key, value, callback)}
                rows={props.jsonRows || 20}
                cols={props.jsonCols || 75}
                isInactive={props.checkInactive(props.jsonName)}
                isInvalid={props.checkInvalid(props.jsonName)}
                isLoading={props.checkLoading(props.jsonName)}
                isInvalidMessage={props.invalidJsonMessage}
                setInvalidField={(isInvalid: boolean) => props.setInvalidField(isInvalid)}
            />
        </div>
    )
}
