# TabAutoComplete - Intelligent Code Completion Extension for VSCode

## Introduction

TabAutoComplete is a powerful VSCode extension that connects to your locally running AI models through Ollama, DeepSeek, OpenAI, or SiliconFlow services to provide intelligent, context-aware code completion. By leveraging state-of-the-art language models, it offers smarter and more accurate code suggestions.

## Features

- 🚀 **Intelligent Code Completion** - Context-aware code completion supporting multiple programming languages
- 🔄 **Tab Key Completion** - Quick completion acceptance using the Tab key
- 🌐 **Multiple Model Support** - Support for both local and cloud-based AI models
- ⚙️ **Highly Customizable** - Flexible configuration of model parameters, triggers, and context size
- 📚 **Smart Context** - Automatic code context analysis for more relevant completions
- 💾 **Intelligent Caching** - Cache frequently used code snippets for faster response
- 🎯 **File Type Filtering** - Configurable enable/disable code completion for specific file types

## Prerequisites

Before using this extension, you need:

1. For local models: Install and run [Ollama](https://github.com/ollama/ollama)
2. For cloud models: Obtain API keys from supported providers (DeepSeek, OpenAI, or SiliconFlow)

## Installation

1. Search for "TabAutoComplete" in the VSCode extension marketplace
2. Click Install
3. Restart VSCode (if required)

## Quick Start

1. Ensure your chosen AI service is properly configured
2. Open VSCode settings, search for "TabAutoComplete" to configure your model and preferences
3. Start coding, wait for a moment (default 300ms), and auto-completion will appear
4. Press `Tab` to accept the suggested code
5. Press `Esc` to ignore completion suggestions

## Configuration Options

### General Settings

- `tabAutoComplete.general.enabled`: Enable or disable code completion
- `tabAutoComplete.general.triggerDelay`: Delay before triggering code completion (ms)
- `tabAutoComplete.debounceDelay`: Input debounce delay (ms)

### Model Settings

- `tabAutoComplete.models`: List of available AI model configurations
- `tabAutoComplete.model.temperature`: Generation temperature parameter (0-1)
- `tabAutoComplete.model.maxTokens`: Maximum tokens per completion
- `tabAutoComplete.model.selectedModelName`: Currently selected model name

### Context Settings

- `tabAutoComplete.context.maxLines`: Maximum context lines for the model
- `tabAutoComplete.context.includeImports`: Include import/reference statements in context
- `tabAutoComplete.context.includeComments`: Include comments in context

### Cache Settings

- `tabAutoComplete.cache.enabled`: Enable code completion cache
- `tabAutoComplete.cache.retentionPeriodHours`: Cache retention period (hours)
- `tabAutoComplete.cache.maxSnippets`: Maximum cache entries

### File Type Settings

- `tabAutoComplete.fileTypes.enabled`: File types to enable code completion
- `tabAutoComplete.fileTypes.disabled`: File types to disable code completion

### Advanced Settings

- `tabAutoComplete.advanced.adaptToProjectSize`: Auto-adjust parameters based on project size
- `tabAutoComplete.prompt.template`: Custom code completion prompt template
- `tabAutoComplete.logging.level`: Logging level settings

## Commands

Access these commands via `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS):

- `TabAutoComplete: Enable` - Enable the extension
- `TabAutoComplete: Disable` - Disable the extension
- `TabAutoComplete: Select Model` - Change the AI model
- `TabAutoComplete: Clear Cache` - Clear completion cache
- `TabAutoComplete: Test Connection` - Test AI service connection
- `TabAutoComplete: Show Config` - View current settings
- `TabAutoComplete: Manage Models` - Manage AI models

## FAQ

### Q: Can't connect to AI service

Ensure:
1. The service is running (for local models)
2. API key is correct (for cloud models)
3. API base URL is correctly configured
4. Selected model is available

### Q: Code completion is slow

Try:
- Use a smaller model
- Reduce context size (`context.maxLines`)
- Enable caching
- Increase trigger delay
- Adjust debounce delay

### Q: Generated code quality is not ideal

Suggestions:
- Lower model temperature
- Use a specialized code model
- Increase context size
- Adjust prompt template

## Privacy Statement

- For local models: All code and data only communicate with local services
- For cloud models: Data is sent only to your configured AI provider
- Cache data is stored locally only

## License

MIT

## Tech Stack

- TypeScript
- VS Code Extension API
- Multiple AI Service APIs
- Webpack
- LRU Cache

## Contributing

Issues and Pull Requests are welcome!

## Acknowledgments

- [Ollama Project](https://github.com/ollama/ollama)
- [Visual Studio Code](https://github.com/microsoft/vscode) 