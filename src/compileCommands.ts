import { CMakeCache } from '@cmt/cache';
import CMakeProject from '@cmt/cmakeProject';
import { CodeModelConfiguration, CodeModelContent, CodeModelFileGroup, CodeModelTarget, CodeModelToolchain } from '@cmt/drivers/codeModel';
import { Environment } from '@cmt/environmentVariables';
import { createLogger } from '@cmt/logging';
import * as shlex from '@cmt/shlex';
import * as util from '@cmt/util';
import { findCLCompilerPath } from '@cmt/kits/kit';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as nls from 'vscode-nls';

nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize: nls.LocalizeFunc = nls.loadMessageBundle();

const log = createLogger('compile-commands');

type SupportedLanguage = 'C' | 'CXX' | 'OBJC' | 'OBJCXX' | 'CUDA';

interface TargetDefaults {
    name: string;
    sourceDirectory?: string;
    includePath?: Array<{ path: string; isSystem?: boolean }>;
    compileCommandFragments: string[];
    defines?: string[];
    language?: SupportedLanguage;
}

interface CompileCommandContext {
    cache: CMakeCache;
    codeModelContent: CodeModelContent;
    buildDirectory: string;
    activeTarget: string | null;
    activeBuildTypeVariant: string | null;
    clCompilerPath: string | null;
}

interface FallbackCommandCandidate extends ResolvedCompileCommandInternal {
    sourceDirectory?: string;
}

export interface ResolvedCompileCommandInternal {
    file: string;
    sourceFile: string;
    commandSourceFile: string;
    workingDirectory: string;
    compilationCommand: string[];
    compilerPath?: string;
    targetName?: string;
    configurationName?: string;
    language?: SupportedLanguage;
    inferred: boolean;
}

export interface CompilationDatabaseInfoInternal {
    state: 'available' | 'unavailable' | 'unknown';
    path?: string;
    generator?: string;
    reason?: string;
}

// CMake emits compile_commands.json only for Makefile and Ninja generators.
const compileCommandsGenerators = new Set([
    'Borland Makefiles',
    'MSYS Makefiles',
    'MinGW Makefiles',
    'NMake Makefiles',
    'NMake Makefiles JOM',
    'Unix Makefiles',
    'Watcom WMake',
    'Ninja',
    'Ninja Multi-Config'
]);

function normalizeLanguage(language?: string): SupportedLanguage | undefined {
    switch (language) {
        case 'C':
        case 'CXX':
        case 'OBJC':
        case 'OBJCXX':
        case 'CUDA':
            return language;
        case 'RC':
        case 'Swift':
            return undefined;
        default:
            return 'CXX';
    }
}

function isClStyleCompiler(compilerPath: string): boolean {
    const compilerName = path.basename(compilerPath).toLocaleLowerCase();
    return compilerName === 'cl' || compilerName === 'cl.exe'
        || compilerName === 'clang-cl' || compilerName === 'clang-cl.exe';
}

function getAsFlags(fragments?: string[]): string[] {
    if (!fragments) {
        return [];
    }
    return [...util.flatMap(fragments, fragment => shlex.split(fragment))];
}

function firstDefined<T>(values: Iterable<T | undefined>, predicate?: (value: T) => boolean): T | undefined {
    for (const value of values) {
        if (value !== undefined && (!predicate || predicate(value))) {
            return value;
        }
    }
    return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
    return args.some(arg => arg === flag);
}

function hasFlagWithValue(args: string[], joinedPrefixes: string[], splitFlags: string[], value: string): boolean {
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (joinedPrefixes.some(prefix => arg === `${prefix}${value}`)) {
            return true;
        }
        if (splitFlags.includes(arg) && args[index + 1] === value) {
            return true;
        }
    }
    return false;
}

function appendUniqueArg(args: string[], arg: string): void {
    if (!hasFlag(args, arg)) {
        args.push(arg);
    }
}

function appendDefineArgs(args: string[], defines: string[], clStyle: boolean): void {
    const joinedPrefix = clStyle ? '/D' : '-D';
    const splitFlag = clStyle ? '/D' : '-D';
    for (const define of defines) {
        if (!hasFlagWithValue(args, [joinedPrefix], [splitFlag], define)) {
            args.push(`${joinedPrefix}${define}`);
        }
    }
}

function appendIncludeArgs(args: string[], includes: Array<{ path: string; isSystem?: boolean }>, clStyle: boolean): void {
    for (const include of includes) {
        if (clStyle || !include.isSystem) {
            const prefix = clStyle ? '/I' : '-I';
            if (!hasFlagWithValue(args, [prefix], [prefix], include.path)) {
                args.push(`${prefix}${include.path}`);
            }
        } else if (!hasFlagWithValue(args, [], ['-isystem'], include.path)) {
            args.push('-isystem', include.path);
        }
    }
}

