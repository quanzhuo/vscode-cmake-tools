# What's New?

## 0.0.4

Improvements:

- 针对 win32-x64, linux-x64, darwin-x64, linux-arm64 平台，内置 Ninja 二进制文件，在这些平台上，始终使用 `Ninja` 生成器

Bug fixes:

- 修复 CMakeProject 中的环境变量扩展逻辑，确保正确合并 env 和 configureEnv: https://github.com/microsoft/vscode-cmake-tools/issues/4359

## 0.0.3

Improvements:

- 去掉掉 CMake Tools 中的状态栏选项移动通知逻辑
- 修复状态栏不显示 Debug 按钮的问题


## 0.0.2

Features:

- Native Debug(KylinIdeTeam.kylin-debug), Codelldb 支持配置额外的调试参数

Bugfixes:

- 修复调试配置当中环境变量展开失败的问题


## 0.0.1

- Based on tag v0.19.52
- Removed coupling with the Microsoft-maintained C/C++ extension
- Debug functionality in the project status view now supports multiple extensions, currently supported: `C/C++ Debug`, `Kylin Native Debug`, `CodeLLDB`
- Removed dependency on the `twxs.cmake` extension, now relies on the `CMake IntelliSense` extension
- Always export the compile database even when using CMake presets
- Disabled telemetry
