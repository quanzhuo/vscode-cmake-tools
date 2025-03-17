# CMake Tools Fork

This extension is a fork of `ms-vscode.cmake-tools`. It conflicts with the original extension, So be sure to disable or uninstall the original extension before installing this one. This fork aims to make CMake Tools work better with the clangd language server and support other debugging extensions.

## Changes

- Removed coupling with the Microsoft-maintained C/C++ extension
- Debug functionality in the project status view now supports multiple extensions, currently supported: `C/C++ Debug`, `Kylin Native Debug`, `CodeLLDB`
- Removed dependency on the `twxs.cmake` extension, now relies on the `CMake IntelliSense` extension
- Always export the compile database even when using CMake presets
- Disabled telemetry

[CMake Tools](https://marketplace.visualstudio.com/items?itemName=KylinIdeTeam.kylin-cmake-tools) provides the native developer a full-featured, convenient, and powerful workflow for CMake-based projects in Visual Studio Code.

## Important doc links

The following documentation is provided by Microsoft.

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
