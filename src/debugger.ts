import { CMakeCache } from '@cmt/cache';
import * as proc from '@cmt/proc';
import { createLogger } from './logging';
import * as nls from 'vscode-nls';
import * as path from 'path';
import * as vscode from 'vscode';
import { fs } from './pr';
import { ExecutableTarget } from '@cmt/drivers/drivers';

nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize: nls.LocalizeFunc = nls.loadMessageBundle();

const log = createLogger('debugger');

/**
 * Basically the same interface as vscode.DebugConfiguration, but we want
 * strong typing on the optional properties so we need to redefine it so
 * it can inherit those properties.
 */
export interface VSCodeDebugConfiguration extends CppDebugConfiguration {
    type: string;
    name: string;
    request: string;
    program: string;
    [key: string]: any;
}

/**
 * interface that maps to cmake.debugConfig.
 */
export interface CppDebugConfiguration {
    symbolSearchPath?: string;
    additionalSOLibSearchPath?: string;
    externalConsole?: boolean;
    console?: ConsoleTypes;
    logging?: DebuggerLogging;
    visualizerFile?: string;
    args?: string[];
    cwd?: string;
    environment?: proc.DebuggerEnvironmentVariable[];
    MIMode?: MIModes;
    miDebuggerPath?: string;
    stopAtEntry?: boolean;
    setupCommands?: SetupCommand[];
    customLaunchSetupCommands?: SetupCommand[];
    launchCompleteCommand?: string;
    dumpPath?: string;
    coreDumpPath?: string;
}

export interface DebuggerLogging {
    exceptions?: boolean;
    moduleLoad?: boolean;
    programOutput?: boolean;
    engineLogging?: boolean;
    trace?: boolean;
    traceResponse?: boolean;
}

export interface SetupCommand {
    text?: string;
    description?: string;
    ignoreFailures?: boolean;
}

export enum MIModes {
    lldb = 'lldb',
    gdb = 'gdb',
}

export enum ConsoleTypes {
    internalConsole = 'internalConsole',
    integratedTerminal = 'integratedTerminal',
    externalTerminal = 'externalTerminal',
    newExternalWindow = 'newExternalWindow'
}

async function createGDBDebugConfiguration(debuggerPath: string, target: ExecutableTarget): Promise<VSCodeDebugConfiguration> {
    if (!await checkDebugger(debuggerPath)) {
        debuggerPath = 'gdb';
        if (!await checkDebugger(debuggerPath)) {
            throw new Error(localize('gdb.not.found', 'Unable to find GDB in default search path and {0}.', debuggerPath));
        }
    }

    return {
        type: 'cppdbg',
        name: `Debug ${target.name}`,
        request: 'launch',
        cwd: path.dirname(target.path),
        args: [],
        MIMode: MIModes.gdb,
        miDebuggerPath: debuggerPath,
        setupCommands: [
            {
                description: localize('enable.pretty.printing', 'Enable pretty-printing for gdb'),
                text: '-enable-pretty-printing',
                ignoreFailures: true
            }
        ],
        program: target.path
    };
}

async function createLLDBDebugConfiguration(debuggerPath: string, target: ExecutableTarget): Promise<VSCodeDebugConfiguration> {
    if (!await checkDebugger(debuggerPath)) {
        throw new Error(localize('gdb.not.found', 'Unable to find GDB in default search path and {0}.', debuggerPath));
    }

    return {
        type: 'cppdbg',
        name: `Debug ${target.name}`,
        request: 'launch',
        cwd: path.dirname(target.path),
        args: [],
        MIMode: MIModes.lldb,
        miDebuggerPath: debuggerPath,
        program: target.path
    };
}

function createMsvcDebugConfiguration(target: ExecutableTarget): VSCodeDebugConfiguration {
    return {
        type: 'cppvsdbg',
        name: `Debug ${target.name}`,
        request: 'launch',
        cwd: path.dirname(target.path),
        args: [],
        program: target.path
    };
}

