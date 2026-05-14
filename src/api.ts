/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as api from 'vscode-cmake-tools';
import CMakeProject from '@cmt/cmakeProject';
import { ExtensionManager } from '@cmt/extension';
import { ResolvedCompileCommandInternal } from '@cmt/compileCommands';
import { assertNever, platformNormalizePath } from '@cmt/util';
import { CTestOutputLogger } from '@cmt/ctest';
import { logEvent } from './telemetry';

export class CMakeToolsApiImpl implements api.CMakeToolsApi {
    constructor(private readonly manager: ExtensionManager) {}

    version: api.Version = api.Version.v5;

    showUIElement(element: api.UIElement): Promise<void> {
        logApiTelemetry('showUIElement');
        return this.setUIElementVisibility(element, true);
    }

    hideUIElement(element: api.UIElement): Promise<void> {
        logApiTelemetry('hideUIElement');
        return this.setUIElementVisibility(element, false);
    }

    get onBuildTargetChanged() {
        return this.manager.onBuildTargetChanged;
    }

    get onLaunchTargetChanged() {
        return this.manager.onLaunchTargetChanged;
    }

    get onActiveProjectChanged() {
        return this.manager.onActiveProjectChanged;
    }

    async getProject(uri: vscode.Uri): Promise<CMakeProjectWrapper | undefined> {
        logApiTelemetry('getProject');
        const project = await this.getProjectForUri(uri);
        return project ? new CMakeProjectWrapper(project) : undefined;
    }

    getActiveFolderPath(): string {
        logApiTelemetry('getActiveFolderPath');
        return this.manager.activeFolderPath();
    }

    private async setUIElementVisibility(element: api.UIElement, visible: boolean): Promise<void> {
        switch (element) {
            case api.UIElement.StatusBarDebugButton:
                await this.manager.hideDebugCommand(!visible);
                break;
            case api.UIElement.StatusBarLaunchButton:
                await this.manager.hideLaunchCommand(!visible);
                break;
            default:
                assertNever(element);
        }
    }

    private async getProjectForUri(uri: vscode.Uri): Promise<CMakeProject | undefined> {
        const byFolder = await this.manager.projectController.getProjectForFolder(uri.fsPath);
        if (byFolder) {
            return byFolder;
        }

        const normalizedPath = platformNormalizePath(uri.fsPath);
        let bestMatch: CMakeProject | undefined;
        let bestLength = -1;

        for (const project of this.manager.projectController.getAllCMakeProjects()) {
            for (const candidate of [project.sourceDir, project.workspaceFolder.uri.fsPath]) {
                const normalizedCandidate = platformNormalizePath(candidate);
                if ((normalizedPath === normalizedCandidate || normalizedPath.startsWith(`${normalizedCandidate}/`)) && normalizedCandidate.length > bestLength) {
                    bestMatch = project;
                    bestLength = normalizedCandidate.length;
                }
            }
        }

        return bestMatch;
    }
}

async function withErrorCheck(name: string, action: () => Promise<api.CommandResult>): Promise<void> {
    const code = await action();
    if (code.exitCode !== 0) {
        throw new Error(`${name} failed with code ${code.exitCode}, stdout: ${code.stdout ?? ''}, stderr: ${code.stderr ?? ''}`);
    }
}

class CMakeProjectWrapper implements api.Project {
    constructor(private readonly project: CMakeProject) {}

    get codeModel() {
        logApiTelemetry('getCodeModel');
        return this.project.codeModelContent ?? undefined;
    }

    get onCodeModelChanged() {
        return this.project.onCodeModelChangedApiEvent;
    }

    get onSelectedConfigurationChanged() {
        return this.project.onSelectedConfigurationChangedApiEvent;
    }

    get configurePreset() {
        logApiTelemetry('getConfigurePreset');
        return this.project.configurePreset ?? undefined;
    }

    get buildPreset() {
        logApiTelemetry('getBuildPreset');
        return this.project.buildPreset ?? undefined;
    }

    get testPreset() {
        logApiTelemetry('getTestPreset');
        return this.project.testPreset ?? undefined;
    }

    get packagePreset() {
        logApiTelemetry('getPackagePreset');
        return this.project.packagePreset ?? undefined;
    }

    get useCMakePresets() {
        logApiTelemetry('getUseCMakePresets');
        return this.project.useCMakePresets;
    }

    configure(): Promise<void> {
        logApiTelemetry('configure');
        return withErrorCheck('configure', async () => (this.project.configure()));
    }