function appendFrameworkArgs(args: string[], frameworks: Array<{ path: string }>, clStyle: boolean): void {
    if (clStyle) {
        return;
    }
    const frameworkDirs = Array.from(new Set(frameworks.map(framework => path.dirname(framework.path))));
    for (const frameworkDir of frameworkDirs) {
        appendUniqueArg(args, `-F${frameworkDir}`);
    }
}

function appendSysrootArg(args: string[], sysroot: string | undefined, clStyle: boolean): void {
    if (!sysroot || clStyle) {
        return;
    }
    appendUniqueArg(args, `--sysroot=${sysroot}`);
}

function appendTargetArg(args: string[], target: string | undefined): void {
    if (!target) {
        return;
    }
    const hasTargetFlag = args.some((arg, index) => arg.startsWith('--target=') || (arg === '-target' && args[index + 1]));
    if (!hasTargetFlag) {
        args.push(`--target=${target}`);
    }
}

function ensureSourceFileArg(args: string[], filePath: string): void {
    const normalizedFilePath = util.platformNormalizePath(filePath);
    const hasSourceArg = args.some(arg => util.platformNormalizePath(arg) === normalizedFilePath);
    if (!hasSourceArg) {
        args.push(filePath);
    }
}

function isTruthyCMakeValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    return typeof value === 'string' && util.isTruthy(value);
}

async function isValidCompilationDatabase(filePath: string): Promise<boolean> {
    try {
        // Stale or empty files should not suppress LSP-provided commands.
        const content = await fs.readFile(filePath, 'utf8');
        const commands = JSON.parse(content);
        return Array.isArray(commands) && commands.length > 0;
    } catch {
        return false;
    }
}

function resolveCodeModelSourcePath(sourcePath: string, sourceDirectory: string): string {
    if (process.platform === 'win32') {
        const win32Root = path.win32.parse(sourcePath).root;
        const isDriveAbsolute = /^[a-z]:[\\/]/i.test(sourcePath);
        const isUncAbsolute = win32Root.startsWith('\\\\');
        if (!isDriveAbsolute && !isUncAbsolute) {
            return util.lightNormalizePath(path.resolve(sourceDirectory, sourcePath.replace(/^[\\/]+/, '')));
        }
    }
    return util.resolvePath(sourcePath, sourceDirectory);
}

async function getDirectoryEntries(
    directoryPath: string,
    directoryEntryCache: Map<string, Map<string, string> | null>
): Promise<Map<string, string> | null> {
    const normalizedDirectoryPath = util.platformNormalizePath(directoryPath);
    const cachedEntries = directoryEntryCache.get(normalizedDirectoryPath);
    if (cachedEntries !== undefined) {
        return cachedEntries;
    }

    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });
        const entriesByName = new Map(entries.map(entry => [entry.name.toLocaleLowerCase(), entry.name]));
        directoryEntryCache.set(normalizedDirectoryPath, entriesByName);
        return entriesByName;
    } catch {
        directoryEntryCache.set(normalizedDirectoryPath, null);
        return null;
    }
}

async function resolveDisplayPath(
    filePath: string,
    displayPathCache: Map<string, string>,
    directoryEntryCache: Map<string, Map<string, string> | null>
): Promise<string> {
    const normalizedFilePath = util.lightNormalizePath(filePath);
    if (process.platform !== 'win32') {
        return normalizedFilePath;
    }

    const cachedDisplayPath = displayPathCache.get(normalizedFilePath);
    if (cachedDisplayPath) {
        return cachedDisplayPath;
    }

    const parsedPath = path.win32.parse(normalizedFilePath);
    const relativeSegments = normalizedFilePath.slice(parsedPath.root.length).split(/[\\/]+/).filter(segment => segment.length > 0);
    if (relativeSegments.length === 0) {
        displayPathCache.set(normalizedFilePath, normalizedFilePath);
        return normalizedFilePath;
    }

    let resolvedPath = parsedPath.root;
    for (const segment of relativeSegments) {
        const entriesByName = await getDirectoryEntries(resolvedPath, directoryEntryCache);
        const resolvedSegment = entriesByName?.get(segment.toLocaleLowerCase()) || segment;
        resolvedPath = path.win32.join(resolvedPath, resolvedSegment);
    }

    const displayPath = util.lightNormalizePath(resolvedPath);
    displayPathCache.set(normalizedFilePath, displayPath);
    return displayPath;
}

