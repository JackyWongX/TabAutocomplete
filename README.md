# TabAutoComplete - VSCode智能代码补全扩展

## 简介

TabAutoComplete 是一个强大的 VSCode 扩展，它可以连接到您本地运行的 Ollama 大语言模型服务，提供智能的、上下文相关的代码补全功能。通过使用最先进的大语言模型，为您提供更智能、更准确的代码建议。

## 功能特点

- 🚀 **智能代码补全** - 基于上下文自动补全代码，支持多种编程语言
- 🔄 **Tab键补全** - 使用Tab键快速接受补全建议
- 🔒 **本地隐私** - 所有处理都在本地进行，代码不会发送到云端
- ⚙️ **高度可定制** - 灵活配置模型参数、触发时机和上下文大小
- 📚 **智能上下文** - 自动分析代码上下文，提供更相关的补全
- 💾 **智能缓存** - 缓存常用代码片段，提高响应速度
- 🎯 **文件类型过滤** - 可配置启用/禁用特定文件类型的代码补全

## 前提条件

在使用此扩展前，您需要:

1. 在本地安装并运行 [Ollama](https://github.com/ollama/ollama)
2. 下载一个支持代码生成的语言模型，推荐使用 `codellama:7b`

## 安装

1. 在 VSCode 扩展市场中搜索 "TabAutoComplete"
2. 点击安装
3. 重启 VSCode（如需要）

## 快速开始

1. 确保 Ollama 服务正在本地运行（默认端口: 11434）
2. 打开 VSCode 设置，搜索 "TabAutoComplete" 配置你的模型和首选项
3. 开始编码，输入一些代码，稍等片刻（默认300ms），自动补全将会出现
4. 按 `Tab` 键接受建议的代码
5. 按 `Esc` 键忽略补全建议

## 配置选项

### 通用设置

- `tabAutoComplete.general.enabled`: 启用或禁用代码补全功能
- `tabAutoComplete.general.triggerDelay`: 触发代码补全的延迟时间（毫秒）
- `tabAutoComplete.debounceDelay`: 输入防抖延迟时间（毫秒）

### 模型设置

- `tabAutoComplete.model.url`: Ollama API 的 URL 地址
- `tabAutoComplete.model.name`: 使用的 Ollama 模型名称
- `tabAutoComplete.model.temperature`: 生成的温度参数 (0-1)
- `tabAutoComplete.model.maxTokens`: 每次补全生成的最大 token 数

### 上下文设置

- `tabAutoComplete.context.maxLines`: 提供给模型的上下文最大字符数
- `tabAutoComplete.context.includeImports`: 是否在上下文中包含导入/引用语句
- `tabAutoComplete.context.includeComments`: 是否在上下文中包含注释

### 缓存设置

- `tabAutoComplete.cache.enabled`: 是否启用代码补全缓存
- `tabAutoComplete.cache.retentionPeriodHours`: 缓存保留时间（小时）
- `tabAutoComplete.cache.maxSnippets`: 最大缓存条目数

### 文件类型设置

- `tabAutoComplete.fileTypes.enabled`: 启用代码补全的文件类型
- `tabAutoComplete.fileTypes.disabled`: 禁用代码补全的文件类型

### 高级设置

- `tabAutoComplete.advanced.adaptToProjectSize`: 根据项目大小自动调整参数
- `tabAutoComplete.prompt.template`: 自定义代码补全提示模板
- `tabAutoComplete.logging.level`: 日志级别设置

## 命令列表

使用 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS) 打开命令面板，可以访问以下命令:

- `TabAutoComplete: 启用` - 启用插件
- `TabAutoComplete: 禁用` - 禁用插件
- `TabAutoComplete: 选择模型` - 更改使用的 Ollama 模型
- `TabAutoComplete: 清除缓存` - 清除代码补全缓存
- `TabAutoComplete: 测试连接` - 测试与 Ollama 服务的连接
- `TabAutoComplete: 显示当前配置` - 查看当前设置

## 常见问题

### Q: 插件无法连接到 Ollama 服务

确保:
1. Ollama 服务正在运行
2. API URL 配置正确（默认为 `http://localhost:11434`）
3. 指定的模型已下载并可用

### Q: 代码补全速度较慢

可以尝试:
- 使用更小的模型
- 减少上下文字符数（`context.maxLines`）
- 启用缓存功能
- 增加触发延迟
- 调整防抖延迟时间

### Q: 生成的代码质量不理想

建议:
- 调低模型温度（`model.temperature`）
- 使用专门的代码模型（如 codellama）
- 适当增加上下文字符数
- 调整提示模板

## 隐私说明

- 所有代码和数据仅与本地 Ollama 服务通信
- 不会将代码发送到任何云服务
- 缓存数据仅存储在本地

## 许可证

MIT

## 技术栈

- TypeScript
- VS Code Extension API
- Ollama API
- Webpack
- LRU Cache

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

- [Ollama 项目](https://github.com/ollama/ollama)
- [Visual Studio Code](https://github.com/microsoft/vscode) 