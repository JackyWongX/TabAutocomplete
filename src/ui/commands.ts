import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';
import { CacheManager } from '../cache/cacheManager';
import { Logger } from '../utils/logger';
import { CompletionProvider } from '../providers/completionProvider';
import { ClientFactory } from '../api/clientFactory';
import { ModelConfig, ModelProvider } from '../api/baseClient';

/**
 * 命令管理器
 * 负责注册和处理插件命令
 */
export class CommandManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private logger: Logger;
    private clientFactory: ClientFactory;

    constructor(
        private configManager: ConfigManager,
        private cacheManager: CacheManager,
        private completionProvider: CompletionProvider,
        private context: vscode.ExtensionContext
    ) {
        this.logger = Logger.getInstance();
        this.clientFactory = new ClientFactory(configManager);
        
        // 注册命令
        this.registerCommands();
    }
    
    /**
     * 注册命令
     */
    private registerCommands(): void {
        const commands: { [key: string]: (...args: any[]) => any } = {
            'tabAutoComplete.enable': this.enableExtension.bind(this),
            'tabAutoComplete.disable': this.disableExtension.bind(this),
            'tabAutoComplete.selectModel': this.selectModel.bind(this),
            'tabAutoComplete.clearCache': this.clearCache.bind(this),
            'tabAutoComplete.testConnection': this.testConnection.bind(this),
            'tabAutoComplete.showConfig': this.showConfig.bind(this),
            'tabAutoComplete.applyCompletion': this.applyCompletion.bind(this),
            'tabAutoComplete.handleEscape': this.handleEscape.bind(this),
            'tabAutoComplete.manageModels': this.manageModels.bind(this),
            'tabAutoComplete.toggleEnabled': this.toggleEnabled.bind(this)
        };
        
        // 注册每个命令
        for (const [commandId, handler] of Object.entries(commands)) {
            const disposable = vscode.commands.registerCommand(commandId, handler);
            this.disposables.push(disposable);
        }
    }
    
    /**
     * 启用代码补全
     */
    private async enableExtension(): Promise<void> {
        await this.configManager.setEnabled(true);
        vscode.window.showInformationMessage('Ollama 代码补全已启用');
    }
    
    /**
     * 禁用代码补全
     */
    private async disableExtension(): Promise<void> {
        await this.configManager.setEnabled(false);
        vscode.window.showInformationMessage('Ollama 代码补全已禁用');
    }
    
    /**
     * 切换启用状态
     */
    private async toggleEnabled(): Promise<void> {
        const isCurrentlyEnabled = this.configManager.isEnabled();
        await this.configManager.setEnabled(!isCurrentlyEnabled);
        
        // 显示通知
        vscode.window.showInformationMessage(
            isCurrentlyEnabled 
                ? 'TabAutoComplete已禁用' 
                : 'TabAutoComplete已启用'
        );
    }
    
    /**
     * 选择模型
     */
    private async selectModel(): Promise<void> {
        // 获取可用模型列表
        const models = this.configManager.getAvailableModels();
        const logger = Logger.getInstance();
        
        if (models.length === 0) {
            logger.warn('没有可用的模型配置，请先添加模型');
            vscode.window.showInformationMessage('没有可用的模型配置，请先添加模型');
            this.manageModels();
            return;
        }
        
        // 获取当前选择的模型名称
        const currentModelName = this.configManager.getSelectedModelName();
        logger.debug(`当前选择的模型: ${currentModelName}`);
        
        // 创建QuickPick选项
        const items = models.map((model, index) => ({
            label: model.title,
            description: `${model.provider} - ${model.model}`,
            detail: `API地址: ${model.apiBase || '默认'}${model.apiKey ? ', API密钥: 已设置' : ''}`,
            index: index,
            model: model,
            picked: model.title === currentModelName
        }));
        
        // 显示QuickPick
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要使用的模型'
        });
        
        if (selected) {
            // 更新选择的模型索引
            logger.info(`用户选择了模型: ${selected.label} (${selected.description})`);
            const modelIndex = this.configManager.getAvailableModels().findIndex(m => m.title === selected.label);
            if (modelIndex >= 0) {
                await this.configManager.setSelectedModelIndex(modelIndex);
            }
            
            // 显示更详细的信息
            const message = `已选择模型: ${selected.label}\n提供商: ${selected.model.provider}\n模型: ${selected.model.model}\nAPI地址: ${selected.model.apiBase || '默认'}`;
            vscode.window.showInformationMessage(message, '测试连接').then(selection => {
                if (selection === '测试连接') {
                    this.testConnection();
                }
            });
        }
    }
    
    /**
     * 清除代码补全缓存
     */
    private async clearCache(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            '确定要清除所有代码补全缓存吗？',
            { modal: true },
            '确定'
        );
        
        if (confirm === '确定') {
            this.cacheManager.clearCache();
            vscode.window.showInformationMessage('代码补全缓存已清除');
        }
    }
    
    /**
     * 测试连接
     */
    private async testConnection(): Promise<void> {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '测试AI模型连接',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: '正在连接...' });
            
            try {
                // 获取当前选择的模型配置
                const modelConfig = this.configManager.getSelectedModelConfig();
                
                // 创建客户端
                const client = this.clientFactory.createClient(modelConfig);
                
                // 测试连接
                const result = await client.testConnection();
                
                if (result.success) {
                    let message = `连接成功: ${modelConfig.provider} - ${modelConfig.model}`;
                    if (result.models && result.models.length > 0) {
                        message += `\n可用模型: ${result.models.slice(0, 5).join(', ')}${result.models.length > 5 ? '...' : ''}`;
                    }
                    vscode.window.showInformationMessage(message);
                } else {
                    vscode.window.showErrorMessage(`连接失败: ${result.message}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`连接测试出错: ${error.message}`);
            }
        });
    }
    
    /**
     * 显示当前配置
     */
    private showConfig(): void {
        const config = this.configManager.getFullConfig();
        const selectedModel = this.configManager.getSelectedModelConfig();
        
        // 格式化配置为Markdown
        const configMarkdown = [
            '# TabAutoComplete 配置',
            '',
            '## 当前选择的模型',
            `- 标题: ${selectedModel.title}`,
            `- 提供商: ${selectedModel.provider}`,
            `- 模型名称: ${selectedModel.model}`,
            `- API地址: ${selectedModel.apiBase || '默认'}`,
            selectedModel.apiKey ? '- API密钥: ******（已设置）' : '',
            '',
            '## 常规设置',
            `- 启用状态: ${config.enabled ? '✅ 启用' : '❌ 禁用'}`,
            `- 触发延迟: ${config.triggerDelay}毫秒`,
            '',
            '## 上下文设置',
            `- 最大上下文行数: ${config.maxContextLines}`,
            `- 包含导入语句: ${config.includeImports ? '是' : '否'}`,
            `- 包含注释: ${config.includeComments ? '是' : '否'}`,
            '',
            '## 缓存设置',
            `- 启用缓存: ${config.cacheEnabled ? '是' : '否'}`,
            `- 保留时间: ${config.retentionPeriodHours}小时`,
            `- 最大缓存条目: ${config.maxSnippets}`,
            '',
            '## 文件类型设置',
            `- 启用的文件类型: ${Array.isArray(config.enabledFileTypes) ? config.enabledFileTypes.join(', ') : config.enabledFileTypes}`,
            `- 禁用的文件类型: ${Array.isArray(config.disabledFileTypes) ? config.disabledFileTypes.join(', ') : config.disabledFileTypes}`
        ].join('\n');
        
        // 创建并显示Markdown预览
        const panel = vscode.window.createWebviewPanel(
            'tabAutoCompleteConfig',
            'TabAutoComplete 配置',
            vscode.ViewColumn.One,
            {}
        );
        
        panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TabAutoComplete 配置</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif;
            padding: 0 20px;
            line-height: 1.5;
        }
        h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h2 { color: #0078d7; margin-top: 20px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
    </style>
</head>
<body>
    ${this.markdownToHtml(configMarkdown)}
</body>
</html>`;
    }
    
    /**
     * 简单的Markdown转HTML工具
     */
    private markdownToHtml(markdown: string): string {
        return markdown
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^- (.*$)/gm, '<ul><li>$1</li></ul>')
            .replace(/<\/ul><ul>/g, '')
            .replace(/\n\n/g, '<br><br>');
    }

    /**
     * 应用补全
     */
    private applyCompletion(): void {
        // 获取活动编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        
        // 检查是否有活动预览
        if (this.completionProvider.hasActivePreview()) {
            // 应用补全
            this.completionProvider.accept();
        } else {
            // 如果没有活动预览，执行默认的Tab行为
            vscode.commands.executeCommand('tab');
        }
    }

    /**
     * 处理ESC键
     */
    private handleEscape(): void {
        // 获取活动编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        
        // 检查是否有活动预览
        if (this.completionProvider.hasActivePreview()) {
            // 清除预览
            this.completionProvider.clearPreview();
        } else {
            // 如果没有活动预览，执行默认的ESC行为
            vscode.commands.executeCommand('escape');
        }

        // 取消请求
        this.completionProvider.cancel();
    }
    
    /**
     * 管理模型
     */
    private async manageModels(): Promise<void> {
        // 显示模型管理选项
        const options = [
            '查看所有模型',
            '添加新模型',
            '编辑模型',
            '删除模型'
        ];
        
        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: '选择操作'
        });
        
        if (!selected) {
            return;
        }
        
        switch (selected) {
            case '查看所有模型':
                this.viewAllModels();
                break;
                
            case '添加新模型':
                this.addNewModel();
                break;
                
            case '编辑模型':
                this.editModel();
                break;
                
            case '删除模型':
                this.deleteModel();
                break;
        }
    }
    
    /**
     * 查看所有模型
     */
    private viewAllModels(): void {
        const models = this.configManager.getAvailableModels();
        
        if (models.length === 0) {
            vscode.window.showInformationMessage('没有可用的模型配置');
            return;
        }
        
        // 创建模型信息面板
        const panel = vscode.window.createWebviewPanel(
            'tabAutoCompleteModels',
            'TabAutoComplete 模型',
            vscode.ViewColumn.One,
            {}
        );
        
        // 构建HTML内容
        let modelsHtml = '';
        models.forEach((model, _index) => {
            modelsHtml += `
                <div class="model-item">
                    <h3>${model.title}</h3>
                    <div class="model-detail">
                        <span class="key">提供商:</span> 
                        <span class="value">${model.provider}</span>
                    </div>
                    <div class="model-detail">
                        <span class="key">模型:</span> 
                        <span class="value">${model.model}</span>
                    </div>
                    <div class="model-detail">
                        <span class="key">API基础URL:</span> 
                        <span class="value">${model.apiBase || '默认'}</span>
                    </div>
                    ${model.apiKey ? '<div class="model-detail"><span class="key">API密钥:</span> <span class="value">已设置</span></div>' : ''}
                    ${model.contextLength ? `<div class="model-detail"><span class="key">上下文长度:</span> <span class="value">${model.contextLength}</span></div>` : ''}
                    ${model.temperature ? `<div class="model-detail"><span class="key">温度:</span> <span class="value">${model.temperature}</span></div>` : ''}
                    ${model.maxTokens ? `<div class="model-detail"><span class="key">最大Token数:</span> <span class="value">${model.maxTokens}</span></div>` : ''}
                </div>
            `;
        });
        
        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>TabAutoComplete 模型</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #333; }
                    h3 { color: #0077cc; margin-bottom: 10px; }
                    .model-item { 
                        margin-bottom: 30px; 
                        padding: 15px;
                        border: 1px solid #ddd;
                        border-radius: 5px;
                    }
                    .model-detail { margin: 5px 0; }
                    .key { font-weight: bold; }
                    .value { color: #333; }
                </style>
            </head>
            <body>
                <h1>可用的AI模型 (${models.length})</h1>
                ${modelsHtml}
            </body>
            </html>
        `;
    }
    
    /**
     * 添加新模型
     */
    private async addNewModel(): Promise<void> {
        // 选择模型提供商
        const providerOptions = [
            { label: 'Ollama (本地)', value: ModelProvider.OLLAMA },
            { label: 'DeepSeek', value: ModelProvider.DEEPSEEK },
            { label: 'OpenAI', value: ModelProvider.OPENAI },
            { label: 'SiliconFlow', value: ModelProvider.SILICONFLOW }
        ];
        
        const selectedProvider = await vscode.window.showQuickPick(providerOptions, {
            placeHolder: '选择模型提供商'
        });
        
        if (!selectedProvider) {
            return;
        }
        
        // 创建新的模型配置
        const newModel: ModelConfig = {
            title: '',
            model: '',
            provider: selectedProvider.value
        };
        
        // 输入模型标题
        const title = await vscode.window.showInputBox({
            prompt: '输入模型显示名称',
            placeHolder: '例如: GPT-4, DeepSeek Coder, qwen2.5-coder:7b'
        });
        
        if (!title) {
            return;
        }
        
        newModel.title = title;
        
        // 输入模型名称
        const model = await vscode.window.showInputBox({
            prompt: '输入模型名称',
            placeHolder: '例如: gpt-4, deepseek-coder, qwen2.5-coder:7b'
        });
        
        if (!model) {
            return;
        }
        
        newModel.model = model;
        
        // 如果不是Ollama，需要API密钥
        if (selectedProvider.value !== ModelProvider.OLLAMA) {
            const apiKey = await vscode.window.showInputBox({
                prompt: `输入${selectedProvider.label} API密钥`,
                password: true
            });
            
            if (!apiKey) {
                return;
            }
            
            newModel.apiKey = apiKey;
        }
        
        // 输入API基础URL（可选）
        const apiBase = await vscode.window.showInputBox({
            prompt: `输入API基础URL（可选，留空使用默认值）`,
            placeHolder: selectedProvider.value === ModelProvider.OLLAMA ? 'http://localhost:11434' : ''
        });
        
        if (apiBase) {
            newModel.apiBase = apiBase;
        } else if (selectedProvider.value === ModelProvider.OLLAMA) {
            newModel.apiBase = 'http://localhost:11434';
        }
        
        // 输入上下文长度（可选）
        const contextLengthStr = await vscode.window.showInputBox({
            prompt: '输入上下文长度（可选，留空使用默认值）',
            placeHolder: '例如: 8192, 32768, 128000'
        });
        
        if (contextLengthStr) {
            const contextLength = parseInt(contextLengthStr);
            if (!isNaN(contextLength)) {
                newModel.contextLength = contextLength;
            }
        }
        
        // 输入温度（可选）
        const temperatureStr = await vscode.window.showInputBox({
            prompt: '输入生成温度（可选，留空使用默认值）',
            placeHolder: '例如: 0.3, 0.7, 1.0'
        });
        
        if (temperatureStr) {
            const temperature = parseFloat(temperatureStr);
            if (!isNaN(temperature)) {
                newModel.temperature = temperature;
            }
        }
        
        // 输入最大Token数（可选）
        const maxTokensStr = await vscode.window.showInputBox({
            prompt: '输入最大生成Token数（可选，留空使用默认值）',
            placeHolder: '例如: 1000, 2000, 4000'
        });
        
        if (maxTokensStr) {
            const maxTokens = parseInt(maxTokensStr);
            if (!isNaN(maxTokens)) {
                newModel.maxTokens = maxTokens;
            }
        }
        
        // 添加模型配置
        await this.configManager.addModelConfig(newModel);
        
        vscode.window.showInformationMessage(`已添加模型: ${newModel.title}`);
        
        // 询问是否设置为当前模型
        const setAsCurrent = await vscode.window.showQuickPick(['是', '否'], {
            placeHolder: '是否将此模型设置为当前使用的模型？'
        });
        
        if (setAsCurrent === '是') {
            // 获取新添加的模型索引
            const models = this.configManager.getAvailableModels();
            const newIndex = models.length - 1;
            await this.configManager.setSelectedModelIndex(newIndex);
            vscode.window.showInformationMessage(`已将 ${newModel.title} 设置为当前模型`);
        }
    }
    
    /**
     * 编辑模型
     */
    private async editModel(): Promise<void> {
        const models = this.configManager.getAvailableModels();
        
        if (models.length === 0) {
            vscode.window.showInformationMessage('没有可用的模型配置');
            return;
        }
        
        // 选择要编辑的模型
        const modelItems = models.map((model, index) => ({
            label: model.title,
            description: `${model.provider} - ${model.model}`,
            index: index,
            model: model
        }));
        
        const selectedModel = await vscode.window.showQuickPick(modelItems, {
            placeHolder: '选择要编辑的模型'
        });
        
        if (!selectedModel) {
            return;
        }
        
        // 创建模型配置副本
        const editedModel: ModelConfig = { ...selectedModel.model };
        
        // 编辑模型标题
        const title = await vscode.window.showInputBox({
            prompt: '输入模型显示名称',
            value: editedModel.title
        });
        
        if (title) {
            editedModel.title = title;
        }
        
        // 编辑模型名称
        const model = await vscode.window.showInputBox({
            prompt: '输入模型名称',
            value: editedModel.model
        });
        
        if (model) {
            editedModel.model = model;
        }
        
        // 如果不是Ollama，可以编辑API密钥
        if (editedModel.provider !== ModelProvider.OLLAMA) {
            const apiKey = await vscode.window.showInputBox({
                prompt: `输入API密钥（留空保持不变）`,
                password: true,
                placeHolder: editedModel.apiKey ? '******' : '未设置'
            });
            
            if (apiKey) {
                editedModel.apiKey = apiKey;
            }
        }
        
        // 编辑API基础URL
        const apiBase = await vscode.window.showInputBox({
            prompt: '输入API基础URL（留空保持不变）',
            value: editedModel.apiBase || ''
        });
        
        if (apiBase) {
            editedModel.apiBase = apiBase;
        }
        
        // 编辑上下文长度
        const contextLengthStr = await vscode.window.showInputBox({
            prompt: '输入上下文长度（留空保持不变）',
            value: editedModel.contextLength ? editedModel.contextLength.toString() : ''
        });
        
        if (contextLengthStr) {
            const contextLength = parseInt(contextLengthStr);
            if (!isNaN(contextLength)) {
                editedModel.contextLength = contextLength;
            }
        }
        
        // 编辑温度
        const temperatureStr = await vscode.window.showInputBox({
            prompt: '输入生成温度（留空保持不变）',
            value: editedModel.temperature ? editedModel.temperature.toString() : ''
        });
        
        if (temperatureStr) {
            const temperature = parseFloat(temperatureStr);
            if (!isNaN(temperature)) {
                editedModel.temperature = temperature;
            }
        }
        
        // 编辑最大Token数
        const maxTokensStr = await vscode.window.showInputBox({
            prompt: '输入最大生成Token数（留空保持不变）',
            value: editedModel.maxTokens ? editedModel.maxTokens.toString() : ''
        });
        
        if (maxTokensStr) {
            const maxTokens = parseInt(maxTokensStr);
            if (!isNaN(maxTokens)) {
                editedModel.maxTokens = maxTokens;
            }
        }
        
        // 更新模型配置
        await this.configManager.updateModelConfig(selectedModel.index, editedModel);
        
        vscode.window.showInformationMessage(`已更新模型: ${editedModel.title}`);
        
        // 如果编辑的是当前选择的模型，更新当前模型
        const currentModel = this.configManager.getSelectedModelConfig();
        const currentModelIndex = models.findIndex(m => 
            m.title === currentModel.title && 
            m.model === currentModel.model && 
            m.provider === currentModel.provider
        );
        
        if (currentModelIndex === selectedModel.index) {
            // 不需要额外操作，因为我们直接更新了models数组中的对象
            vscode.window.showInformationMessage(`当前选择的模型已更新`);
        }
    }
    
    /**
     * 删除模型
     */
    private async deleteModel(): Promise<void> {
        const models = this.configManager.getAvailableModels();
        
        if (models.length === 0) {
            vscode.window.showInformationMessage('没有可用的模型配置');
            return;
        }
        
        // 选择要删除的模型
        const modelItems = models.map((model, index) => ({
            label: model.title,
            description: `${model.provider} - ${model.model}`,
            index: index,
            model: model
        }));
        
        const selectedModel = await vscode.window.showQuickPick(modelItems, {
            placeHolder: '选择要删除的模型'
        });
        
        if (!selectedModel) {
            return;
        }
        
        // 确认删除
        const confirm = await vscode.window.showQuickPick(['是', '否'], {
            placeHolder: `确定要删除模型 ${selectedModel.label} 吗？`
        });
        
        if (confirm !== '是') {
            return;
        }
        
        // 删除模型配置
        await this.configManager.deleteModelConfig(selectedModel.index);
        
        vscode.window.showInformationMessage(`已删除模型: ${selectedModel.label}`);
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
} 