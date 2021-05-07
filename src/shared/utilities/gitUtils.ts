/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process'
import * as vscode from 'vscode'
import * as GitAPI from '../../../types/git'
import { getLogger } from '../logger/logger'

// Collection of function utilizing the built-in Git extension
// TODO: turn this into a class

// Returns a Git extension API object
export async function getApiForGit(): Promise<GitAPI.API> {
    const ext = vscode.extensions.getExtension('vscode.git')
    if (ext !== undefined) {
        return (await ext.activate()).getAPI(1)
    }
    throw new Error('Git extension does not exist')
}

// Get remotes for the current workspace
export function getRemotes(api: GitAPI.API): GitAPI.Remote[] {
    const remotes: GitAPI.Remote[] = []
    api.repositories.forEach(repo => remotes.push(...repo.state.remotes))
    return remotes
}

// Get branches for the specified remote
export async function getBranchesForRemote(api: GitAPI.API, remote: GitAPI.Remote): Promise<GitAPI.Branch[]> {
    const branches: GitAPI.Branch[] = []
    api.repositories.forEach(repo =>
        branches.push(
            ...repo.state.refs.filter(
                (ref: GitAPI.Ref) => ref.remote === remote.name && ref.type === GitAPI.RefType.RemoteHead
            )
        )
    )

    // We'll be 'smart' and try to get branches directly if the user is using a URL not associated with
    // their current workspace. Currently no wait to sort by the latest commited branch using 'ls-remote'
    if (branches.length === 0) {
        try {
            branches.push(
                ...execFileSync('git', ['ls-remote', '--heads', remote.fetchUrl ?? ''])
                    .toString()
                    .split(/\r?\n/)
                    .map(branch => ({
                        name: branch.replace(/.*refs\/heads\//, ''),
                        remote: remote.name,
                        type: GitAPI.RefType.RemoteHead,
                    }))
            )
        } catch (err) {
            getLogger().verbose(`git: failed to get branches for remote "${remote.fetchUrl}"`)
        }
    }

    return branches
}
