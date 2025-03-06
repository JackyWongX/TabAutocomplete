# VSCode Ollama 代码补全

## 简介

VSCode Ollama 代码补全是一个强大的 VSCode 扩展，它可以连接到您本地运行的 Ollama 大语言模型服务，提供智能的、上下文相关的代码补全功能。与传统的基于规则或统计的代码补全不同，这个扩展利用最先进的大语言模型，为您提供更智能、更准确的代码建议。

![插件演示截图](images/demo.png)

## 功能特点

- 🚀 **智能代码补全** - 基于上下文自动补全代码，支持多种编程语言
- 🔄 **连续补全** - 接受补全后，自动继续提供后续代码建议
- 🔒 **本地隐私** - 所有处理都在本地进行，代码不会发送到云端
- ⚙️ **高度可定制** - 灵活配置模型参数、触发时机和上下文大小
- 📚 **跨文件学习** - 学习您最近修改的代码，提供更相关的补全
- 💾 **智能缓存** - 缓存常用代码片段，提高响应速度

## 前提条件

在使用此扩展前，您需要:

1. 在本地安装并运行 [Ollama](https://github.com/ollama/ollama)
2. 下载一个支持代码生成的语言模型，如 `codellama:7b` 或 `starcoder`

## 安装

1. 在 VSCode 扩展市场中搜索 "Ollama 代码补全"
2. 点击安装
3. 重启 VSCode（如需要）

## 快速开始

1. 确保 Ollama 服务正在本地运行（默认端口: 11434）
2. 打开 VSCode 设置，搜索 "Ollama" 配置你的模型和首选项
3. 开始编码，输入一些代码或注释，稍等片刻，自动补全将会出现
4. 按 `Tab` 键接受建议的代码
5. 继续编码或等待更多的代码建议

## 使用方法

### 基础用法

1. **触发补全** - 当您输入代码或注释后，短暂停顿（默认300ms），补全建议将自动出现
2. **接受补全** - 按 `Tab` 键接受当前的补全建议
3. **忽略补全** - 按 `Esc` 或继续输入来忽略补全
4. **切换启用/禁用** - 点击状态栏上的 Ollama 图标可快速切换功能

### 命令面板

使用 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS) 打开命令面板，可以访问以下命令:

- `Ollama 代码补全: 启用/禁用` - 切换插件状态
- `Ollama 代码补全: 选择模型` - 更改使用的 Ollama 模型
- `Ollama 代码补全: 清除缓存` - 清除代码补全缓存
- `Ollama 代码补全: 测试连接` - 测试与 Ollama 服务的连接
- `Ollama 代码补全: 显示当前配置` - 查看当前设置

## 配置选项

通过 VSCode 设置面板可以配置的选项:

### 通用设置

- `ollamaCodeCompletion.general.enabled`: 启用或禁用代码补全功能
- `ollamaCodeCompletion.general.triggerDelay`: 触发代码补全的延迟时间（毫秒）

### 模型设置

- `ollamaCodeCompletion.model.url`: Ollama API 的 URL 地址
- `ollamaCodeCompletion.model.name`: 使用的 Ollama 模型名称
- `ollamaCodeCompletion.model.temperature`: 生成的温度参数 (0-1)
- `ollamaCodeCompletion.model.maxTokens`: 每次补全生成的最大 token 数

### 上下文设置

- `ollamaCodeCompletion.context.maxLines`: 提供给模型的上下文最大行数
- `ollamaCodeCompletion.context.includeImports`: 是否在上下文中包含导入/引用语句
- `ollamaCodeCompletion.context.includeComments`: 是否在上下文中包含注释

### 缓存设置

- `ollamaCodeCompletion.cache.enabled`: 是否启用代码补全缓存
- `ollamaCodeCompletion.cache.retentionPeriodHours`: 缓存保留时间（小时）
- `ollamaCodeCompletion.cache.maxSnippets`: 最大缓存条目数

### 文件类型设置

- `ollamaCodeCompletion.fileTypes.enabled`: 启用代码补全的文件类型
- `ollamaCodeCompletion.fileTypes.disabled`: 禁用代码补全的文件类型

## 常见问题

### Q: 插件无法连接到 Ollama 服务

确保:
1. Ollama 服务正在运行
2. API URL 配置正确（默认为 `http://localhost:11434`）
3. 指定的模型已下载并可用

可使用命令 `Ollama 代码补全: 测试连接` 进行测试。

### Q: 代码补全速度很慢

代码补全的速度主要取决于:
1. 您的硬件配置
2. 所选模型的大小和复杂度
3. 提供给模型的上下文大小

尝试:
- 使用更小的模型（如 codellama:7b-instruct 而非更大的变体）
- 减少上下文行数
- 启用缓存功能
- 增加触发延迟，减少不必要的 API 调用

### Q: 生成的代码质量不佳

尝试:
- 调整模型温度（温度越低，生成越保守和确定性）
- 选择专为代码优化的模型（如 codellama 系列）
- 优化您的编码风格，提供更明确的上下文

## 隐私声明

此扩展设计时考虑了隐私:
- 所有代码和数据仅与您本地运行的 Ollama 服务通信
- 不会将代码发送到任何云服务或远程服务器
- 缓存数据存储在您的本地机器上

## 贡献

欢迎贡献！如果您想要改进此扩展:
1. Fork 项目
2. 创建您的特性分支
3. 提交您的改动
4. 推送到分支
5. 创建新的 Pull Request

## 许可证

MIT

## 致谢

- [Ollama 项目](https://github.com/ollama/ollama) - 提供本地 LLM 服务
- [Visual Studio Code 团队](https://github.com/microsoft/vscode) - 提供优秀的开发平台 