type DebuggerMIMode = 'gdb' | 'lldb';

type DebuggerGenerators = {
    [MIMode in DebuggerMIMode]: {
        miMode: MIMode;
        createConfig(debuggerPath: string, target: ExecutableTarget): Promise<VSCodeDebugConfiguration>;
    };
};

const debuggerGenerators: DebuggerGenerators = {
    gdb: {
        miMode: 'gdb',
        createConfig: createGDBDebugConfiguration
    },
    lldb: {
        miMode: 'lldb',
        createConfig: createLLDBDebugConfiguration
    }
};

function searchForCompilerPathInCache(cache: CMakeCache): string | null {
    const languages = ['CXX', 'C', 'CUDA'];
    for (const lang of languages) {
        const entry = cache.get(`CMAKE_${lang}_COMPILER`);
        if (!entry) {
            continue;
        }
        return entry.value as string;
    }
    return null;
}

export async function getDebugConfigurationFromCache(cache: CMakeCache, target: ExecutableTarget, platform: string, modeOverride?: MIModes, debuggerPathOverride?: string): Promise<VSCodeDebugConfiguration | null> {
    const entry = cache.get('CMAKE_LINKER');
    if (entry !== null && !modeOverride && !debuggerPathOverride) {
        const linker = entry.value as string;
        const isMsvcLinker = linker.endsWith('link.exe') || linker.endsWith('ld.lld.exe');
        if (isMsvcLinker) {
            return createMsvcDebugConfiguration(target);
        }
    }

    const debuggerName = modeOverride || (platform === 'darwin' ? 'lldb' : 'gdb');
    const description = debuggerGenerators[debuggerName];

    if (debuggerPathOverride) {
        if (path.isAbsolute(debuggerPathOverride) && await fs.exists(debuggerPathOverride)) {
            return description.createConfig(debuggerPathOverride, target);
        }
        log.warning(localize('invalid.miDebuggerPath.override',
            '{0} in {1} must be an absolute path to a debugger (variable expansion is not currently supported). Got: {2}',
            '"miDebuggerPath"', '"cmake.debugConfig"', `"${debuggerPathOverride}"`));
    }

    const compilerPath = searchForCompilerPathInCache(cache);
    if (compilerPath === null) {
        throw Error(localize('no.compiler.found.in.cache', 'No compiler found in cache file.'));  // MSVC should be already found by CMAKE_LINKER
    }

    if (compilerPath.endsWith('cl.exe')) {
        return createMsvcDebugConfiguration(target);
    }

    // Look for a debugger, in the following order:
    // 1. LLDB-MI
    const clangCompilerRegex = /(clang[\+]{0,2})+(?!-cl)/gi;
    let miDebuggerPath = compilerPath.replace(clangCompilerRegex, 'lldb-mi');
    if (modeOverride !== MIModes.gdb) {
        const lldbMIReplaced = miDebuggerPath.search(new RegExp('lldb-mi')) !== -1;
        if (lldbMIReplaced) {
            // 1a. lldb-mi in the compiler path
            if (await checkDebugger(miDebuggerPath)) {
                return createLLDBDebugConfiguration(miDebuggerPath, target);
            }
        }
        if (modeOverride === MIModes.lldb || lldbMIReplaced) {
            // 1b. lldb-mi installed by CppTools
            const cppToolsExtension = vscode.extensions.getExtension('ms-vscode.cpptools');
            const cpptoolsDebuggerPath = cppToolsExtension ? path.join(cppToolsExtension.extensionPath, "debugAdapters", "lldb-mi", "bin", "lldb-mi") : undefined;
            if (cpptoolsDebuggerPath && await checkDebugger(cpptoolsDebuggerPath)) {
                return createLLDBDebugConfiguration(cpptoolsDebuggerPath, target);
            }
        }
    }

    // 2. gdb in the compiler path
    miDebuggerPath = compilerPath.replace(clangCompilerRegex, 'gdb');
    if (modeOverride !== MIModes.lldb && (miDebuggerPath.search(new RegExp('gdb')) !== -1) && await checkDebugger(miDebuggerPath)) {
        return createGDBDebugConfiguration(miDebuggerPath, target);
    }

    // 3. lldb in the compiler path
    miDebuggerPath = compilerPath.replace(clangCompilerRegex, 'lldb');
    if (modeOverride !== MIModes.gdb && (miDebuggerPath.search(new RegExp('lldb')) !== -1) && await checkDebugger(miDebuggerPath)) {
        return createLLDBDebugConfiguration(miDebuggerPath, target);
    }

    const gccCompilerRegex = /([cg]\+\+|g?cc)(?=[^\/\\]*$)/gi;
    let gdbDebuggerPath = compilerPath.replace(gccCompilerRegex, description.miMode);
    if (path.isAbsolute(gdbDebuggerPath) && !await fs.exists(gdbDebuggerPath)) {
        gdbDebuggerPath = path.join(path.dirname(compilerPath), description.miMode);
        if (process.platform === 'win32') {
            gdbDebuggerPath = gdbDebuggerPath + '.exe';
        }
    }
    if (gdbDebuggerPath.search(new RegExp(description.miMode)) !== -1) {
        return description.createConfig(gdbDebuggerPath, target);
    }

    log.warning(localize('unable.to.determine.debugger.for.compiler',
        'Unable to automatically determine debugger corresponding to compiler: {0}', compilerPath));
    return null;
}

