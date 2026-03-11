# Kylin CMake Workflow

Kylin CMake Workflow is a community-maintained CMake extension from `KylinIdeTeam` for Visual Studio Code. It is based on the upstream `ms-vscode.cmake-tools` project, but is distributed as a separate extension with its own maintenance scope, packaging choices, and integration targets. It is not affiliated with or endorsed by Microsoft.

This extension is intended for teams that prefer a clangd-first C/C++ workflow and broader debugger support. It is also part of the `KylinIdeTeam.kylin-cpp-pack` extension pack, and installing that extension pack is the recommended setup for the full C/C++ experience. If you install this extension, disable the official `ms-vscode.cmake-tools` extension to avoid command and feature overlap.

## Major Changes and Enhancements

- Removed coupling with the Microsoft-maintained C/C++ extension
- Debug functionality in the project status view now supports multiple extensions, currently supported: `C/C++ Debug`, `Kylin Native Debug`, `CodeLLDB`
- Removed dependency on the `twxs.cmake` extension, now relies on the `CMake IntelliSense` extension
- Always export the compile database even when using CMake presets
- Disabled telemetry

## Fork Positioning

- Extension ID: `KylinIdeTeam.kylin-cmake-tools`
- Marketplace name: `Kylin CMake Workflow`
- Primary focus: clangd-oriented workflows, bundled toolchain conveniences, and multi-debugger integration

## Installation

To install this extension, follow these steps:
1. Open the Extensions view in VS Code (`Ctrl+Shift+X`).
2. Search for `KylinIdeTeam.kylin-cmake-tools`.
3. Click `Install`.

Additionally, install the `KylinIdeTeam.kylin-cpp-pack` extension pack for tighter integration with the surrounding C/C++ tooling.

## Upstream and Support

This repository tracks and adapts upstream CMake Tools behavior where it makes sense for the Kylin distribution. Bugs, packaging changes, and feature requests for this extension should be reported to the Kylin repository, not to the Microsoft extension team.

## Important doc links

Some of the links below point to upstream Microsoft documentation for general CMake and VS Code usage.

- [CMake Tools quick start](https://code.visualstudio.com/docs/cpp/CMake-linux)
- [Configure and build a project with CMake Presets](docs/cmake-presets.md)
- [Configure a project with kits and variants](docs/how-to.md#configure-a-project)
- [Build a project with kits and variants](docs/how-to.md#build-a-project)
- [Configure and build a project using tasks](docs/tasks.md)
- [Debug a project](docs/how-to.md#debug-a-project)
- [Configure CMake Tools settings](docs/cmake-settings.md)
- [How to](docs/how-to.md)
- [FAQ](docs/faq.md)
- [Read the online documentation](docs/README.md)
- [Contribute](CONTRIBUTING.md)

## Issues? Questions? Feature requests?

**PLEASE**, if you experience any problems, have any questions, or have an idea
for a new feature, create an issue on [the GitHub page](https://github.com/quanzhuo/vscode-cmake-tools)!
