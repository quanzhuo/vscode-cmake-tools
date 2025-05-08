# CMake Tools Fork

This extension is a fork of `ms-vscode.cmake-tools`. It aims to improve compatibility with the clangd language server and support additional debugging extensions. It is recommended to install the `KylinIdeTeam.kylin-cpp-pack` extension pack, as this CMake extension works seamlessly with the other extensions included in the pack.

Please note that this extension conflicts with the original `ms-vscode.cmake-tools` extension. Be sure to disable or uninstall the original extension before installing this one.

[CMake Tools](https://marketplace.visualstudio.com/items?itemName=KylinIdeTeam.kylin-cmake-tools) provides the native developer a full-featured, convenient, and powerful workflow for CMake-based projects in Visual Studio Code.

## Major Changes and Enhancements

- Removed coupling with the Microsoft-maintained C/C++ extension
- Debug functionality in the project status view now supports multiple extensions, currently supported: `C/C++ Debug`, `Kylin Native Debug`, `CodeLLDB`
- Removed dependency on the `twxs.cmake` extension, now relies on the `CMake IntelliSense` extension
- Always export the compile database even when using CMake presets
- Bundled Ninja binary for specific platforms (win32-x64, linux-x64, darwin-x64, linux-arm64), and always use `Ninja` generator for these platforms
- Disabled telemetry

## Installation

To install this extension, follow these steps:
1. Open the Extensions view in VS Code (`Ctrl+Shift+X`).
2. Search for `KylinIdeTeam.kylin-cmake-tools`.
3. Click `Install`.

Additionally, install the `KylinIdeTeam.kylin-cpp-pack` extension pack for seamless integration with clangd language server.

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