export async function checkDebugger(debuggerPath: string): Promise<boolean> {
    const res = await proc.execute(debuggerPath, ['--version'], null, { shell: true }).result;
    return res.retc === 0;
}

export enum DebuggerType {
    cppdbg = 'cppdbg',
    lldb = 'lldb',
    gdb = 'gdb',
}

export interface NativeDebugConfiguration {
    arguments?: string;
    gdbpath?: string;
    env?: {[key: string]: string};
    debugger_args?: string[];
    pathSubstitutions?: {[key: string]: string};
    valuesFormating?: string;
    printCalls?: boolean;
    showDevDebugOutput?: boolean;
    autorun?: string[];
    stopAtEntry?: boolean;
}

export interface CodeLLDBDebugConfiguration {
    args?: string[];
    cwd?: string;
    env?: {[key: string]: string};
    envFile?: string;
    stdio?: string|null|string|object;
    terminal?: string;
    console?: string;
    stopOnEntry?: true;
    initCommands?: string[];
    targetCreateCommands?: string[];
    preRunCommands?: string[];
    processCreateCommands?: string[];
    postRunCommands?: string[];
    preTerminateCommands?: string[];
    exitCommands?: string[];
    expressions?: string;
    sourceMap?: {[key: string]: string};
    relativePathBase?: string;
    sourceLanguages?: string[];
    reverseDebugging?: boolean;
    breakpointMode?: string;
}

interface GDBDebugConfiguration extends vscode.DebugConfiguration {
    target: string;
    cwd: string;
    arguments?: string;
    gdbpath?: string;
    env?: proc.DebuggerEnvironmentVariable[];
}

interface LLDBDebugConfiguration extends vscode.DebugConfiguration {
    program: string;
    args: string | string[];
    cwd?: string;
    env?: proc.DebuggerEnvironmentVariable[];
}

export class DebuggerPickItem implements vscode.QuickPickItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly type: DebuggerType
    ) {}
}

export function getDebuggerItems(): DebuggerPickItem[] {
    return [
        new DebuggerPickItem('cppdbg', 'Debug with extension [KylinIdeTeam.cppdebug]', DebuggerType.cppdbg),
        new DebuggerPickItem('gdb', 'Debug with extension [KylinIdeTeam.kylin-debug]', DebuggerType.gdb),
        new DebuggerPickItem('lldb', 'Debug with extension [vadimcn.vscode-lldb]', DebuggerType.lldb)
    ];
}