    async configureWithResult(cancellationToken?: vscode.CancellationToken): Promise<api.CommandResult> {
        logApiTelemetry('configureWithResult');
        return this.project.configure(undefined, cancellationToken);
    }

    build(targets?: string[]): Promise<void> {
        logApiTelemetry('build');
        return withErrorCheck('build', () => this.project.build(targets));
    }

    async buildWithResult(targets?: string[], cancellationToken?: vscode.CancellationToken): Promise<api.CommandResult> {
        logApiTelemetry('buildWithResult');
        return this.project.build(targets, undefined, undefined, cancellationToken);
    }

    async ctestWithResult(tests?: string[], cancellationToken?: vscode.CancellationToken): Promise<api.CommandResult> {
        logApiTelemetry('ctestWithResult');
        return this.project.ctest(undefined, new CTestOutputLogger(), tests, cancellationToken);
    }

    install(): Promise<void> {
        logApiTelemetry('install');
        return withErrorCheck('install', () => this.project.install());
    }

    installWithResult(cancellationToken?: vscode.CancellationToken): Promise<api.CommandResult> {
        logApiTelemetry('installWithResult');
        return this.project.install(cancellationToken);
    }

    clean(): Promise<void> {
        logApiTelemetry('clean');
        return withErrorCheck('clean', () => this.project.clean());
    }

    async cleanWithResult(cancellationToken?: vscode.CancellationToken): Promise<api.CommandResult> {
        logApiTelemetry('cleanWithResult');
        return this.project.clean(cancellationToken);
    }

    reconfigure(): Promise<void> {
        logApiTelemetry('reconfigure');
        return withErrorCheck('reconfigure', async () => (this.project.cleanConfigure()));
    }

    async reconfigureWithResult(cancellationToken?: vscode.CancellationToken): Promise<api.CommandResult> {
        logApiTelemetry('reconfigureWithResult');
        return this.project.cleanConfigure(undefined, cancellationToken);
    }

    async getBuildDirectory(): Promise<string | undefined> {
        logApiTelemetry('getBuildDirectory');
        return (await this.project.buildDirectory()) ?? undefined;
    }

    async getActiveBuildType(): Promise<string | undefined> {
        logApiTelemetry('getActiveBuildType');
        return (await this.project.currentBuildType()) ?? undefined;
    }

    get onCompileCommandsChanged(): vscode.Event<api.CompileCommandsChangeEvent> {
        return (listener, thisArgs, disposables) => {
            const fire = () => listener.call(thisArgs, { kind: 'full' });
            const subscriptions = [
                this.project.onCodeModelChangedApiEvent(fire),
                this.project.onSelectedConfigurationChangedApiEvent(fire),
                this.project.onReconfigured(fire),
                this.project.onTargetChanged(fire)
            ];
            const subscription = new vscode.Disposable(() => subscriptions.forEach(item => item.dispose()));
            if (disposables) {
                disposables.push(subscription);
            }
            return subscription;
        };
    }

    async getCompileCommand(file: vscode.Uri): Promise<api.ResolvedCompileCommand | undefined> {
        logApiTelemetry('getCompileCommand');
        const command = await this.project.getCompileCommand(file.fsPath);
        return command ? mapResolvedCompileCommand(command) : undefined;
    }

    async getTranslationUnitCompileCommands(): Promise<api.ResolvedCompileCommand[]> {
        logApiTelemetry('getTranslationUnitCompileCommands');
        return (await this.project.getTranslationUnitCompileCommands()).map(command => mapResolvedCompileCommand(command));
    }

    async listBuildTargets(): Promise<string[] | undefined> {
        logApiTelemetry('listBuildTargets');
        return (await this.project.targets).map(target => target.name);
    }

    async listTests(): Promise<string[] | undefined> {
        logApiTelemetry('listTests');
        return this.project.cTestController.getTestNames();
    }
}

function mapResolvedCompileCommand(command: ResolvedCompileCommandInternal): api.ResolvedCompileCommand {
    return {
        uri: vscode.Uri.file(command.file),
        sourceUri: vscode.Uri.file(command.sourceFile),
        workingDirectory: command.workingDirectory,
        compilationCommand: [...command.compilationCommand],
        compilerPath: command.compilerPath,
        targetName: command.targetName,
        configurationName: command.configurationName,
        language: command.language,
        inferred: command.inferred
    };
}

function logApiTelemetry(method: string): void {
    logEvent("api", {
        method: method
    });
}
