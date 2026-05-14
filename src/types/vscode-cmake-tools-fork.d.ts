import * as vscode from 'vscode';

declare module 'vscode-cmake-tools' {
    export enum Version {
        v1000 = 1000,
    }

    export interface CompileCommandsChangeEvent {
        kind: 'full' | 'files';
        files?: vscode.Uri[];
    }

    export interface ResolvedCompileCommand {
        uri: vscode.Uri;
        sourceUri: vscode.Uri;
        workingDirectory: string;
        compilationCommand: string[];
        compilerPath?: string;
        targetName?: string;
        configurationName?: string;
        language?: string;
        inferred: boolean;
    }

    export interface Project {
        readonly onCompileCommandsChanged: vscode.Event<CompileCommandsChangeEvent>;
        getCompileCommand(file: vscode.Uri): Promise<ResolvedCompileCommand | undefined>;
        getTranslationUnitCompileCommands(): Promise<ResolvedCompileCommand[]>;
    }
}