export function getDebuggerExtId(type: DebuggerType): string {
    if (type === DebuggerType.cppdbg) {
        return 'KylinIdeTeam.cppdebug';
    } else if (type === DebuggerType.gdb) {
        return 'KylinIdeTeam.kylin-debug';
    } else if (type === DebuggerType.lldb) {
        return 'vadimcn.vscode-lldb';
    } else {
        return '';
    }
}

export async function getDebugConfigurationFromCacheK(cache: CMakeCache, target: ExecutableTarget, platform: string, debuggerType: DebuggerType, modeOverride?: MIModes, debuggerPathOverride?: string): Promise<VSCodeDebugConfiguration | GDBDebugConfiguration | LLDBDebugConfiguration | null> {
    if (debuggerType === DebuggerType.cppdbg && (platform === 'linux' || platform === 'darwin')) {
        return getDebugConfigurationFromCache(cache, target, platform, modeOverride, debuggerPathOverride);
    } else if (debuggerType === DebuggerType.gdb) {
        if (debuggerPathOverride) {
            return createGDBDebugConfigurationK(debuggerPathOverride || 'gdb', target);
        }
        const compilerPath = searchForCompilerPathInCache(cache);
        if (compilerPath === null) {
            throw Error(localize('no.compiler.found.in.cache', 'No compiler found in cache file.'));  // MSVC should be already found by CMAKE_LINKER
        }

        const clangCompilerRegex = /(clang[\+]{0,2})+(?!-cl)/gi;
        const miDebuggerPath = compilerPath.replace(clangCompilerRegex, 'gdb');
        if (modeOverride !== MIModes.lldb && (miDebuggerPath.search(new RegExp('gdb')) !== -1) && await checkDebugger(miDebuggerPath)) {
            return createGDBDebugConfigurationK(miDebuggerPath, target);
        }
        const gccCompilerRegex = /([cg]\+\+|g?cc)(?=[^\/\\]*$)/gi;
        let gdbDebuggerPath = compilerPath.replace(gccCompilerRegex, 'gdb');
        if (path.isAbsolute(gdbDebuggerPath) && !await fs.exists(gdbDebuggerPath)) {
            gdbDebuggerPath = path.join(path.dirname(compilerPath), 'gdb');
            if (process.platform === 'win32') {
                gdbDebuggerPath = gdbDebuggerPath + '.exe';
            }
        }
        if (gdbDebuggerPath.search(new RegExp('gdb')) !== -1) {
            return createGDBDebugConfigurationK(gdbDebuggerPath, target);
        }
    } else if (debuggerType === DebuggerType.lldb) {
        return createLLDBDebugConfigurationK(debuggerPathOverride || 'lldb', target);
    }
    return null;
}

async function createGDBDebugConfigurationK(debuggerPath: string, target: ExecutableTarget): Promise<GDBDebugConfiguration> {
    if (!await checkDebugger(debuggerPath)) {
        debuggerPath = 'gdb';
        if (!await checkDebugger(debuggerPath)) {
            throw new Error(localize('gdb.not.found', 'Unable to find GDB in default search path and {0}.', debuggerPath));
        }
    }

    return {
        type: 'gdb',
        name: `Debug ${target.name}`,
        request: 'launch',
        cwd: '${workspaceRoot}',
        target: target.path,
        arguments: "",
        gdbpath: debuggerPath
    };
}

async function createLLDBDebugConfigurationK(_debuggerPath: string, target: ExecutableTarget): Promise<LLDBDebugConfiguration> {
    // if (!await checkDebugger(debuggerPath)) {
    //     throw new Error(localize('gdb.not.found', 'Unable to find GDB in default search path and {0}.', debuggerPath));
    // }

    return {
        type: 'lldb',
        name: `Debug ${target.name}`,
        request: 'launch',
        cwd: '${workspaceFolder}',
        program: target.path,
        args: []
    };
}
