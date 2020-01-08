/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import * as fs from 'fs'
import * as _ from 'lodash'
import * as path from 'path'
import * as vscode from 'vscode'
import { ExtensionUtilities } from '../shared/extensionUtilities'
import { AwsComponentToBackendMessage, BackendToAwsComponentMessage } from './tsx/interfaces/common'

export interface reactWebviewParams<Values> {
    id: string
    name: string
    webviewJs: string
    context: vscode.ExtensionContext
    initialState?: BackendToAwsComponentMessage<Values>
    persistSessions?: boolean
    persistWithoutFocus?: boolean
    onDidReceiveMessageFunction(
        request: AwsComponentToBackendMessage<Values>,
        postMessageFn: (response: BackendToAwsComponentMessage<Values>) => Thenable<boolean>,
        destroyWebviewFn: () => any
    ): any
    onDidDisposeFunction?(): void
}

/**
 * Creates a React webview with preloaded React libraries and CSS.
 * Handles onDidReceiveMessage and onDidDispose events (functions sent via params)
 *
 * @param params reactWebviewParameters
 */
export async function createReactWebview<State>(params: reactWebviewParams<State>) {
    const extpath = path.join(params.context.extensionPath, 'compiledWebviews')
    const mediapath = path.join(params.context.extensionPath, 'media')
    const libpath = path.join(mediapath, 'libs')
    const view = vscode.window.createWebviewPanel(params.id, params.name, vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(extpath), vscode.Uri.file(mediapath), vscode.Uri.file(libpath)]
    })

    const loadLibs = ExtensionUtilities.getFilesAsVsCodeResources(
        params.context,
        ExtensionUtilities.LIBS_PATH,
        ['react.development.js', 'react-dom.development.js'],
        view.webview
    )

    let scripts: String = ''

    loadLibs.forEach(element => {
        scripts = scripts.concat(`<script src="${element}"></script>\n\n`)
    })

    const mainScript: vscode.Uri = view.webview.asWebviewUri(vscode.Uri.file(path.join(extpath, params.webviewJs)))

    view.title = params.name
    view.webview.html = `<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta
            http-equiv="Content-Security-Policy"
            content=
                "default-src 'none';
                img-src ${view.webview.cspSource} https:;
                script-src ${view.webview.cspSource} 'self' 'unsafe-eval' 'unsafe-inline';
                style-src ${view.webview.cspSource};
                font-src 'self' data:;"
        >
    </head>
    <body>
        <!-- TODO: Move this to a file so we can remove 'unsafe-inline' -->
        <script>
            const vscode = acquireVsCodeApi();
        </script>
        <div id="reactApp"></div>
        <!-- Dependencies -->
        ${scripts}

        <!-- Main -->
        <script src="${mainScript}"></script>
    </body>
</html>`

    // message in initial state since we don't have access to the ReactDOM call at this level.
    // TODO: Is there a better way to do this?
    if (params.initialState) {
        view.webview.postMessage(params.initialState)
    }

    view.webview.onDidReceiveMessage(
        (message: AwsComponentToBackendMessage<State>) => {
            params.onDidReceiveMessageFunction(
                message,
                response => view.webview.postMessage(response),
                // tslint:disable-next-line: no-unsafe-any
                () => view.dispose()
            )
        },
        undefined,
        params.context.subscriptions
    )

    view.onDidDispose(
        () => {
            if (params.onDidDisposeFunction) {
                params.onDidDisposeFunction()
            }
        },
        undefined,
        params.context.subscriptions
    )
}
