import * as vscode from 'vscode';
import { CompletionProvider } from './providers/completionProvider';
import { OllamaClient } from './api/ollamaClient';
import { ConfigManager } from './config/configManager';
import { CacheManager } from './cache/cacheManager';
import { StatusBarManager } from './ui/statusBar';
import { Logger, LogLevel } from './utils/logger';
import { CommandManager } from './ui/commands';

/**
 * 激活插件
 * @param context 扩展上下文
 */
export async function activate(context: vscode.ExtensionContext) {
    // 初始化日志系统
    const logger = Logger.getInstance();
    
    try {
        // 初始化配置管理器
        const configManager = new ConfigManager();
        
        // 验证配置
        if (!configManager.getApiUrl()) {
            vscode.window.showErrorMessage('Ollama API URL未设置，请在设置中配置。');
            return;
        }
        
        if (!configManager.getModelName()) {
            vscode.window.showErrorMessage('Ollama模型名称未设置，请在设置中配置。');
            return;
        }
        
        // 初始化缓存管理器
        const cacheManager = new CacheManager(context.globalState, configManager);
        
        // 初始化Ollama客户端
        const ollamaClient = new OllamaClient(configManager);
        
        // 测试Ollama API连接
        const connectionTest = await ollamaClient.testConnection();
        if (!connectionTest.success) {
            vscode.window.showWarningMessage(`无法连接到Ollama API: ${connectionTest.message}。请检查配置并确保Ollama服务正在运行。`);
        }
        
        // 初始化状态栏
        const statusBar = new StatusBarManager(configManager);
        context.subscriptions.push(statusBar);
        
        // 创建诊断集合
        const diagnosticsCollection = vscode.languages.createDiagnosticCollection('tabAutoComplete');
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

        // 注册补全提供程序
        const supportedLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'html', 'css', 'markdown'];
        
        // 确保为每种语言正确注册
        for (const language of supportedLanguages) {
            const selector: vscode.DocumentSelector = { language, scheme: 'file' };
            const provider = vscode.languages.registerCompletionItemProvider(
                selector,
                completionProvider,
                ...completionProvider.getTriggerCharacters()
            );
            context.subscriptions.push(provider);
        }

        // 监听编辑器内容变化事件，实现内联预览功能
        let debounceTimer: NodeJS.Timeout | null = null;
        let isProcessingCompletion = false;
        let lastChangeTime = Date.now();

        // 监听键盘事件
        const keyPressListener = vscode.commands.registerCommand('type', async (args: { text: string }) => {
            // 获取活动编辑器
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await vscode.commands.executeCommand('default:type', args);
                return;
            }

            // 检查输入的字符
            const inputChar = args.text;
            logger.debug('输入字符', inputChar);
  
            // 过滤掉控制字符和特殊按键
            if (!isValidInputChar(inputChar)) {
                await vscode.commands.executeCommand('default:type', args);
                logger.debug('特殊字符不处理', inputChar);
                return;
            }

            // 如果插件被禁用，直接执行默认输入
            if (!configManager.isEnabled()) {
                await vscode.commands.executeCommand('default:type', args);
                return;
            }

            // 先执行默认的输入操作
            await vscode.commands.executeCommand('default:type', args);

            // 若又请求则取消
            completionProvider.cancel();

            // 若有预览则清除
            completionProvider.clearPreview();

            // 更新最后变更时间
            lastChangeTime = Date.now();

            // 清除之前的定时器
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            // 设置新的定时器，等待用户停止输入
            debounceTimer = setTimeout(async () => {
                try {
                    // 再次检查是否经过了足够的防抖时间
                    const timeSinceLastChange = Date.now() - lastChangeTime;
                    const debounceDelay = configManager.getDebounceDelay();
                    if (timeSinceLastChange < debounceDelay) {
                        return;
                    }

                    // 检查文件类型是否支持
                    if (!completionProvider.isFileTypeSupported(editor.document)) {
                        return;
                    }

                    // 标记开始处理补全
                    isProcessingCompletion = true;

                    // 获取当前光标位置
                    const position = editor.selection.active;

                    // 创建取消令牌
                    const cancellationTokenSource = new vscode.CancellationTokenSource();

                    // 请求补全项
                    const completionItems = await completionProvider.provideCompletionItems(
                        editor.document,
                        position,
                        cancellationTokenSource.token,
                        { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: inputChar }
                    );

                    // 如果有补全项，显示第一个
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

                            // 设置预览
                            await completionProvider.setPreview(insertText, position);
                        }
                    }
                } catch (error) {
                    logger.error('处理键盘输入时出错', error);
                } finally {
                    isProcessingCompletion = false;
                }
            }, configManager.getDebounceDelay());
        });
        context.subscriptions.push(keyPressListener);

        /**
         * 检查是否是有效的输入字符
         */
        function isValidInputChar(char: string): boolean {
            // 如果是空字符串或长度不为1，返回false
            if (!char || char.length !== 1) {
                return false;
            }

            // 获取字符的Unicode码点
            const code = char.charCodeAt(0);

            // 检查是否是可打印字符或常用标点符号
            const isPrintable = code > 31 && code < 127;  // ASCII可打印字符
            const isChineseChar = code >= 0x4E00 && code <= 0x9FFF;  // 基本汉字范围
            const isCommonPunctuation = [
                '.', ',', ':', ';', '!', '?', '"', "'", '`',
                '(', ')', '[', ']', '{', '}',
                '+', '-', '*', '/', '=', '<', '>', '_',
                '@', '#', '$', '%', '^', '&', '|', '\\',
                '~'
            ].includes(char);

            // 检查是否是空格或换行（作为特殊的触发字符）
            const isSpecialTrigger = [' ', '\n'].includes(char);

            return isPrintable || isChineseChar || isCommonPunctuation || isSpecialTrigger;
        }

        // 监听按键事件，处理ESC键
        const keyBindingListener = vscode.commands.registerCommand('tabAutoComplete.handleEscape', () => {
            if (completionProvider.hasActivePreview()) {
                completionProvider.clearPreview();
            }
            // 取消当前的补全请求
            completionProvider.cancel();
            completionProvider.lastShownCompletion = null;
        });
        context.subscriptions.push(keyBindingListener);
        
        // 注册自动补全命令 - 修改为直接应用补全
        const applyCompletionCommand = vscode.commands.registerTextEditorCommand('tabAutoComplete.applyCompletion',
            (textEditor: vscode.TextEditor) => {
                if (configManager.isEnabled() && textEditor && completionProvider.lastShownCompletion) {
                    completionProvider.accept(completionProvider.lastShownCompletion.completionId);
                }
                else{
                    textEditor.edit((editBuilder) => {
                        const position = textEditor.selection.active;
                        editBuilder.insert(position, '\t');
                    });
                }
            }
        );
        context.subscriptions.push(applyCompletionCommand);
        
        // 注册记录补全结果的命令
        const logCompletionOutcomeCommand = vscode.commands.registerCommand(
            'tabAutoComplete.logCompletionOutcome',
            async (completionId: string, provider: CompletionProvider) => {
                if (completionId && provider) {
                    await provider.accept(completionId);
                }
            }
        );
        context.subscriptions.push(logCompletionOutcomeCommand);
        
        // 标记补全提供程序为已注册
        completionProvider.setRegistered(true);

        // 注册命令
        const commandManager = new CommandManager(
            context,
            configManager,
            ollamaClient,
            cacheManager,
            statusBar
        );

        // 显示欢迎信息 - 修改消息内容，删除连续补全的描述
        //vscode.window.showInformationMessage('tabAutoComplete代码补全扩展已激活。');
        
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
    // 不需要日志输出
} 