function getCompilerToolchain(codeModelContent: CodeModelContent, language?: SupportedLanguage): CodeModelToolchain | undefined {
    return codeModelContent.toolchains?.get(language ?? '')
        || codeModelContent.toolchains?.get('CXX')
        || codeModelContent.toolchains?.get('C');
}

function getCompilerCacheEntry(cache: CMakeCache, language?: SupportedLanguage) {
    if (language) {
        const languageCompiler = cache.get(`CMAKE_${language}_COMPILER`);
        if (languageCompiler) {
            return languageCompiler;
        }
    }
    return cache.get('CMAKE_CXX_COMPILER') || cache.get('CMAKE_C_COMPILER');
}

function createTargetDefaults(target: CodeModelTarget, groups: CodeModelFileGroup[]): TargetDefaults {
    const includePath = [...new Set(util.flatMap(groups, group => group.includePath || []))] as Array<{ path: string; isSystem?: boolean }>;
    const compileCommandFragments = util.first(groups.filter(group => group.language !== 'RC'), group => group.compileCommandFragments || []);
    const defines = [...new Set(util.flatMap(groups, group => group.defines || []))];
    return {
        name: target.name,
        sourceDirectory: target.sourceDirectory,
        includePath,
        compileCommandFragments,
        defines,
        language: normalizeLanguage(firstDefined(groups.map(group => group.language), language => !!language))
    };
}

async function loadContext(project: CMakeProject): Promise<CompileCommandContext | null> {
    const driver = await project.getCMakeDriverInstance();
    if (!driver) {
        return null;
    }

    const codeModelContent = project.codeModelContent || driver.codeModelContent;
    if (!codeModelContent) {
        return null;
    }

    let cache: CMakeCache;
    try {
        cache = await CMakeCache.fromPath(await project.cachePath);
    } catch (error) {
        log.warning(localize('failed.to.load.cmake.cache', 'Failed to load CMake cache while resolving compile commands: {0}', util.errorToString(error)));
        return null;
    }

    const configureEnvironment: Environment = await driver.getConfigureEnvironment();
    const clCompilerPath = await findCLCompilerPath(configureEnvironment);
    const buildDirectory = await project.buildDirectory();

    return {
        cache,
        codeModelContent,
        buildDirectory: buildDirectory || await project.binaryDir,
        activeTarget: project.defaultBuildTarget,
        activeBuildTypeVariant: await project.currentBuildType(),
        clCompilerPath
    };
}

function getActiveConfiguration(codeModelContent: CodeModelContent, activeBuildTypeVariant: string | null): CodeModelConfiguration | undefined {
    if (codeModelContent.configurations.length === 0) {
        return undefined;
    }

    const seenBuildTypes = new Set(codeModelContent.configurations.map(configuration => configuration.name));
    const effectiveBuildType = activeBuildTypeVariant && seenBuildTypes.has(activeBuildTypeVariant)
        ? activeBuildTypeVariant
        : codeModelContent.configurations[0].name;

    return codeModelContent.configurations.find(configuration => configuration.name === effectiveBuildType)
        || codeModelContent.configurations[0];
}

function buildResolvedCompileCommand(
    fileGroup: CodeModelFileGroup,
    target: CodeModelTarget,
    targetDefaults: TargetDefaults,
    context: CompileCommandContext,
    configurationName: string,
    requestedFile: string,
    sourceFile: string,
    inferred: boolean,
    commandSourceFile: string = requestedFile
): ResolvedCompileCommandInternal | undefined {
    const language = normalizeLanguage(fileGroup.language) || targetDefaults.language;
    if (!language) {
        return undefined;
    }

    const toolchain = getCompilerToolchain(context.codeModelContent, language);
    const compilerPath = toolchain?.path
        || getCompilerCacheEntry(context.cache, language)?.as<string>()
        || context.clCompilerPath
        || undefined;

    if (!compilerPath) {
        return undefined;
    }

    const clStyle = isClStyleCompiler(compilerPath);
    const targetFromToolchains = toolchain?.target;
    const compileCommandFragments = fileGroup.compileCommandFragments || targetDefaults.compileCommandFragments;
    const defines = fileGroup.defines || targetDefaults.defines || [];
    const includePath = (fileGroup.includePath as Array<{ path: string; isSystem?: boolean }> | undefined) || targetDefaults.includePath || [];
    const frameworks = fileGroup.frameworks || [];
    const workingDirectory = util.platformNormalizePath((target as { buildDirectory?: string }).buildDirectory || context.buildDirectory);

    const compilationCommand = [util.platformNormalizePath(compilerPath), ...getAsFlags(compileCommandFragments)];
    appendDefineArgs(compilationCommand, defines, clStyle);
    appendIncludeArgs(compilationCommand, includePath, clStyle);
    appendFrameworkArgs(compilationCommand, frameworks, clStyle);
    appendSysrootArg(compilationCommand, target.sysroot, clStyle);
    appendTargetArg(compilationCommand, targetFromToolchains);
    ensureSourceFileArg(compilationCommand, commandSourceFile);

    return {
        file: util.lightNormalizePath(requestedFile),
        sourceFile: util.lightNormalizePath(sourceFile),
        commandSourceFile: util.platformNormalizePath(commandSourceFile),
        workingDirectory,
        compilationCommand,
        compilerPath: util.platformNormalizePath(compilerPath),
        targetName: target.name,
        configurationName,
        language,
        inferred
    };
}

