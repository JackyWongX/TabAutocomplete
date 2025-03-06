import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';
import { OllamaClient } from '../api/ollamaClient';
import { CacheManager } from '../cache/cacheManager';
import { StatusBarManager } from './statusBar';

/**
 * 命令管理器
 * 注册和处理VSCode命令
 */
export class CommandManager {
    constructor(
        private context: vscode.ExtensionContext,
        private configManager: ConfigManager,
        private ollamaClient: OllamaClient,
        private cacheManager: CacheManager,
        private statusBarManager: StatusBarManager
    ) {
        this.registerCommands();
    }
    
    /**
     * 注册命令
     */
    private registerCommands(): void {
        const commands: { [key: string]: (...args: any[]) => any } = {
            'ollamaCodeCompletion.enable': this.enableCompletion.bind(this),
            'ollamaCodeCompletion.disable': this.disableCompletion.bind(this),
            'ollamaCodeCompletion.toggleEnabled': this.toggleEnabled.bind(this),
            'ollamaCodeCompletion.selectModel': this.selectModel.bind(this),
            'ollamaCodeCompletion.clearCache': this.clearCache.bind(this),
            'ollamaCodeCompletion.testConnection': this.testConnection.bind(this),
            'ollamaCodeCompletion.showConfig': this.showConfig.bind(this)
        };
        
        // 注册每个命令
        for (const [commandId, handler] of Object.entries(commands)) {
            const disposable = vscode.commands.registerCommand(commandId, handler);
            this.context.subscriptions.push(disposable);
        }
    }
    
    /**
     * 启用代码补全
     */
    private async enableCompletion(): Promise<void> {
        await this.configManager.setEnabled(true);
        this.statusBarManager.updateStatus();
        vscode.window.showInformationMessage('Ollama 代码补全已启用');
    }
    
    /**
     * 禁用代码补全
     */
    private async disableCompletion(): Promise<void> {
        await this.configManager.setEnabled(false);
        this.statusBarManager.updateStatus();
        vscode.window.showInformationMessage('Ollama 代码补全已禁用');
    }
    
    /**
     * 切换启用状态
     */
    private async toggleEnabled(): Promise<void> {
        await this.statusBarManager.toggleEnabled();
    }
    
    /**
     * 选择Ollama模型
     */
    private async selectModel(): Promise<void> {
        try {
            // 显示加载状态
            this.statusBarManager.showTemporaryMessage('正在获取可用模型...');
            
            // 测试连接并获取可用模型
            const result = await this.ollamaClient.testConnection();
            
            if (!result.success) {
                vscode.window.showErrorMessage(`无法连接到Ollama服务: ${result.message}`);
                this.statusBarManager.showError(result.message);
                return;
            }
            
            const models = result.models || [];
            
            if (models.length === 0) {
                vscode.window.showWarningMessage('未找到可用的Ollama模型，请确保您已下载至少一个模型。');
                return;
            }
            
            // 显示模型选择
            const selectedModel = await vscode.window.showQuickPick(models, {
                placeHolder: '选择要使用的Ollama模型',
                title: 'Ollama代码补全模型'
            });
            
            if (selectedModel) {
                // 更新配置
                await this.configManager.setModelName(selectedModel);
                this.statusBarManager.updateStatus();
                vscode.window.showInformationMessage(`已选择模型: ${selectedModel}`);
            }
        } catch (error) {
            console.error('选择模型时出错:', error);
            vscode.window.showErrorMessage('选择模型时出错');
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
     * 测试与Ollama服务的连接
     */
    private async testConnection(): Promise<void> {
        try {
            // 显示请求状态
            this.statusBarManager.showRequestInProgress(true);
            
            // 测试连接
            const result = await this.ollamaClient.testConnection();
            
            // 恢复状态
            this.statusBarManager.showRequestInProgress(false);
            
            if (result.success) {
                const modelsText = result.models && result.models.length > 0
                    ? `可用模型: ${result.models.join(', ')}`
                    : '未找到可用模型';
                
                vscode.window.showInformationMessage(`${result.message}。${modelsText}`);
            } else {
                vscode.window.showErrorMessage(`连接测试失败: ${result.message}`);
                this.statusBarManager.showError(result.message);
            }
        } catch (error) {
            this.statusBarManager.showRequestInProgress(false);
            console.error('测试连接时出错:', error);
            vscode.window.showErrorMessage('测试连接时出错');
        }
    }
    
    /**
     * 显示当前配置
     */
    private showConfig(): void {
        const config = this.configManager.getFullConfig();
        
        // 格式化配置为Markdown
        const configMarkdown = [
            '# Ollama 代码补全配置',
            '',
            '## 常规设置',
            `- 启用状态: ${config.enabled ? '✅ 启用' : '❌ 禁用'}`,
            `- 触发延迟: ${config.triggerDelay}毫秒`,
            '',
            '## 模型设置',
            `- API地址: ${config.apiUrl}`,
            `- 模型名称: ${config.modelName}`,
            `- 温度: ${config.temperature}`,
            `- 最大Tokens: ${config.maxTokens}`,
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
            `- 启用的文件类型: ${config.enabledFileTypes.join(', ')}`,
            `- 禁用的文件类型: ${config.disabledFileTypes.join(', ')}`
        ].join('\n');
        
        // 创建并显示Markdown预览
        const panel = vscode.window.createWebviewPanel(
            'ollamaCodeCompletionConfig',
            'Ollama 代码补全配置',
            vscode.ViewColumn.One,
            {}
        );
        
        panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ollama 代码补全配置</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            line-height: 1.6;
        }
        h1 {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        h2 {
            margin-top: 20px;
            color: var(--vscode-textLink-foreground);
        }
        ul {
            padding-left: 20px;
        }
    </style>
</head>
<body>
    <div id="content">
        ${this.markdownToHtml(configMarkdown)}
    </div>
    <div style="margin-top: 30px; text-align: center">
        <button onclick="window.parent.postMessage({ command: 'openSettings' }, '*')">打开设置</button>
    </div>
    <script>
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'openSettings') {
                vscode.postMessage({ command: 'openSettings' });
            }
        });
    </script>
</body>
</html>`;
        
        // 处理Webview消息
        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'openSettings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'ollamaCodeCompletion');
            }
        });
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
} 