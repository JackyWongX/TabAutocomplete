import * as vscode from 'vscode';
import { CompletionProvider } from './providers/completionProvider';
import { OllamaClient } from './api/ollamaClient';
import { ConfigManager } from './config/configManager';
import { CacheManager } from './cache/cacheManager';
import { StatusBarManager } from './ui/statusBar';
import { CommandManager } from './ui/commands';
import { Logger, LogLevel } from './utils/logger';

/**
 * 激活插件
 * @param context 扩展上下文
 */
export async function activate(context: vscode.ExtensionContext) {
    // 初始化日志系统
    const logger = Logger.getInstance();
    logger.setLogLevel(LogLevel.DEBUG); // 明确设置为DEBUG级别
    logger.setDebugEnabled(true); // 开发阶段启用调试日志
    logger.setPerformanceLoggingEnabled(true);
    
    // 确保日志输出通道立即可见
    logger.showOutputChannel();
    
    logger.info('=====================================================');
    logger.info('Ollama代码补全扩展激活开始');
    logger.info(`扩展版本: ${vscode.extensions.getExtension('vscode-ollama-code-completion')?.packageJSON.version || '未知'}`);
    logger.info(`VSCode版本: ${vscode.version}`);
    logger.info(`操作系统: ${process.platform} ${process.arch}`);
    logger.info(`Node版本: ${process.version}`);
    logger.info('=====================================================');
    
    try {
        // 初始化配置管理器
        const configManager = new ConfigManager();
        logger.info(`配置加载完成，API URL: ${configManager.getApiUrl()}, 模型: ${configManager.getModelName()}`);
        
        // 验证配置
        if (!configManager.getApiUrl()) {
            logger.error('API URL未设置，请检查配置');
            vscode.window.showErrorMessage('Ollama API URL未设置，请在设置中配置。');
            return;
        }
        
        if (!configManager.getModelName()) {
            logger.error('模型名称未设置，请检查配置');
            vscode.window.showErrorMessage('Ollama模型名称未设置，请在设置中配置。');
            return;
        }
        
        // 初始化缓存管理器
        const cacheManager = new CacheManager(context.globalState, configManager);
        
        // 初始化Ollama客户端
        const ollamaClient = new OllamaClient(configManager);
        
        // 测试Ollama API连接
        logger.info('测试Ollama API连接...');
        const connectionTest = await ollamaClient.testConnection();
        if (connectionTest.success) {
            logger.info(`Ollama API连接成功，可用模型: ${connectionTest.models?.join(', ')}`);
        } else {
            logger.warn(`Ollama API连接失败: ${connectionTest.message}`);
            vscode.window.showWarningMessage(`无法连接到Ollama API: ${connectionTest.message}。请检查配置并确保Ollama服务正在运行。`);
        }
        
        // 初始化状态栏
        const statusBar = new StatusBarManager(configManager);
        context.subscriptions.push(statusBar);
        
        // 创建诊断集合
        const diagnosticsCollection = vscode.languages.createDiagnosticCollection('ollamaCompletion');
        context.subscriptions.push(diagnosticsCollection);
        
        // 初始化补全提供程序
        const completionProvider = new CompletionProvider(
            configManager,
            logger,
            cacheManager,
            statusBar.getStatusBarItem(),
            diagnosticsCollection,
            context
        );
        
        // 注册命令
        const commandManager = new CommandManager(
            context,
            configManager,
            ollamaClient,
            cacheManager,
            statusBar
        );
        
        // 注册补全提供程序
        const supportedLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'html', 'css', 'markdown'];
        logger.info(`为以下语言注册补全提供程序: ${supportedLanguages.join(', ')}`);
        
        // 确保为每种语言正确注册
        for (const language of supportedLanguages) {
            const selector: vscode.DocumentSelector = { language, scheme: 'file' };
            const provider = vscode.languages.registerCompletionItemProvider(
                selector,
                completionProvider,
                ...completionProvider.getTriggerCharacters()
            );
            context.subscriptions.push(provider);
            logger.debug(`已为语言 ${language} 注册补全提供程序`);
        }
        
        // 注册自动补全命令 - 修改为直接应用补全
        const applyCompletionCommand = vscode.commands.registerTextEditorCommand(
            'ollamaCompletion.applyCompletion',
            (textEditor: vscode.TextEditor) => {
                // 当用户手动触发时，直接应用补全
                if (textEditor) {
                    const position = textEditor.selection.active;
                    const document = textEditor.document;
                    completionProvider.applyCompletionAtPosition(document, position);
                }
            }
        );
        context.subscriptions.push(applyCompletionCommand);
        
        // 注册补全项应用命令
        const applyCompletionItemCommand = vscode.commands.registerCommand(
            'ollamaCompletion.applyCompletionForCompletionItem',
            (document: vscode.TextDocument, position: vscode.Position, text: string) => {
                if (document && position && text) {
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document.uri.toString() === document.uri.toString()) {
                        // 直接应用补全内容
                        logger.debug(`应用补全命令被调用，文本长度=${text.length}，即将调用applyCompletion方法`);
                        
                        // 确保编辑器是激活的
                        vscode.window.showTextDocument(document).then(activeEditor => {
                            // 使用公共方法访问私有方法applyCompletion
                            completionProvider['applyCompletion'](activeEditor, position, text);
                            logger.debug('完成应用补全命令');
                        });
                    } else {
                        logger.debug('找不到匹配的编辑器来应用补全或编辑器不活跃');
                        // 尝试强制打开文档
                        vscode.window.showTextDocument(document).then(activeEditor => {
                            completionProvider['applyCompletion'](activeEditor, position, text);
                            logger.debug('在强制激活编辑器后应用补全');
                        });
                    }
                } else {
                    logger.debug(`缺少应用补全所需参数: document=${!!document}, position=${!!position}, text=${!!text}`);
                }
            }
        );
        context.subscriptions.push(applyCompletionItemCommand);
        
        // 监听文档变化事件
        const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
            // 过滤掉输出窗口和非文件方案的文档变化
            if (event.document.uri.scheme !== 'file' || 
                event.document.uri.toString().includes('extension-output')) {
                return; // 忽略输出窗口和非文件的变化
            }
            
            if (shouldCacheChanges(event, configManager)) {
                // 在此处可以添加代码缓存逻辑
            }
        });
        context.subscriptions.push(documentChangeDisposable);
        
        // 标记补全提供程序为已注册
        completionProvider.setRegistered(true);
        logger.info('补全提供程序注册完成');
        
        // 显示欢迎信息 - 修改消息内容，删除连续补全的描述
        vscode.window.showInformationMessage('Ollama代码补全扩展已激活。补全内容将自动应用到编辑器中。');
        
        logger.info('扩展激活完成');
    } catch (err) {
        logger.error('激活插件时发生错误', err);
        vscode.window.showErrorMessage('激活插件时发生错误，请检查日志输出。');
    }
}

/**
 * 判断是否应该缓存文档变更
 */
function shouldCacheChanges(
    event: vscode.TextDocumentChangeEvent,
    configManager: ConfigManager
): boolean {
    // 检查文件类型是否在启用列表中
    const fileName = event.document.fileName;
    const enabledTypes = configManager.getEnabledFileTypes();
    const disabledTypes = configManager.getDisabledFileTypes();
    
    // 检查扩展名
    const fileExt = fileName.substring(fileName.lastIndexOf('.'));
    
    // 如果明确禁用，则不缓存
    if (disabledTypes.includes(fileExt)) {
        return false;
    }
    
    // 如果明确启用或设置为所有文件类型(*)，则缓存
    return enabledTypes.includes(fileExt) || enabledTypes.includes('*');
}

/**
 * 停用插件
 */
export function deactivate() {
    console.log('VSCode Ollama 代码补全插件已停用!');
} 