function chooseBestFallback(filePath: string, candidates: FallbackCommandCandidate[], activeTarget: string | null): FallbackCommandCandidate | undefined {
    if (activeTarget) {
        const activeTargetCandidate = candidates.find(candidate => candidate.targetName === activeTarget);
        if (activeTargetCandidate) {
            return activeTargetCandidate;
        }
    }

    const normalizedFilePath = util.platformNormalizePath(filePath);
    let bestCandidate: FallbackCommandCandidate | undefined;
    let bestScore = -1;
    for (const candidate of candidates) {
        const sourceDirectory = candidate.sourceDirectory ? util.platformNormalizePath(candidate.sourceDirectory) : '';
        const score = sourceDirectory && normalizedFilePath.startsWith(sourceDirectory) ? sourceDirectory.length : 0;
        if (score > bestScore) {
            bestCandidate = candidate;
            bestScore = score;
        }
    }

    return bestCandidate || candidates[0];
}

async function collectCommands(project: CMakeProject) {
    const context = await loadContext(project);
    if (!context) {
        return null;
    }

    const configuration = getActiveConfiguration(context.codeModelContent, context.activeBuildTypeVariant);
    if (!configuration) {
        return null;
    }

    const exactCommands = new Map<string, Map<string, ResolvedCompileCommandInternal>>();
    const fallbackCommands: FallbackCommandCandidate[] = [];
    const displayPathCache = new Map<string, string>();
    const directoryEntryCache = new Map<string, Map<string, string> | null>();

    for (const projectEntry of configuration.projects) {
        for (const target of projectEntry.targets) {
            const reversedGroups = (target.fileGroups || []).slice().reverse();
            const targetDefaults = createTargetDefaults(target, reversedGroups);
            const sourceBaseDirectory = target.sourceDirectory
                || (projectEntry as { sourceDirectory?: string }).sourceDirectory
                || project.sourceDir;
            const filteredGroups = reversedGroups.filter(group => !group.isGenerated);
            const groups = filteredGroups.length > 0 ? filteredGroups : reversedGroups;
            let fallbackRecorded = false;

            for (const group of groups) {
                const representativeSource = firstDefined(group.sources, source => !!source);
                if (!representativeSource) {
                    continue;
                }
                const resolvedRepresentativeSource = resolveCodeModelSourcePath(representativeSource, sourceBaseDirectory);
                const displayRepresentativeSource = await resolveDisplayPath(resolvedRepresentativeSource, displayPathCache, directoryEntryCache);

                const fallbackCommand = buildResolvedCompileCommand(
                    group,
                    target,
                    targetDefaults,
                    context,
                    configuration.name,
                    displayRepresentativeSource,
                    displayRepresentativeSource,
                    false,
                    representativeSource
                );

                if (!fallbackRecorded && fallbackCommand) {
                    fallbackCommands.push({
                        ...fallbackCommand,
                        sourceDirectory: target.sourceDirectory
                    });
                    fallbackRecorded = true;
                }

                for (const source of group.sources) {
                    const resolvedSource = resolveCodeModelSourcePath(source, sourceBaseDirectory);
                    const displaySource = await resolveDisplayPath(resolvedSource, displayPathCache, directoryEntryCache);
                    const resolvedCommand = buildResolvedCompileCommand(
                        group,
                        target,
                        targetDefaults,
                        context,
                        configuration.name,
                        displaySource,
                        displaySource,
                        false,
                        source
                    );
                    if (!resolvedCommand) {
                        continue;
                    }

                    const normalizedSource = util.platformNormalizePath(resolvedSource);
                    let commandsByTarget = exactCommands.get(normalizedSource);
                    if (!commandsByTarget) {
                        commandsByTarget = new Map<string, ResolvedCompileCommandInternal>();
                        exactCommands.set(normalizedSource, commandsByTarget);
                    }
                    commandsByTarget.set(target.name, resolvedCommand);
                }
            }
        }
    }

    return {
        exactCommands,
        fallbackCommands,
        activeTarget: context.activeTarget
    };
}

