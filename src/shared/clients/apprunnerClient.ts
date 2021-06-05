/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'

export interface AppRunnerClient {
    readonly regionCode: string

    createService(request: AppRunner.CreateServiceRequest): Promise<AppRunner.CreateServiceResponse>
    listServices(request: AppRunner.ListServicesRequest): Promise<AppRunner.ListServicesResponse>
    pauseService(request: AppRunner.PauseServiceRequest): Promise<AppRunner.PauseServiceResponse>
    resumeService(request: AppRunner.ResumeServiceRequest): Promise<AppRunner.ResumeServiceResponse>
    updateService(request: AppRunner.UpdateServiceRequest): Promise<AppRunner.UpdateServiceResponse>
    describeService(request: AppRunner.DescribeServiceRequest): Promise<AppRunner.DescribeServiceResponse>
    deleteService(request: AppRunner.DeleteServiceRequest): Promise<AppRunner.DeleteServiceResponse>
    listConnections(request: AppRunner.ListConnectionsRequest): Promise<AppRunner.ListConnectionsResponse>
    listOperations(request: AppRunner.ListOperationsRequest): Promise<AppRunner.ListOperationsResponse>
    startDeployment(request: AppRunner.StartDeploymentRequest): Promise<AppRunner.StartDeploymentResponse>
}
