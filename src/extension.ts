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

        // 监听编辑器内容变化事件，实现内联预览功能
        const typingListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (!configManager.isEnabled()) {
                return;
            }

            // 忽略非文件编辑器的变化
            if (event.document.uri.scheme !== 'file') {
                return;
            }

            // 获取活动编辑器
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) {
                return;
            }

            // 延迟300毫秒，避免频繁触发
            const delay = configManager.getTriggerDelay();
            await new Promise(resolve => setTimeout(resolve, delay));

            // 如果文档已经变化，则不处理
            if (editor.document.version !== event.document.version) {
                return;
            }

            try {
                // 获取当前光标位置
                const position = editor.selection.active;
                
                // 检查文件类型是否支持
                if (!completionProvider.isFileTypeSupported(editor.document)) {
                    return;
                }

                // 使用提供者生成补全项
                const completionItems = await completionProvider.provideCompletionItems(
                    editor.document, 
                    position, 
                    new vscode.CancellationTokenSource().token, 
                    { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: '' }
                );

                // 如果有补全项，则显示第一个
                if (completionItems) {
                    let items: vscode.CompletionItem[] = [];
                    if (Array.isArray(completionItems)) {
                        items = completionItems;
                    } else {
                        items = completionItems.items;
                    }

                    if (items.length > 0) {
                        const item = items[0];
                        const insertText = typeof item.insertText === 'string' ? 
                            item.insertText : item.insertText?.value || '';
                        
                        // 创建装饰器
                        const decorator = vscode.window.createTextEditorDecorationType({
                            after: {
                                contentText: insertText,
                                color: '#888888'
                            }
                        });

                        // 应用装饰器
                        editor.setDecorations(decorator, [new vscode.Range(position, position)]);

                        // 保存状态，以便后续接受补全
                        completionProvider.setLastDecorator(decorator);
                        completionProvider.setLastInsertText(insertText);
                        completionProvider.setLastPosition(position);
                    }
                }
            } catch (error) {
                logger.error('处理编辑器变化时出错', error);
            }
        });
        context.subscriptions.push(typingListener);

        // 注册Tab键监听，用于接受补全
        const tabHandler = vscode.commands.registerTextEditorCommand(
            'ollamaCompletion.acceptCompletion',
            async (editor) => {
                try {
                    // 如果有活动的预览，则应用它
                    if (completionProvider.hasActivePreview()) {
                        const insertText = completionProvider.getLastInsertText();
                        const position = completionProvider.getLastPosition();
                        
                        if (insertText && position) {
                            // 应用补全
                            const success = await editor.edit(editBuilder => {
                                editBuilder.insert(position, insertText);
                            });
                            
                            if (success) {
                                // 清除预览
                                completionProvider.clearPreview();
                            } else {
                                logger.error('应用补全失败');
                            }
                        }
                    }
                } catch (error) {
                    logger.error('执行acceptCompletion命令时出错', error);
                    // 确保在出错时也清理预览状态
                    completionProvider.clearPreview();
                }
            }
        );
        context.subscriptions.push(tabHandler);
        
        // 注册自动补全命令 - 修改为直接应用补全
        const applyCompletionCommand = vscode.commands.registerTextEditorCommand(
            'ollamaCompletion.applyCompletion',
            async (textEditor: vscode.TextEditor) => {
                // 当用户手动触发时，接受当前显示的补全
                if (textEditor && completionProvider.lastShownCompletion) {
                    await completionProvider.accept(completionProvider.lastShownCompletion.completionId);
                }
            }
        );
        context.subscriptions.push(applyCompletionCommand);
        
        // 注册记录补全结果的命令
        const logCompletionOutcomeCommand = vscode.commands.registerCommand(
            'ollamaCompletion.logCompletionOutcome',
            async (completionId: string, provider: CompletionProvider) => {
                if (completionId && provider) {
                    await provider.accept(completionId);
                }
            }
        );
        context.subscriptions.push(logCompletionOutcomeCommand);
        
        // 配置键盘快捷键
        context.subscriptions.push(
            vscode.commands.registerCommand('editor.action.tab', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor && completionProvider.hasActivePreview()) {
                    // 如果有活动的预览，执行接受补全的命令
                    await vscode.commands.executeCommand('ollamaCompletion.acceptCompletion');
                    return vscode.commands.executeCommand('');
                }
                // 如果没有活动的预览，执行默认的Tab行为
                return vscode.commands.executeCommand('tab');
            })
        );

        // 注册键盘事件处理
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                const editor = vscode.window.activeTextEditor;
                if (editor && e.document === editor.document) {
                    // 检查是否是Tab键输入
                    const changes = e.contentChanges;
                    if (changes.length === 1 && changes[0].text === '\t') {
                        if (completionProvider.hasActivePreview()) {
                            // 撤销Tab字符插入
                            await editor.edit(editBuilder => {
                                editBuilder.delete(new vscode.Range(
                                    changes[0].range.start,
                                    changes[0].range.end
                                ));
                            });
                            // 应用补全
                            await vscode.commands.executeCommand('ollamaCompletion.acceptCompletion');
                        }
                    }
                }
            })
        );
        
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