export async function resolveCompileCommand(project: CMakeProject, filePath: string): Promise<ResolvedCompileCommandInternal | undefined> {
    const commands = await collectCommands(project);
    if (!commands) {
        return undefined;
    }

    const normalizedFilePath = util.platformNormalizePath(filePath);
    const exactCommandCandidates = commands.exactCommands.get(normalizedFilePath);
    if (exactCommandCandidates && exactCommandCandidates.size > 0) {
        const exactCommand = commands.activeTarget && exactCommandCandidates.has(commands.activeTarget)
            ? exactCommandCandidates.get(commands.activeTarget)
            : exactCommandCandidates.values().next().value as ResolvedCompileCommandInternal | undefined;
        if (!exactCommand) {
            return undefined;
        }

        const resolvedFilePath = util.lightNormalizePath(filePath);
        return {
            ...exactCommand,
            file: resolvedFilePath,
            sourceFile: resolvedFilePath
        };
    }

    const fallbackCommand = chooseBestFallback(normalizedFilePath, commands.fallbackCommands, commands.activeTarget);
    if (!fallbackCommand) {
        return undefined;
    }

    return {
        ...fallbackCommand,
        file: util.lightNormalizePath(filePath),
        inferred: true,
        compilationCommand: [...fallbackCommand.compilationCommand.filter(arg => {
            const normalizedArg = util.platformNormalizePath(arg);
            return normalizedArg !== util.platformNormalizePath(fallbackCommand.sourceFile)
                && normalizedArg !== fallbackCommand.commandSourceFile;
        })]
    };
}

export async function resolveTranslationUnitCompileCommands(project: CMakeProject): Promise<ResolvedCompileCommandInternal[]> {
    const commands = await collectCommands(project);
    if (!commands) {
        return [];
    }

    const deduplicatedCommands = new Map<string, ResolvedCompileCommandInternal>();
    for (const [filePath, commandsByTarget] of commands.exactCommands) {
        const preferredCommand = commands.activeTarget && commandsByTarget.has(commands.activeTarget)
            ? commandsByTarget.get(commands.activeTarget)
            : commandsByTarget.values().next().value as ResolvedCompileCommandInternal | undefined;
        if (preferredCommand) {
            deduplicatedCommands.set(filePath, preferredCommand);
        }
    }

    return [...deduplicatedCommands.values()];
}

export async function resolveCompilationDatabaseInfo(project: CMakeProject): Promise<CompilationDatabaseInfoInternal> {
    let cache: CMakeCache;
    try {
        cache = await CMakeCache.fromPath(await project.cachePath);
    } catch (error) {
        return {
            state: 'unknown',
            reason: `Failed to read CMake cache: ${util.errorToString(error)}`
        };
    }

    const buildDirectory = await project.buildDirectory() || await project.binaryDir;
    if (!buildDirectory) {
        return {
            state: 'unknown',
            reason: 'Build directory is not available'
        };
    }

    const generator = cache.get('CMAKE_GENERATOR')?.as<string>();
    if (!generator) {
        return {
            state: 'unknown',
            path: path.join(buildDirectory, 'compile_commands.json'),
            reason: 'CMAKE_GENERATOR is not available in the cache'
        };
    }

    const cdbPath = path.join(buildDirectory, 'compile_commands.json');
    if (!compileCommandsGenerators.has(generator)) {
        return {
            state: 'unavailable',
            path: cdbPath,
            generator,
            reason: `${generator} does not generate compile_commands.json`
        };
    }

    const exportEntry = cache.get('CMAKE_EXPORT_COMPILE_COMMANDS');
    if (!isTruthyCMakeValue(exportEntry?.value)) {
        return {
            state: 'unavailable',
            path: cdbPath,
            generator,
            reason: 'CMAKE_EXPORT_COMPILE_COMMANDS is not enabled'
        };
    }

    if (!await isValidCompilationDatabase(cdbPath)) {
        return {
            state: 'unavailable',
            path: cdbPath,
            generator,
            reason: 'compile_commands.json is missing or invalid'
        };
    }

    return {
        state: 'available',
        path: cdbPath,
        generator
    };
}
