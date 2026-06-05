# What's New?

## 0.3.1

Bug Fixes

- 修复 [Issue 4951](https://github.com/microsoft/vscode-cmake-tools/issues/4951)： cmake tools api 报告 sourceDirectory 不是文件夹的问题，

## 0.3.0

Improvements:

- 同步上游更新，基于 tag v1.23.52
- 扩展 CMake Tools API，使 clangd 插件可以从 cmake Tools 插件获取编译命令
- 去掉内置的 Ninja Generator，现在 clangd 可以直接从 CMake Tools API 中获取编译命令
- CMake 视图中去掉了选择调试扩展的选项，因为现在 CMake Tools 扩展已经支持通过 `cmake.debugConfig` 来配置自定义的调试扩展
- 当快速调试命中 MSVC 风格工具链且未配置 `cmake.debugConfig.type` 时，不再默认生成 `cppvsdbg`，而是引导用户安装并切换到 CodeLLDB，或手动配置 `cmake.debugConfig`

## 0.2.0

Improvements:

- Sync changes from upstream repository, based on tag v1.22.28
- Update bundled Ninja to version 1.13.2
- Update Readme, logo, Display name to distinguish from the original CMake Tools extension

## 0.1.0

Improvements:

- Sync changes from upstream repository, based on commit 732a7164334d591b0cd725946bf0226e44914cd7 (v1.21.36-12-g732a7164)

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
