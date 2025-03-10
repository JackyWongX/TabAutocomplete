/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(__webpack_require__(1));
const completionProvider_1 = __webpack_require__(2);
const ollamaClient_1 = __webpack_require__(3);
const configManager_1 = __webpack_require__(27);
const cacheManager_1 = __webpack_require__(28);
const statusBar_1 = __webpack_require__(33);
const logger_1 = __webpack_require__(4);
const commands_1 = __webpack_require__(34);
/**
 * 激活插件
 * @param context 扩展上下文
 */
async function activate(context) {
    // 初始化日志系统
    const logger = logger_1.Logger.getInstance();
    try {
        // 初始化配置管理器
        const configManager = new configManager_1.ConfigManager();
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
        const cacheManager = new cacheManager_1.CacheManager(context.globalState, configManager);
        // 初始化Ollama客户端
        const ollamaClient = new ollamaClient_1.OllamaClient(configManager);
        // 测试Ollama API连接
        const connectionTest = await ollamaClient.testConnection();
        if (!connectionTest.success) {
            vscode.window.showWarningMessage(`无法连接到Ollama API: ${connectionTest.message}。请检查配置并确保Ollama服务正在运行。`);
        }
        // 初始化状态栏
        const statusBar = new statusBar_1.StatusBarManager(configManager);
        context.subscriptions.push(statusBar);
        // 创建诊断集合
        const diagnosticsCollection = vscode.languages.createDiagnosticCollection('tabAutoComplete');
        context.subscriptions.push(diagnosticsCollection);
        // 初始化补全提供程序
        const completionProvider = new completionProvider_1.CompletionProvider(configManager, logger, cacheManager, statusBar.getStatusBarItem(), diagnosticsCollection, context);
        // 注册补全提供程序
        const supportedLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'html', 'css', 'markdown'];
        // 确保为每种语言正确注册
        for (const language of supportedLanguages) {
            const selector = { language, scheme: 'file' };
            const provider = vscode.languages.registerCompletionItemProvider(selector, completionProvider, ...completionProvider.getTriggerCharacters());
            context.subscriptions.push(provider);
        }
        // 监听编辑器内容变化事件，实现内联预览功能
        let debounceTimer = null;
        let isProcessingCompletion = false;
        let lastChangeTime = Date.now();
        // 监听键盘事件
        const keyPressListener = vscode.commands.registerCommand('type', async (args) => {
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
                    const completionItems = await completionProvider.provideCompletionItems(editor.document, position, cancellationTokenSource.token, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: inputChar });
                    // 如果有补全项，显示第一个
                    if (completionItems) {
                        let items = [];
                        if (Array.isArray(completionItems)) {
                            items = completionItems;
                        }
                        else {
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
                }
                catch (error) {
                    logger.error('处理键盘输入时出错', error);
                }
                finally {
                    isProcessingCompletion = false;
                }
            }, configManager.getDebounceDelay());
        });
        context.subscriptions.push(keyPressListener);
        /**
         * 检查是否是有效的输入字符
         */
        function isValidInputChar(char) {
            // 如果是空字符串或长度不为1，返回false
            if (!char || char.length !== 1) {
                return false;
            }
            // 获取字符的Unicode码点
            const code = char.charCodeAt(0);
            // 检查是否是可打印字符或常用标点符号
            const isPrintable = code > 31 && code < 127; // ASCII可打印字符
            const isChineseChar = code >= 0x4E00 && code <= 0x9FFF; // 基本汉字范围
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
        const applyCompletionCommand = vscode.commands.registerTextEditorCommand('tabAutoComplete.applyCompletion', (textEditor) => {
            if (configManager.isEnabled() && textEditor && completionProvider.lastShownCompletion) {
                completionProvider.accept(completionProvider.lastShownCompletion.completionId);
            }
            else {
                // 执行 VS Code 的默认缩进操作
                vscode.commands.executeCommand('editor.action.indentLines').then(() => {
                    // 缩进操作成功
                }, (error) => {
                    console.error('Failed to execute default indent action:', error);
                    textEditor.edit((editBuilder) => {
                        const position = textEditor.selection.active;
                        editBuilder.insert(position, '\t');
                    });
                });
            }
        });
        context.subscriptions.push(applyCompletionCommand);
        // 注册记录补全结果的命令
        const logCompletionOutcomeCommand = vscode.commands.registerCommand('tabAutoComplete.logCompletionOutcome', async (completionId, provider) => {
            if (completionId && provider) {
                await provider.accept(completionId);
            }
        });
        context.subscriptions.push(logCompletionOutcomeCommand);
        // 标记补全提供程序为已注册
        completionProvider.setRegistered(true);
        // 注册命令
        const commandManager = new commands_1.CommandManager(context, configManager, ollamaClient, cacheManager, statusBar);
        // 显示欢迎信息 - 修改消息内容，删除连续补全的描述
        //vscode.window.showInformationMessage('tabAutoComplete代码补全扩展已激活。');
    }
    catch (err) {
        logger.error('激活插件时发生错误', err);
        vscode.window.showErrorMessage('激活插件时发生错误，请检查日志输出。');
    }
}
exports.activate = activate;
/**
 * 判断是否应该缓存文档变更
 */
function shouldCacheChanges(event, configManager) {
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
function deactivate() {
    // 不需要日志输出
}
exports.deactivate = deactivate;


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CompletionProvider = void 0;
const vscode = __importStar(__webpack_require__(1));
const ollamaClient_1 = __webpack_require__(3);
const uuid_1 = __webpack_require__(5);
/**
 * 代码补全提供程序
 * 负责分析用户代码，收集上下文，请求模型生成补全，并将补全内容应用到编辑器中
 */
class CompletionProvider {
    /**
     * 构造函数
     */
    constructor(configManager, logger, cacheManager, statusBarItem, diagnosticsCollection, _context) {
        // 跟踪状态
        this.isRegisteredFlag = false;
        this.lastCompletionResult = null;
        this.lastContext = '';
        this.lastPosition = null;
        this.errorsShown = new Set();
        this.abortControllers = new Map();
        this.lastShownCompletion = undefined;
        // 预览相关属性
        this.lastDecorator = null;
        this.lastInsertText = null;
        this.lastPreviewPosition = null;
        this.temporaryLines = 0; // 跟踪临时插入的空行数量
        this.originalPosition = null; // 记录原始光标位置
        this.configManager = configManager;
        this.logger = logger;
        this.cacheManager = cacheManager;
        this.statusBarItem = statusBarItem;
        this.diagnosticsCollection = diagnosticsCollection;
        this.client = new ollamaClient_1.OllamaClient(configManager);
        this.logger.debug('CompletionProvider 已初始化');
    }
    /**
     * 处理错误
     */
    onError(e) {
        // 忽略一些常见的预期错误
        const ERRORS_TO_IGNORE = [
            "unexpected server status",
            "operation was aborted",
        ];
        if (ERRORS_TO_IGNORE.some((err) => typeof e === "string" ? e.includes(err) : e?.message?.includes(err))) {
            return;
        }
        this.logger.error('生成代码补全时出错', e);
        if (!this.errorsShown.has(e.message)) {
            this.errorsShown.add(e.message);
            let options = ["文档"];
            if (e.message.includes("Ollama可能未安装")) {
                options.push("下载Ollama");
            }
            else if (e.message.includes("Ollama可能未运行")) {
                options = ["启动Ollama"];
            }
            vscode.window.showErrorMessage(e.message, ...options).then((val) => {
                if (val === "文档") {
                    vscode.env.openExternal(vscode.Uri.parse("https://github.com/ollama/ollama"));
                }
                else if (val === "下载Ollama") {
                    vscode.env.openExternal(vscode.Uri.parse("https://ollama.ai/download"));
                }
                else if (val === "启动Ollama") {
                    // 启动Ollama的逻辑
                    this.startOllama();
                }
            });
        }
    }
    /**
     * 启动Ollama服务
     */
    async startOllama() {
        // 根据平台选择不同的启动命令
        let command = '';
        if (process.platform === 'win32') {
            command = 'start ollama serve';
        }
        else if (process.platform === 'darwin') {
            command = 'open -a Ollama';
        }
        else {
            command = 'ollama serve';
        }
        try {
            // 使用VS Code的终端执行命令
            const terminal = vscode.window.createTerminal('Ollama');
            terminal.sendText(command);
            terminal.show();
            this.logger.debug('已尝试启动Ollama服务');
            vscode.window.showInformationMessage('正在尝试启动Ollama服务，请稍候...');
            // 等待几秒钟后测试连接
            setTimeout(async () => {
                const result = await this.client.testConnection();
                if (result.success) {
                    vscode.window.showInformationMessage('Ollama服务已成功启动！');
                }
                else {
                    vscode.window.showErrorMessage('Ollama服务启动失败，请手动启动Ollama。');
                }
            }, 5000);
        }
        catch (error) {
            this.logger.error('启动Ollama服务失败', error);
            vscode.window.showErrorMessage('启动Ollama服务失败，请手动启动Ollama。');
        }
    }
    /**
     * 取消当前的补全请求
     */
    cancel() {
        this.abortControllers.forEach((controller) => {
            controller.abort();
        });
        this.abortControllers.clear();
    }
    /**
     * 创建中止控制器
     */
    createAbortController(completionId) {
        const controller = new AbortController();
        this.abortControllers.set(completionId, controller);
        return controller;
    }
    /**
     * 删除中止控制器
     */
    deleteAbortController(completionId) {
        this.abortControllers.delete(completionId);
    }
    /**
     * 接受补全
     */
    async accept(completionId) {
        this.logger.debug(`接受补全: ${completionId || '无ID'}`);
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                this.logger.debug('没有活动的编辑器，无法接受补全');
                return;
            }
            // 检查是否有必要的状态
            if (!this.lastInsertText || !this.originalPosition) {
                this.logger.debug('缺少必要的状态信息，无法接受补全');
                await this.clearPreview();
                return;
            }
            // 计算要删除的范围
            const lines = this.lastInsertText.split('\n');
            const endPosition = new vscode.Position(this.originalPosition.line + lines.length - 1, lines[lines.length - 1].length + (lines.length === 1 ? this.originalPosition.character : 0));
            const range = new vscode.Range(this.originalPosition, endPosition);
            // 保存当前的预览内容
            const textToInsert = this.lastInsertText;
            // 清理装饰器（如果存在）
            if (this.lastDecorator) {
                this.lastDecorator.dispose();
                this.lastDecorator = null;
            }
            // 删除预览内容并重新插入
            const success = await editor.edit(editBuilder => {
                editBuilder.delete(range);
                editBuilder.insert(this.originalPosition, textToInsert);
            });
            if (!success) {
                this.logger.debug('编辑操作失败');
                return;
            }
            // 等待文档保存
            if (editor.document.isDirty) {
                await editor.document.save();
            }
            // 将接受的补全内容保存到缓存
            if (this.configManager.isCacheEnabled() && this.lastContext && textToInsert) {
                this.logger.debug('将已接受的补全内容保存到缓存');
                try {
                    await this.cacheManager.put(this.lastContext, textToInsert);
                }
                catch (error) {
                    this.logger.debug(`保存补全内容到缓存时出错: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            // 移动光标到插入内容的末尾
            const newPosition = new vscode.Position(this.originalPosition.line + lines.length - 1, lines[lines.length - 1].length + (lines.length === 1 ? this.originalPosition.character : 0));
            editor.selection = new vscode.Selection(newPosition, newPosition);
            // 重置所有状态
            this.lastDecorator = null;
            this.lastInsertText = null;
            this.lastPreviewPosition = null;
            this.lastPosition = null;
            this.originalPosition = null;
            this.lastShownCompletion = null;
            this.logger.debug('补全内容已成功应用');
        }
        catch (error) {
            this.logger.error('接受补全时出错', error);
            // 如果出错，确保清除所有状态
            await this.clearPreview();
        }
    }
    /**
     * 标记补全已显示
     */
    markDisplayed(completionId, outcome) {
        this.logger.debug(`标记补全已显示: ${completionId}`);
        // 记录outcome相关信息
        if (outcome) {
            this.logger.debug(`补全长度: ${outcome.completion?.length || 0}, 是否来自缓存: ${outcome.cacheHit || false}`);
        }
    }
    /**
     * 应用补全内容到编辑器
     */
    async applyCompletion(editor, position, text) {
        try {
            if (!text || text.trim().length === 0) {
                this.logger.debug('补全内容为空，不应用');
                return;
            }
            // 处理补全内容
            let processedText = text;
            // 移除可能存在的代码块标记
            if (processedText.startsWith('```')) {
                const langMatch = processedText.match(/^```(\w+)\n/);
                if (langMatch) {
                    processedText = processedText.substring(langMatch[0].length);
                }
                else {
                    processedText = processedText.substring(3);
                }
            }
            if (processedText.endsWith('```')) {
                processedText = processedText.substring(0, processedText.length - 3);
            }
            // 编辑文档插入补全内容
            const success = await editor.edit(editBuilder => {
                editBuilder.insert(position, processedText);
            });
            if (success) {
                // 应用成功，将光标移动到插入的文本末尾
                const insertedLines = processedText.split('\n');
                const lastLineLength = insertedLines[insertedLines.length - 1].length;
                let newPosition;
                if (insertedLines.length > 1) {
                    // 插入了多行文本
                    newPosition = new vscode.Position(position.line + insertedLines.length - 1, insertedLines.length > 1 ? lastLineLength : position.character + lastLineLength);
                }
                else {
                    // 插入了单行文本
                    newPosition = new vscode.Position(position.line, position.character + processedText.length);
                }
                // 设置新的光标位置
                editor.selection = new vscode.Selection(newPosition, newPosition);
                // 确保编辑器视图能看到新的光标位置
                editor.revealRange(new vscode.Range(newPosition, newPosition));
                // 更新最后位置
                this.lastPosition = newPosition;
            }
            else {
                this.logger.debug('应用补全内容失败，编辑操作返回false');
            }
        }
        catch (error) {
            this.logger.error('应用补全时出错', error);
            throw error; // 重新抛出错误以便调用者处理
        }
    }
    /**
     * 获取触发字符
     */
    getTriggerCharacters() {
        return ['.', '(', '{', '[', ',', ' ', '\n'];
    }
    /**
     * 提供代码补全项
     */
    async provideCompletionItems(document, position, token, context) {
        try {
            // 记录触发信息
            this.logger.debug(`触发补全，类型: ${context.triggerKind}, 字符: ${context.triggerCharacter || 'none'}`);
            // 检查是否启用了代码补全
            if (!this.configManager.isEnabled()) {
                this.logger.debug('代码补全功能已禁用，不提供补全');
                return null;
            }
            // 检查文件类型是否支持
            if (!this.isFileTypeSupported(document)) {
                this.logger.debug(`文件类型不支持: ${document.languageId}, 文件: ${document.fileName}`);
                return null;
            }
            // 不要在SCM视图中补全
            if (document.uri.scheme === "vscode-scm") {
                this.logger.debug('SCM视图中不提供补全');
                return null;
            }
            // 不要在多光标模式下补全
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.selections.length > 1) {
                this.logger.debug('多光标模式下不提供补全');
                return null;
            }
            // 创建中止信号
            const completionId = uuid_1.v4();
            const controller = this.createAbortController(completionId);
            const signal = controller.signal;
            this.logger.debug(`创建补全请求: ${completionId}`);
            // 如果传入了token，监听取消事件
            if (token) {
                token.onCancellationRequested(() => controller.abort());
            }
            // 更新状态栏
            this.statusBarItem.text = "$(sync~spin) 生成补全...";
            this.statusBarItem.tooltip = "正在生成代码补全";
            this.statusBarItem.show();
            const startTime = Date.now();
            // 收集上下文
            const contextData = this.collectContext(document, position);
            this.logger.debug(`收集上下文完成，前缀长度: ${contextData.prefix.length}, 后缀长度: ${contextData.suffix.length}`);
            // 从缓存中查找
            let completion = null;
            let cacheHit = false;
            if (this.configManager.isCacheEnabled()) {
                this.logger.debug('缓存已启用，尝试从缓存获取补全');
                try {
                    const cachedCompletion = await this.cacheManager.get(contextData.prefix);
                    if (cachedCompletion) {
                        completion = cachedCompletion;
                        cacheHit = true;
                        contextData.cacheHit = true; // 添加缓存命中标记到上下文
                        this.logger.debug('使用缓存的补全结果');
                    }
                    else {
                        this.logger.debug('缓存未命中');
                    }
                }
                catch (error) {
                    this.logger.debug(`从缓存获取补全时出错: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            else {
                this.logger.debug('缓存已禁用');
            }
            // 如果缓存中没有，则请求模型生成
            if (!completion) {
                try {
                    // 准备提示
                    const prompt = this.preparePrompt(contextData);
                    this.logger.debug(`准备提示完成，提示长度: ${prompt.length}`);
                    // 获取API配置
                    const modelName = this.configManager.getModelName();
                    const temperature = this.configManager.getTemperature();
                    const maxTokens = this.configManager.getMaxTokens();
                    this.logger.debug(`API配置: 模型=${modelName}, 温度=${temperature}, 最大token=${maxTokens}`);
                    // 请求模型生成补全
                    this.logger.debug('开始调用模型生成补全');
                    completion = await this.client.generateCompletion(prompt, {
                        temperature: temperature,
                        maxTokens: maxTokens,
                        model: modelName
                    }, signal);
                    // 如果请求被中止，返回null
                    if (signal.aborted) {
                        this.logger.debug('补全请求被中止');
                        this.statusBarItem.text = "$(code) 补全";
                        this.statusBarItem.tooltip = "Ollama代码补全";
                        return null;
                    }
                    if (completion) {
                        this.logger.debug(`模型生成补全成功，原始补全长度: ${completion.length}`);
                    }
                    else {
                        this.logger.debug('模型返回空补全');
                    }
                    // 处理补全结果
                    completion = this.processCompletionResult(completion, contextData);
                    if (completion) {
                        this.logger.debug(`处理后的补全长度: ${completion.length}`);
                    }
                    else {
                        this.logger.debug('处理后补全为空');
                    }
                    // 保存到缓存
                    if (this.configManager.isCacheEnabled() && completion) {
                        this.logger.debug('将补全结果保存到缓存');
                        await this.cacheManager.put(contextData.prefix, completion);
                    }
                }
                catch (error) {
                    if (signal.aborted) {
                        this.logger.debug('补全请求被中止');
                        this.statusBarItem.text = "$(code) 补全";
                        this.statusBarItem.tooltip = "Ollama代码补全";
                        return null;
                    }
                    this.logger.error(`生成补全时出错: ${error instanceof Error ? error.message : String(error)}`);
                    this.onError(error);
                    this.statusBarItem.text = "$(code) 补全";
                    this.statusBarItem.tooltip = "Ollama代码补全";
                    return null;
                }
            }
            else {
                // 如果是缓存的结果，也需要处理
                completion = this.processCompletionResult(completion, contextData);
            }
            // 如果没有生成补全内容，返回null
            if (!completion) {
                this.logger.debug('没有生成补全内容，返回null');
                this.statusBarItem.text = "$(code) 补全";
                this.statusBarItem.tooltip = "Ollama代码补全";
                return null;
            }
            // 记录结果
            this.lastCompletionResult = completion;
            this.lastContext = contextData.prefix;
            this.lastPosition = position;
            this.logger.debug(`记录补全结果，长度: ${completion.length}`);
            // 构建补全结果对象
            const outcome = {
                time: Date.now() - startTime,
                completion,
                prefix: contextData.prefix,
                suffix: contextData.suffix,
                prompt: contextData.prompt,
                modelProvider: 'ollama',
                modelName: this.configManager.getModelName(),
                cacheHit,
                filepath: document.uri.toString(),
                numLines: completion.split("\n").length,
                completionId,
                timestamp: Date.now(),
            };
            // 标记为已显示
            this.markDisplayed(completionId, outcome);
            this.lastShownCompletion = outcome;
            // 创建补全项
            const item = new vscode.CompletionItem(completion.split('\n')[0] + '...', vscode.CompletionItemKind.Snippet);
            // 设置插入文本
            item.insertText = completion;
            // 设置详细信息
            item.detail = '基于上下文的AI补全';
            // 设置文档
            item.documentation = new vscode.MarkdownString('```' + document.languageId + '\n' + completion + '\n```');
            // 设置排序文本，确保我们的补全项排在前面
            item.sortText = '0';
            // 更新状态栏
            this.statusBarItem.text = "TabAutocomplete";
            this.statusBarItem.tooltip = "TabAutocomplete代码补全";
            this.logger.debug('成功创建补全项，返回补全结果');
            // 设置预览
            await this.setPreview(completion, position);
            return [item];
        }
        catch (error) {
            this.logger.error(`provideCompletionItems方法出错: ${error instanceof Error ? error.message : String(error)}`);
            this.onError(error);
            return null;
        }
        finally {
            this.statusBarItem.text = "TabAutocomplete";
            this.statusBarItem.tooltip = "TabAutocomplete代码补全";
        }
    }
    /**
     * 准备提示
     */
    preparePrompt(contextData) {
        // 获取提示模板并替换占位符
        const template = this.configManager.getPromptTemplate();
        return template.replace('${prefix}', contextData.prefix + "TODO\n" + contextData.suffix + "\n从TODO这一行开始补全，不要返回上下文中重复的内容");
    }
    /**
     * 处理补全结果
     */
    processCompletionResult(completion, contextData) {
        if (!completion) {
            return null;
        }
        // 移除可能的代码块标记
        let processedText = completion;
        if (processedText.startsWith('```')) {
            const langMatch = processedText.match(/^```(\w+)\n/);
            if (langMatch) {
                processedText = processedText.substring(langMatch[0].length);
            }
            else {
                processedText = processedText.substring(3);
            }
        }
        if (processedText.endsWith('```')) {
            processedText = processedText.substring(0, processedText.length - 3);
        }
        let text = contextData.prefix + contextData.suffix;
        const textlines = text.split('\n');
        const processedTextlines = processedText.split('\n');
        const textlinesset = new Set();
        for (const line of textlines) {
            textlinesset.add(line.trim());
        }
        let findnum = 0;
        for (const line of processedTextlines) {
            if (textlinesset.has(line.trim())) {
                findnum++;
            }
        }
        if (findnum == processedTextlines.length) {
            this.logger.debug('跳过完全重复的补全内容');
            return null;
        }
        return processedText;
    }
    /**
     * 收集上下文
     */
    collectContext(document, position) {
        // 获取当前文件的内容
        const text = document.getText();
        const offset = document.offsetAt(position);
        // 获取上下文行数
        const maxContextLines = this.configManager.getMaxContextLines();
        // 分割前缀和后缀
        const prefix = text.substring(-maxContextLines, offset);
        const suffix = text.substring(offset, maxContextLines);
        // 获取导入语句
        const imports = this.getImportStatements(document);
        // 构建上下文
        const context = {
            prefix,
            suffix,
            prompt: '',
            imports,
            language: document.languageId,
            lineCount: document.lineCount,
            fileName: document.fileName
        };
        return context;
    }
    /**
     * 获取导入语句
     */
    getImportStatements(document) {
        const text = document.getText();
        const lines = text.split('\n');
        const imports = [];
        // 根据语言类型识别导入语句
        const language = document.languageId;
        // 正则表达式匹配不同语言的导入语句
        let importRegex;
        switch (language) {
            case 'javascript':
            case 'typescript':
            case 'javascriptreact':
            case 'typescriptreact':
                importRegex = /^(import|export)\s+.*/;
                break;
            case 'python':
                importRegex = /^(import|from)\s+.*/;
                break;
            case 'java':
            case 'kotlin':
                importRegex = /^import\s+.*/;
                break;
            case 'go':
                importRegex = /^import\s+[\(\"].*[\)\"]$/;
                break;
            case 'rust':
                importRegex = /^(use|extern crate)\s+.*/;
                break;
            case 'c':
            case 'cpp':
            case 'csharp':
                importRegex = /^#include\s+.*/;
                break;
            case 'php':
                importRegex = /^(use|require|include|require_once|include_once)\s+.*/;
                break;
            case 'ruby':
                importRegex = /^(require|include|extend|load|autoload)\s+.*/;
                break;
            default:
                // 默认匹配常见的导入关键字
                importRegex = /^(import|export|require|include|use|from)\s+.*/;
        }
        // 收集导入语句
        for (const line of lines) {
            if (importRegex.test(line.trim())) {
                imports.push(line);
            }
        }
        return imports;
    }
    /**
     * 检查文件类型是否支持
     */
    isFileTypeSupported(document) {
        try {
            // 获取文件扩展名和语言ID
            const fileName = document.fileName;
            const fileExt = fileName.substring(fileName.lastIndexOf('.'));
            const languageId = document.languageId;
            // 常见编程语言列表 - 如果用户没有明确配置，这些语言默认支持
            const commonLanguages = [
                'javascript', 'typescript', 'python', 'java', 'c', 'cpp',
                'csharp', 'go', 'rust', 'php', 'ruby', 'html', 'css'
            ];
            // 记录调试信息
            this.logger.debug(`检查文件类型支持: 扩展名=${fileExt}, 语言ID=${languageId}`);
            // 1. 首先检查全局启用状态
            if (!this.configManager.isEnabled()) {
                this.logger.debug('插件全局禁用');
                return false;
            }
            // 2. 检查是否在禁用列表中
            try {
                const disabledTypesArr = this.configManager.getDisabledFileTypes();
                const disabledTypes = Array.isArray(disabledTypesArr) ? disabledTypesArr : [];
                if (disabledTypes.includes(fileExt) || disabledTypes.includes(languageId)) {
                    this.logger.debug(`文件类型在禁用列表中: ${disabledTypes.join(',')}`);
                    return false;
                }
            }
            catch (error) {
                this.logger.debug(`获取禁用类型时出错: ${error}`);
            }
            // 3. 检查是否在启用列表中
            try {
                const enabledTypesArr = this.configManager.getEnabledFileTypes();
                // 确保我们有一个数组
                const enabledTypes = Array.isArray(enabledTypesArr) ? enabledTypesArr : [];
                // 记录启用类型
                this.logger.debug(`启用类型: ${JSON.stringify(enabledTypes)}`);
                // 如果启用了所有类型
                if (enabledTypes.includes('*') || enabledTypes.includes('all')) {
                    this.logger.debug('支持所有文件类型');
                    return true;
                }
                // 检查扩展名或语言ID是否明确启用
                if (enabledTypes.includes(fileExt) || enabledTypes.includes(languageId)) {
                    this.logger.debug(`文件类型明确启用: ${fileExt} 或 ${languageId}`);
                    return true;
                }
                // 如果是常见编程语言，但没有明确禁用，则支持
                if (commonLanguages.includes(languageId)) {
                    this.logger.debug(`常见编程语言自动支持: ${languageId}`);
                    return true;
                }
            }
            catch (error) {
                this.logger.debug(`获取启用类型时出错: ${error}`);
                // 如果出错，默认支持常见编程语言
                if (commonLanguages.includes(languageId)) {
                    return true;
                }
            }
            this.logger.debug(`文件类型不支持: ${languageId}, ${fileExt}`);
            return false;
        }
        catch (error) {
            this.logger.error(`检查文件类型支持时出错: ${error}`);
            return false;
        }
    }
    /**
     * 检查是否已注册
     */
    isRegistered() {
        return this.isRegisteredFlag;
    }
    /**
     * 设置注册状态
     */
    setRegistered(value) {
        this.isRegisteredFlag = value;
    }
    /**
     * 释放资源
     */
    dispose() {
        this.cancel();
        this.logger.debug('CompletionProvider 已释放');
    }
    /**
     * 设置最后使用的装饰器
     */
    setLastDecorator(decorator) {
        // 如果已经有装饰器，先清除它
        this.clearPreview();
        this.lastDecorator = decorator;
    }
    /**
     * 设置最后的插入文本
     */
    setLastInsertText(text) {
        this.lastInsertText = text;
    }
    /**
     * 设置最后的位置
     */
    setLastPosition(position) {
        this.lastPosition = position;
    }
    /**
     * 设置最后的预览位置
     */
    setLastPreviewPosition(position) {
        this.lastPreviewPosition = position;
    }
    /**
     * 获取最后的插入文本
     */
    getLastInsertText() {
        return this.lastInsertText;
    }
    /**
     * 获取最后的位置
     */
    getLastPosition() {
        return this.lastPosition;
    }
    /**
     * 检查是否有活动的预览
     */
    hasActivePreview() {
        // 检查所有必要的预览状态
        const hasDecorator = this.lastDecorator !== null;
        const hasInsertText = this.lastInsertText !== null && this.lastInsertText.length > 0;
        const hasPosition = this.lastPosition !== null;
        const hasPreviewPosition = this.lastPreviewPosition !== null;
        // 确保编辑器中的装饰器仍然存在
        const editor = vscode.window.activeTextEditor;
        // 所有条件都必须满足才认为有活动预览
        return hasDecorator && hasInsertText && hasPosition && hasPreviewPosition && editor !== undefined;
    }
    /**
     * 清除预览
     */
    async clearPreview() {
        if (this.lastDecorator == null) {
            return;
        }
        try {
            const editor = vscode.window.activeTextEditor;
            // 先清除装饰器
            if (this.lastDecorator) {
                this.lastDecorator.dispose();
                this.lastDecorator = null;
            }
            // 如果有插入的内容，需要删除它
            if (this.lastInsertText && editor && this.originalPosition) {
                const lines = this.lastInsertText.split('\n');
                const endPosition = new vscode.Position(this.originalPosition.line + lines.length - 1, lines[lines.length - 1].length + (lines.length === 1 ? this.originalPosition.character : 0));
                await editor.edit(editBuilder => {
                    const range = new vscode.Range(this.originalPosition, endPosition);
                    editBuilder.delete(range);
                });
            }
        }
        catch (error) {
            this.logger.error('清除预览时出错', error);
        }
        this.lastDecorator = null;
        this.lastInsertText = null;
        this.lastPreviewPosition = null;
        this.lastPosition = null;
        this.originalPosition = null;
        //this.lastShownCompletion = null;
    }
    /**
     * 设置预览
     */
    async setPreview(text, position) {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            // 确保完全清除之前的预览
            await this.clearPreview();
            // 等待一下确保清除操作完成
            await new Promise(resolve => setTimeout(resolve, 50));
            // 将文本分割成行
            const lines = text.split('\n');
            // 创建新的装饰器，使插入的内容看起来像预览
            this.lastDecorator = vscode.window.createTextEditorDecorationType({
                opacity: '0.6'
            });
            // 直接将补全内容插入到文档中
            await editor.edit(editBuilder => {
                editBuilder.insert(position, text);
            });
            // 计算装饰范围
            const endPosition = new vscode.Position(position.line + lines.length - 1, lines[lines.length - 1].length + (lines.length === 1 ? position.character : 0));
            const range = new vscode.Range(position, endPosition);
            // 应用装饰器
            editor.setDecorations(this.lastDecorator, [{ range }]);
            // 保存状态
            this.lastInsertText = text;
            this.lastPosition = position;
            this.lastPreviewPosition = position;
            this.originalPosition = position;
            this.logger.debug(`预览已设置，直接插入了${lines.length}行内容`);
        }
        catch (error) {
            this.logger.error('设置预览时出错', error);
            await this.clearPreview();
        }
    }
    /**
     * 获取最后使用的装饰器
     */
    getLastDecorator() {
        return this.lastDecorator;
    }
    /**
     * 获取最后的预览位置
     */
    getLastPreviewPosition() {
        return this.lastPreviewPosition;
    }
}
exports.CompletionProvider = CompletionProvider;


/***/ }),
/* 3 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OllamaClient = void 0;
const logger_1 = __webpack_require__(4);
/**
 * Ollama API客户端
 * 负责与本地运行的Ollama服务通信，发送代码补全请求
 */
class OllamaClient {
    constructor(configManager) {
        this.configManager = configManager;
        this.logger = logger_1.Logger.getInstance();
    }
    /**
     * 获取代码补全
     * @param context 上下文信息
     * @returns 补全结果文本
     */
    async getCompletion(context) {
        try {
            const apiUrl = this.configManager.getApiUrl();
            const modelName = this.configManager.getModelName();
            const temperature = this.configManager.getTemperature();
            const maxTokens = this.configManager.getMaxTokens();
            this.logger.debug(`使用模型: ${modelName}, 温度: ${temperature}, 最大令牌数: ${maxTokens}`);
            // 构建提示词
            const prompt = this.buildPrompt(context);
            // 记录完整提示词（仅在调试模式下）
            if (this.configManager.isDebugEnabled()) {
                this.logger.debug(`完整提示词:\n${prompt}`);
            }
            else {
                // 仅记录提示词的前100个字符
                this.logger.debug(`提示词前100个字符: ${prompt.substring(0, 100)}...`);
            }
            // 构建请求数据
            const requestData = {
                model: modelName,
                prompt: prompt,
                temperature: temperature,
                max_tokens: maxTokens,
                options: {
                    num_predict: maxTokens
                }
            };
            // 请求信息日志
            this.logger.debug(`发送请求到 Ollama API: ${apiUrl}/api/generate`);
            this.logger.debug(`请求内容: ${JSON.stringify({
                model: modelName,
                temperature: temperature,
                max_tokens: maxTokens,
                prompt_length: prompt.length
            })}`);
            // 发送请求
            this.logger.debug(`开始fetch请求...`);
            this.logger.debug(`请求体大小: ${JSON.stringify(requestData).length} 字符`);
            const response = await fetch(`${apiUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            // 记录响应状态和头部
            this.logger.debug(`Ollama API 响应状态: ${response.status} ${response.statusText}`);
            const headers = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            this.logger.debug(`响应头: ${JSON.stringify(headers)}`);
            // 检查响应状态
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
                return null;
            }
            // 获取响应文本
            const responseText = await response.text();
            // 记录原始响应
            //this.logger.debug(`原始API响应:\n${responseText}`);
            //this.logger.debug(`响应内容长度: ${responseText.length} 字符`);
            //this.logger.debug(`响应内容前100字符: ${responseText}`);
            // 检查响应是否包含有效的JSON
            const openBraces = (responseText.match(/\{/g) || []).length;
            const closeBraces = (responseText.match(/\}/g) || []).length;
            this.logger.debug(`响应是否包含JSON标记: { 出现 ${openBraces} 次, } 出现 ${closeBraces} 次`);
            // 检查是否包含response字段
            const hasResponse = responseText.includes('"response"');
            this.logger.debug(`响应是否包含response字段: ${hasResponse}`);
            // 处理流式JSON响应
            let completionText = '';
            // 拆分响应并收集所有的response字段内容
            if (responseText.includes('"response"')) {
                try {
                    // 按行拆分响应
                    const lines = responseText.split('\n').filter(line => line.trim() !== '');
                    // 从每行提取response字段内容并合并
                    for (const line of lines) {
                        try {
                            const jsonObj = JSON.parse(line);
                            if (jsonObj && jsonObj.response) {
                                completionText += jsonObj.response;
                            }
                        }
                        catch (parseError) {
                            this.logger.debug(`解析响应行时出错: ${parseError.message}, 行内容: ${line.substring(0, 50)}...`);
                        }
                    }
                    this.logger.debug(`从流式响应中提取的完整内容, 长度: ${completionText.length}`);
                    // 检查是否为空或者只有代码块标记
                    if (completionText.trim() === '```' || completionText.trim() === '``' || completionText.trim().length <= 3) {
                        this.logger.debug(`流式响应提取内容过短或只有代码块标记，尝试备用方法`);
                        completionText = '';
                    }
                }
                catch (error) {
                    this.logger.error(`处理流式响应时出错: ${error.message}`);
                    completionText = '';
                }
            }
            // 如果流式处理失败，尝试使用正则表达式提取所有响应
            if (!completionText || completionText.trim().length <= 5) {
                this.logger.debug(`尝试使用正则表达式提取所有响应`);
                try {
                    // 提取所有response值
                    let allResponses = '';
                    const regex = /"response":[ ]*"([^"]*)"/g;
                    let match;
                    while ((match = regex.exec(responseText)) !== null) {
                        if (match[1]) {
                            // 处理转义字符
                            const responseValue = match[1].replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
                            allResponses += responseValue;
                        }
                    }
                    if (allResponses.length > 0) {
                        this.logger.debug(`正则提取成功，提取长度: ${allResponses.length}`);
                        completionText = allResponses;
                    }
                }
                catch (error) {
                    this.logger.debug(`正则提取失败: ${error.message}`);
                }
            }
            // 如果提取内容还是为空，尝试直接从响应文本中提取
            if (!completionText || completionText.trim().length === 0) {
                // 如果无法从流中提取内容，尝试清理和修复JSON响应
                this.logger.debug('尝试直接从响应文本提取内容');
                const directExtract = this.extractCompletionDirectly(responseText);
                if (directExtract) {
                    completionText = directExtract;
                    this.logger.debug(`直接提取到内容，长度: ${completionText.length}`);
                }
                else {
                    // 尝试使用cleanJsonResponse方法
                    try {
                        const cleanedJson = this.cleanJsonResponse(responseText);
                        const jsonObj = JSON.parse(cleanedJson);
                        if (jsonObj.response) {
                            completionText = jsonObj.response;
                            this.logger.debug(`从清理后的JSON中提取到response，长度: ${completionText.length}`);
                        }
                        else {
                            // 如果没有response字段，尝试提取任何内容
                            completionText = this.extractAnyContent(responseText);
                            this.logger.debug(`尝试提取任何内容，结果长度: ${completionText ? completionText.length : 0}`);
                        }
                    }
                    catch (error) {
                        this.logger.error(`清理JSON响应后解析失败: ${error.message}`);
                        // 最后尝试直接提取任何内容
                        completionText = this.extractAnyContent(responseText);
                        this.logger.debug(`最后尝试提取任何内容，结果长度: ${completionText ? completionText.length : 0}`);
                    }
                }
            }
            // 对补全结果进行后处理
            this.logger.debug(`对补全结果进行后处理`);
            // 去除Markdown代码块标记
            if (completionText.startsWith('```')) {
                const firstLineBreak = completionText.indexOf('\n');
                if (firstLineBreak !== -1) {
                    // 移除开头的```python或```等标记
                    const codeBlockHeader = completionText.substring(0, firstLineBreak);
                    this.logger.debug(`移除了前缀: "${codeBlockHeader}"`);
                    completionText = completionText.substring(firstLineBreak + 1);
                }
                else {
                    this.logger.debug(`移除了前缀: "${completionText}"`);
                    completionText = '';
                }
                // 移除结尾的```
                const lastCodeBlockEnd = completionText.lastIndexOf('```');
                if (lastCodeBlockEnd !== -1) {
                    completionText = completionText.substring(0, lastCodeBlockEnd).trim();
                    this.logger.debug(`移除了结尾的代码块标记"\`\`\`"`);
                }
            }
            // 后处理完成的补全文本
            const processedCompletion = this.postProcessCompletion(completionText, context);
            // 记录最终的补全结果
            if (processedCompletion) {
                this.logger.debug(`最终补全结果长度: ${processedCompletion.length}`);
                this.logger.debug(`最终补全结果前100字符: ${processedCompletion.substring(0, 100)}${processedCompletion.length > 100 ? '...' : ''}`);
            }
            else {
                this.logger.debug(`没有有效的补全结果`);
            }
            return processedCompletion;
        }
        catch (error) {
            this.logger.error(`获取补全时出错: ${error.message}`, error);
            return null;
        }
    }
    /**
     * 清理JSON响应中的格式问题
     */
    cleanJsonResponse(text) {
        this.logger.debug(`尝试修复JSON，原始长度: ${text.length}`);
        // 如果响应为空，返回最小有效JSON
        if (!text || text.trim() === '') {
            return '{"response": ""}';
        }
        // 移除可能导致解析错误的BOM标记
        let cleaned = text.replace(/^\uFEFF/, '');
        // 移除开头和结尾的非JSON字符
        cleaned = cleaned.trim();
        // 检查是否有多行响应（Ollama有时会返回多个JSON对象）
        const lines = cleaned.split('\n');
        if (lines.length > 1) {
            this.logger.debug(`检测到多行响应，行数: ${lines.length}`);
            // 尝试解析第一行 - 如果是完整JSON，直接使用
            const firstLine = lines[0].trim();
            if (firstLine.startsWith('{') && firstLine.endsWith('}')) {
                try {
                    JSON.parse(firstLine); // 测试是否为有效JSON
                    this.logger.debug('第一行是有效JSON，直接使用');
                    return firstLine;
                }
                catch (e) {
                    this.logger.debug('第一行不是有效JSON，继续尝试其他方法');
                }
            }
            // 尝试组合前几行形成完整JSON
            let combinedJson = '';
            let openBraces = 0;
            let validJson = false;
            for (let i = 0; i < Math.min(lines.length, 5); i++) { // 最多尝试前5行
                combinedJson += lines[i];
                openBraces += (lines[i].match(/{/g) || []).length;
                openBraces -= (lines[i].match(/}/g) || []).length;
                if (openBraces === 0 && combinedJson.trim().startsWith('{') && combinedJson.trim().endsWith('}')) {
                    try {
                        JSON.parse(combinedJson);
                        validJson = true;
                        this.logger.debug(`组合了${i + 1}行形成有效JSON`);
                        break;
                    }
                    catch (e) {
                        // 继续尝试添加更多行
                    }
                }
            }
            if (validJson) {
                return combinedJson;
            }
        }
        // 如果响应包含多个JSON对象，只保留第一个完整的JSON对象
        const firstObjEnd = cleaned.indexOf('}{');
        if (firstObjEnd > 0) {
            this.logger.debug('检测到多个JSON对象，截取第一个');
            cleaned = cleaned.substring(0, firstObjEnd + 1);
        }
        // 处理可能的流对象
        if (cleaned.includes('"done":') && !cleaned.includes('"response":')) {
            const matches = cleaned.match(/"content":"([^"]*)"/g);
            if (matches && matches.length > 0) {
                this.logger.debug('检测到流式响应，合并内容');
                let content = '';
                // 提取所有内容并合并
                for (const match of matches) {
                    const contentMatch = match.match(/"content":"([^"]*)"/);
                    if (contentMatch && contentMatch[1]) {
                        content += contentMatch[1];
                    }
                }
                // 创建有效的response对象
                return `{"response": "${content.replace(/"/g, '\\"')}"}`;
            }
        }
        // 尝试修复括号不匹配的问题
        const openBracesCount = (cleaned.match(/{/g) || []).length;
        const closeBracesCount = (cleaned.match(/}/g) || []).length;
        if (openBracesCount > closeBracesCount) {
            // 添加缺失的结束括号
            this.logger.debug(`添加 ${openBracesCount - closeBracesCount} 个缺失的结束括号`);
            cleaned = cleaned + '}}'.repeat(openBracesCount - closeBracesCount);
        }
        else if (closeBracesCount > openBracesCount) {
            // 移除多余的结束括号
            this.logger.debug(`移除 ${closeBracesCount - openBracesCount} 个多余的结束括号`);
            const lastValidIndex = cleaned.length;
            for (let i = 0; i < closeBracesCount - openBracesCount; i++) {
                const lastBraceIndex = cleaned.lastIndexOf('}', lastValidIndex - 1);
                if (lastBraceIndex !== -1) {
                    cleaned = cleaned.substring(0, lastBraceIndex) + cleaned.substring(lastBraceIndex + 1);
                }
            }
        }
        // 确保是一个有效的JSON对象
        if (!cleaned.startsWith('{')) {
            this.logger.debug('添加开始大括号');
            const firstBrace = cleaned.indexOf('{');
            if (firstBrace >= 0) {
                cleaned = cleaned.substring(firstBrace);
            }
            else {
                cleaned = '{' + cleaned;
            }
        }
        if (!cleaned.endsWith('}')) {
            this.logger.debug('添加结束大括号');
            const lastBrace = cleaned.lastIndexOf('}');
            if (lastBrace >= 0) {
                cleaned = cleaned.substring(0, lastBrace + 1);
            }
            else {
                cleaned = cleaned + '}';
            }
        }
        // 提取有效的JSON部分
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            this.logger.debug(`提取JSON部分: ${jsonStart}-${jsonEnd}`);
            cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
        }
        // 检查是否有未转义的特殊字符
        cleaned = cleaned
            .replace(/[\u0000-\u001F]+/g, ' ') // 替换控制字符
            .replace(/([^\\])"/g, '$1\\"') // 转义未转义的引号
            .replace(/^([^{]*)({.*)$/, '$2') // 移除前导非JSON文本
            .replace(/^{([^:]*):/, '{"response":'); // 尝试修复响应格式
        // 确保响应包含response字段
        if (!cleaned.includes('"response"')) {
            this.logger.debug('添加缺失的response字段');
            // 尝试提取任何文本作为响应
            const textMatch = cleaned.match(/"([^"]{5,})"/);
            if (textMatch && textMatch[1]) {
                cleaned = `{"response": "${textMatch[1].replace(/"/g, '\\"')}"}`;
            }
            else {
                // 如果找不到合适的文本，返回空响应
                cleaned = '{"response": ""}';
            }
        }
        this.logger.debug(`修复后的JSON: ${cleaned.substring(0, Math.min(100, cleaned.length))}...`);
        return cleaned;
    }
    /**
     * 构建提示词
     */
    buildPrompt(context) {
        // 更精确地获取语言类型
        const language = context.fileType || context.language || 'javascript';
        this.logger.debug(`为语言 ${language} 构建提示词模板`);
        let template = '';
        // 检测上下文中是否有中文内容
        const hasChineseContent = context.textBeforeCursor &&
            /[\u4e00-\u9fa5]/.test(context.textBeforeCursor);
        if (hasChineseContent) {
            this.logger.debug('检测到中文内容，调整提示词');
        }
        // 添加提示词前缀，根据语言类型直接生成
        if (context.commentMode || context.isInComment) {
            // 注释模式的提示词
            template += hasChineseContent
                ? `你是一位专业的${language}程序员。根据上下文继续完成以下文档注释。只需完成注释内容，不要编写任何代码。不要返回JSON格式或obj['complete_code']这样的结构，直接返回纯文本注释。只关注光标位置的注释，不要生成整个文件的注释。请使用中文回复：\n\n`
                : `You are an expert ${language} programmer. Continue the following documentation comment based on the context. Only complete the comment, don't write any code. Do NOT return JSON format or structures like obj['complete_code']. ONLY output plain text comment. Focus ONLY on the comment at the cursor position, do not generate documentation for the entire file:\n\n`;
        }
        else {
            // 普通代码补全的提示词
            template += hasChineseContent
                ? `你是一位专业的${language}程序员。请根据上下文完成光标处的${language}代码。直接输出代码，不要添加任何解释、Markdown格式或JSON结构。不要返回obj['complete_code']这样的结构，只输出纯代码。只关注光标位置的代码补全，可以是一个函数、一个类或几行代码，但不要生成整个文件的内容。你的输出应该是可以直接在光标处插入的有效${language}代码：\n\n`
                : `You are an expert ${language} programmer. Complete the ${language} code at the cursor position based on the context. Output ONLY valid ${language} code without any explanation, markdown formatting, or JSON structures. Do NOT wrap the code in obj['complete_code'] or any similar structure. Focus ONLY on completing the code at the cursor position - this could be a function, class, or a few lines of code, but do NOT regenerate the entire file. Output should be ONLY plain code that can be directly inserted at the cursor position:\n\n`;
        }
        // 添加文档内容作为上下文
        if (context.documentText && context.documentText.length > 0) {
            // 只添加一部分文档避免过长
            const maxContextLength = 2000;
            const relevantContext = context.documentText.length > maxContextLength
                ? context.documentText.substring(context.documentText.length - maxContextLength)
                : context.documentText;
            template += `# Current file content (for context):\n${relevantContext}\n\n`;
        }
        // 添加光标前的文本
        if (context.textBeforeCursor) {
            template += `# Code before cursor:\n${context.textBeforeCursor}\n`;
        }
        // 如果有之前的补全结果，在连续补全模式中使用
        if (context.previousCompletion) {
            this.logger.debug('包含之前的补全结果');
            template += `\n# Previously completed part:\n${context.previousCompletion}\n`;
        }
        // 如果有相关的缓存代码，包含作为额外上下文
        if (context.relevantCachedCode && context.relevantCachedCode.length > 0) {
            this.logger.debug('包含相关的缓存代码');
            template += `\n\n# Similar code for reference (don't repeat this):\n${context.relevantCachedCode}\n`;
        }
        // 添加明确的完成指令
        template += `\n# Complete ONLY the code at cursor position (${language} code only):\n`;
        return template;
    }
    /**
     * 对补全结果进行后处理，确保与文件类型匹配
     */
    postProcessCompletion(completionText, context) {
        if (!completionText) {
            return '';
        }
        const fileType = context.fileType || 'javascript';
        this.logger.debug(`对补全结果进行后处理`);
        // 检查并清理JSON或对象包装的代码
        completionText = this.cleanJsonWrappedCode(completionText);
        // 检查内容中是否存在明显的不匹配代码标记
        if (fileType === 'python') {
            // 检查Python文件中是否包含JavaScript代码特征
            const jsFeatures = /function\s+|var\s+|let\s+|const\s+|===|!==|this\.|prototype\.|=>|};/g;
            if (jsFeatures.test(completionText)) {
                this.logger.debug(`检测到Python文件中返回了疑似JavaScript代码，尝试修复`);
                // 简单转换尝试 - 实际效果可能有限
                completionText = completionText
                    .replace(/function\s+([a-zA-Z0-9_]+)\s*\(/g, 'def $1(') // function转def
                    .replace(/var\s+|let\s+|const\s+/g, '') // 移除变量声明
                    .replace(/this\./g, 'self.') // this替换为self
                    .replace(/===|==/g, '==') // 严格等于转换
                    .replace(/!==|!=/g, '!=') // 严格不等于转换
                    .replace(/;/g, '') // 移除分号
                    .replace(/true/g, 'True') // 布尔值转换
                    .replace(/false/g, 'False')
                    .replace(/null/g, 'None');
            }
        }
        else if (fileType === 'javascript' || fileType === 'typescript') {
            // 检查JS/TS文件中是否包含Python代码特征
            const pyFeatures = /def\s+|elif\s+|self\.|:\s*$/m;
            if (pyFeatures.test(completionText)) {
                this.logger.debug(`检测到${fileType}文件中返回了疑似Python代码，尝试修复`);
                // 简单转换尝试
                completionText = completionText
                    .replace(/def\s+([a-zA-Z0-9_]+)\s*\(/g, 'function $1(') // def转function
                    .replace(/elif\s+/g, 'else if (') // elif转else if
                    .replace(/self\./g, 'this.') // self替换为this
                    .replace(/True/g, 'true') // 布尔值转换
                    .replace(/False/g, 'false')
                    .replace(/None/g, 'null');
                // 处理Python的冒号结构转JS的大括号结构(简单情况)
                const lines = completionText.split('\n');
                const processedLines = [];
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.trim().endsWith(':')) {
                        line = line.replace(/:$/, ' {');
                    }
                    processedLines.push(line);
                }
                completionText = processedLines.join('\n');
            }
        }
        return completionText;
    }
    /**
     * 清理JSON或对象包装的代码
     * 处理如obj['complete_code']格式的输出
     */
    cleanJsonWrappedCode(text) {
        try {
            // 尝试删除JSON包装
            const trimmedText = text.trim();
            // 检查是否是常见的JSON包装模式
            if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
                try {
                    // 尝试解析为JSON
                    const jsonObj = JSON.parse(trimmedText);
                    // 如果解析成功，检查是否有代码相关字段
                    for (const key of ['code', 'complete_code', 'completion', 'content', 'result']) {
                        if (jsonObj[key] && typeof jsonObj[key] === 'string') {
                            this.logger.debug(`检测到JSON包装的代码，提取字段: ${key}`);
                            return jsonObj[key];
                        }
                    }
                }
                catch (e) {
                    // JSON解析失败，继续检查其他模式
                }
            }
            // 检查常见的JavaScript对象访问模式
            const objAccessPattern = /^\s*(?:let|const|var)?\s*(?:obj|result|response|output|completion)\s*(?:\[\s*['"](\w+)['"]\s*\]|\.(\w+))\s*(?:=\s*)?['"](.+)['"]\s*;?\s*$/s;
            const multilineObjPattern = /^\s*(?:let|const|var)?\s*(?:obj|result|response|output|completion)\s*(?:\[\s*['"](\w+)['"]\s*\]|\.(\w+))\s*(?:=\s*)?['"](.+)['"]$/s;
            let objMatch = text.match(objAccessPattern) || text.match(multilineObjPattern);
            if (objMatch && objMatch[3]) {
                this.logger.debug(`检测到对象访问模式的代码包装，提取内容`);
                // 使用第三个捕获组（实际内容）
                return objMatch[3].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
            // 检查特定模式 obj['complete_code'] = "..."
            const specificPatternRegex = /obj\s*\[\s*['"]complete_code['"]\s*\]\s*=?\s*['"]([\s\S]*?)['"]/;
            const specificMatch = text.match(specificPatternRegex);
            if (specificMatch && specificMatch[1]) {
                this.logger.debug(`检测到特定的obj['complete_code']模式，提取内容`);
                return specificMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
        }
        catch (error) {
            this.logger.debug(`清理JSON包装代码时出错: ${error instanceof Error ? error.message : '未知错误'}`);
        }
        // 如果没有检测到特殊模式或处理失败，返回原始文本
        return text;
    }
    /**
     * 检测当前是否在多行注释中
     */
    isInMultilineComment(text, language) {
        if (['javascript', 'typescript', 'java', 'c', 'cpp', 'csharp'].includes(language)) {
            // 检查是否有未闭合的多行注释
            const openComments = (text.match(/\/\*/g) || []).length;
            const closeComments = (text.match(/\*\//g) || []).length;
            return openComments > closeComments;
        }
        if (language === 'python') {
            // 检查是否有未闭合的三引号
            const openTripleQuotes = (text.match(/'''/g) || []).length;
            const openTripleDoubleQuotes = (text.match(/"""/g) || []).length;
            // 如果三引号数量为奇数，则在多行注释中
            return (openTripleQuotes % 2 !== 0) || (openTripleDoubleQuotes % 2 !== 0);
        }
        return false;
    }
    /**
     * 测试与Ollama服务的连接
     */
    async testConnection() {
        this.logger.info(`测试与 Ollama 服务的连接: ${this.configManager.getApiUrl()}`);
        try {
            const apiUrl = this.configManager.getApiUrl();
            // 添加详细诊断
            this.logger.debug(`系统信息: Node版本: ${process.version}, 平台: ${process.platform}`);
            this.logger.debug(`当前工作目录: ${process.cwd()}`);
            this.logger.debug(`API URL: ${apiUrl}, 测试端点: ${apiUrl}/api/tags`);
            this.logger.debug(`开始fetch请求 ${apiUrl}/api/tags`);
            // 尝试获取模型列表
            const response = await fetch(`${apiUrl}/api/tags`);
            this.logger.debug(`收到响应: 状态码=${response.status}, 状态=${response.statusText}`);
            if (response.ok) {
                const responseText = await response.text();
                this.logger.debug(`响应内容: ${responseText}`);
                let data;
                try {
                    data = JSON.parse(responseText);
                }
                catch (jsonError) {
                    this.logger.error(`解析JSON响应时出错: ${jsonError}`);
                    return {
                        success: false,
                        message: `收到无效的JSON响应: ${responseText.substring(0, 100)}...`
                    };
                }
                if (data.models) {
                    const models = data.models.map((model) => model.name);
                    this.logger.info(`成功连接到 Ollama 服务，发现 ${models.length} 个模型: ${models.join(', ')}`);
                    return {
                        success: true,
                        message: '成功连接到Ollama服务',
                        models
                    };
                }
                else {
                    this.logger.warn(`响应缺少models字段: ${JSON.stringify(data)}`);
                }
            }
            else {
                this.logger.warn(`Ollama API响应状态不成功: ${response.status} ${response.statusText}`);
            }
            this.logger.warn('已连接到 Ollama 服务，但无法获取模型列表');
            return {
                success: true,
                message: '已连接到Ollama服务，但无法获取模型列表',
                models: []
            };
        }
        catch (error) {
            this.logger.error(`测试Ollama连接时出错: ${error instanceof Error ? error.message : String(error)}`);
            this.logger.error(`错误堆栈: ${error instanceof Error ? error.stack : '无堆栈'}`);
            let errorMessage = '无法连接到Ollama服务';
            if (error instanceof Error) {
                const networkError = error;
                if (networkError.code === 'ECONNREFUSED') {
                    errorMessage = 'Ollama服务未运行或无法访问';
                }
                else if ('response' in error) {
                    const responseError = error;
                    errorMessage = `服务响应错误: ${responseError.response?.status} ${responseError.response?.statusText}`;
                }
            }
            return {
                success: false,
                message: errorMessage
            };
        }
    }
    /**
     * 直接从响应文本中提取补全内容，不依赖JSON解析
     */
    extractCompletionDirectly(text) {
        // 如果不是JSON格式，直接返回文本
        if (!text.includes('{') && !text.includes('}')) {
            return text.trim();
        }
        // 尝试找出JSON之外的内容
        const parts = text.split('}');
        if (parts.length > 1) {
            // 检查最后一部分是否包含非JSON文本
            const lastPart = parts[parts.length - 1].trim();
            if (lastPart.length > 0 && !lastPart.includes('{')) {
                return lastPart;
            }
        }
        // 尝试匹配可能的补全内容
        const contentPatterns = [
            /"response"\s*:\s*"((?:\\"|[^"])*?)"/,
            /"content"\s*:\s*"((?:\\"|[^"])*?)"/,
            /"completion"\s*:\s*"((?:\\"|[^"])*?)"/ // 可能的completion字段
        ];
        for (const pattern of contentPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
            }
        }
        return null;
    }
    /**
     * 从任何响应中提取可能的有用内容
     */
    extractAnyContent(text) {
        // 1. 移除任何可能的JSON语法
        let content = text.replace(/[{}\[\]"]/g, ' ');
        // 2. 找到第一个冒号后的内容
        const colonIndex = content.indexOf(':');
        if (colonIndex > 0) {
            content = content.substring(colonIndex + 1);
        }
        // 3. 清理并规范化文本
        content = content
            .replace(/\\n/g, '\n') // 处理换行符
            .replace(/\s+/g, ' ') // 压缩空白字符
            .trim(); // 修剪两端空白
        // 4. 如果内容很短，可能是错误信息，返回空字符串
        if (content.length < 5) {
            return '';
        }
        return content;
    }
    /**
     * 生成代码补全
     * @param prompt 提示词
     * @param options 选项
     * @param signal 中止信号
     * @returns 补全结果文本
     */
    async generateCompletion(prompt, options, signal) {
        try {
            const apiUrl = this.configManager.getApiUrl();
            const modelName = options.model || this.configManager.getModelName();
            const temperature = options.temperature !== undefined ? options.temperature : this.configManager.getTemperature();
            const maxTokens = options.maxTokens || this.configManager.getMaxTokens();
            this.logger.debug(`生成补全: API URL=${apiUrl}, 模型=${modelName}, 温度=${temperature}, 最大令牌数=${maxTokens}`);
            // 记录提示词（仅在调试模式下记录完整提示词）
            if (this.configManager.isDebugEnabled()) {
                this.logger.debug(`完整提示词:\n${prompt}`);
            }
            else {
                // 仅记录提示词的前100个字符
                this.logger.debug(`提示词前100个字符: ${prompt.substring(0, 100)}...`);
            }
            // 构建请求数据
            const requestData = {
                model: modelName,
                prompt: prompt,
                temperature: temperature,
                max_tokens: maxTokens,
                options: {
                    num_predict: maxTokens
                }
            };
            // 请求信息日志
            this.logger.debug(`发送请求到Ollama API: ${apiUrl}/api/generate`);
            this.logger.debug(`请求体大小: ${JSON.stringify(requestData).length} 字符`);
            // 创建请求选项
            const fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData),
                signal: signal
            };
            // 发送请求
            this.logger.debug('开始发送fetch请求...');
            const response = await fetch(`${apiUrl}/api/generate`, fetchOptions);
            // 检查是否被中止
            if (signal?.aborted) {
                this.logger.debug('请求被中止');
                return null;
            }
            // 记录响应状态
            this.logger.debug(`Ollama API响应状态: ${response.status} ${response.statusText}`);
            // 检查响应状态
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
                throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
            }
            // 获取响应文本
            const responseText = await response.text();
            this.logger.debug(`获取到响应文本，长度: ${responseText.length}`);
            // 处理流式JSON响应
            let completionText = '';
            // 拆分响应并收集所有的response字段内容
            if (responseText.includes('"response"')) {
                try {
                    this.logger.debug('检测到response字段，解析流式JSON响应');
                    // 按行拆分响应
                    const lines = responseText.split('\n').filter(line => line.trim() !== '');
                    this.logger.debug(`响应行数: ${lines.length}`);
                    // 从每行提取response字段内容并合并
                    let processedLines = 0;
                    for (const line of lines) {
                        try {
                            const jsonObj = JSON.parse(line);
                            if (jsonObj && jsonObj.response) {
                                completionText += jsonObj.response;
                                processedLines++;
                            }
                        }
                        catch (parseError) {
                            this.logger.debug(`解析响应行时出错: ${parseError.message}`);
                        }
                    }
                    this.logger.debug(`成功处理的响应行: ${processedLines}/${lines.length}`);
                    this.logger.debug(`从流式响应中提取的完整内容长度: ${completionText.length}`);
                }
                catch (error) {
                    this.logger.error(`处理流式响应时出错: ${error.message}`);
                    completionText = '';
                }
            }
            else {
                this.logger.debug('未检测到response字段，尝试其他方法解析响应');
            }
            // 如果流式处理失败，尝试使用正则表达式提取所有响应
            if (!completionText || completionText.trim().length === 0) {
                this.logger.debug(`尝试使用正则表达式提取所有响应`);
                try {
                    // 提取所有response值
                    let allResponses = '';
                    const regex = /"response":[ ]*"([^"]*)"/g;
                    let match;
                    let matchCount = 0;
                    while ((match = regex.exec(responseText)) !== null) {
                        if (match[1]) {
                            // 处理转义字符
                            const responseValue = match[1].replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
                            allResponses += responseValue;
                            matchCount++;
                        }
                    }
                    if (allResponses.length > 0) {
                        this.logger.debug(`正则提取成功，找到${matchCount}个匹配，提取长度: ${allResponses.length}`);
                        completionText = allResponses;
                    }
                    else {
                        this.logger.debug('正则表达式没有找到匹配');
                    }
                }
                catch (error) {
                    this.logger.debug(`正则提取失败: ${error.message}`);
                }
            }
            // 如果提取内容还是为空，尝试直接从响应文本中提取
            if (!completionText || completionText.trim().length === 0) {
                // 尝试直接提取
                this.logger.debug('尝试直接从响应文本中提取内容');
                const directExtract = this.extractCompletionDirectly(responseText);
                if (directExtract) {
                    completionText = directExtract;
                    this.logger.debug(`直接提取成功，提取长度: ${completionText.length}`);
                }
                else {
                    this.logger.debug('直接提取失败');
                }
            }
            // 去除Markdown代码块标记
            if (completionText.startsWith('```')) {
                const firstLineBreak = completionText.indexOf('\n');
                if (firstLineBreak !== -1) {
                    // 移除开头的```python或```等标记
                    completionText = completionText.substring(firstLineBreak + 1);
                }
                else {
                    completionText = '';
                }
                // 移除结尾的```
                const lastCodeBlockEnd = completionText.lastIndexOf('```');
                if (lastCodeBlockEnd !== -1) {
                    completionText = completionText.substring(0, lastCodeBlockEnd).trim();
                }
                this.logger.debug('已移除Markdown代码块标记');
            }
            // 记录最终的补全结果
            if (completionText) {
                this.logger.debug(`最终补全结果长度: ${completionText.length}`);
                if (this.configManager.isDebugEnabled()) {
                    this.logger.debug(`最终补全结果前200字符: ${completionText.substring(0, 200)}${completionText.length > 200 ? '...' : ''}`);
                }
            }
            else {
                this.logger.debug(`没有有效的补全结果`);
            }
            return completionText;
        }
        catch (error) {
            // 检查是否被中止
            if (signal?.aborted) {
                this.logger.debug('请求被中止');
                return null;
            }
            this.logger.error(`生成补全时出错: ${error.message}`, error);
            throw error;
        }
    }
}
exports.OllamaClient = OllamaClient;


/***/ }),
/* 4 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Logger = exports.LogLevel = void 0;
const vscode = __importStar(__webpack_require__(1));
/**
 * 日志级别枚举
 * 按照标准日志级别从低到高排序：DEBUG < INFO < WARN < ERROR
 */
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["NONE"] = 0] = "NONE";
    LogLevel[LogLevel["DEBUG"] = 1] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["WARN"] = 3] = "WARN";
    LogLevel[LogLevel["ERROR"] = 4] = "ERROR"; // 错误信息
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
/**
 * 日志管理器
 * 负责记录和管理日志，支持输出到文件和控制台
 */
class Logger {
    constructor() {
        this.logLevel = LogLevel.NONE;
        this.debugEnabled = false;
        this.outputChannel = vscode.window.createOutputChannel('TabAutoComplete');
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    setLogLevel(level) {
        this.logLevel = level;
        this.log(LogLevel.INFO, `日志级别已设置为: ${LogLevel[level]}`);
    }
    shouldLog(level) {
        if (level === LogLevel.DEBUG && this.debugEnabled) {
            return true;
        }
        return this.logLevel !== LogLevel.NONE && level <= this.logLevel;
    }
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level].padEnd(5);
        let formattedMessage = `[${timestamp}] [${levelStr}] ${message}`;
        if (data) {
            if (data instanceof Error) {
                formattedMessage += `\n    ${data.stack || data.message}`;
            }
            else if (typeof data === 'object') {
                try {
                    formattedMessage += `\n    ${JSON.stringify(data, null, 2)}`;
                }
                catch (e) {
                    formattedMessage += `\n    [无法序列化的对象]`;
                }
            }
            else {
                formattedMessage += `\n    ${data}`;
            }
        }
        return formattedMessage;
    }
    log(level, message, data) {
        if (level < this.logLevel) {
            return;
        }
        if (this.shouldLog(level)) {
            const formattedMessage = this.formatMessage(level, message, data);
            this.outputChannel.appendLine(formattedMessage);
            // 对于警告和错误，同时输出到控制台
            if (level === LogLevel.ERROR) {
                console.error(formattedMessage);
            }
            else if (level === LogLevel.WARN) {
                console.warn(formattedMessage);
            }
        }
    }
    debug(message, data) {
        this.log(LogLevel.DEBUG, message, data);
    }
    info(message, data) {
        this.log(LogLevel.INFO, message, data);
    }
    warn(message, data) {
        this.log(LogLevel.WARN, message, data);
        // 可选：显示警告通知
        if (this.shouldLog(LogLevel.WARN)) {
            vscode.window.showWarningMessage(message);
        }
    }
    error(message, error) {
        this.log(LogLevel.ERROR, message, error);
        // 始终显示错误通知
        vscode.window.showErrorMessage(message);
    }
    setDebugEnabled(enabled) {
        this.debugEnabled = enabled;
        this.log(LogLevel.INFO, `调试模式已${enabled ? '启用' : '禁用'}`);
    }
    showOutputChannel() {
        this.outputChannel.show();
    }
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.Logger = Logger;


/***/ }),
/* 5 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.version = exports.validate = exports.v7 = exports.v6ToV1 = exports.v6 = exports.v5 = exports.v4 = exports.v3 = exports.v1ToV6 = exports.v1 = exports.stringify = exports.parse = exports.NIL = exports.MAX = void 0;
var max_js_1 = __webpack_require__(6);
Object.defineProperty(exports, "MAX", ({ enumerable: true, get: function () { return max_js_1.default; } }));
var nil_js_1 = __webpack_require__(7);
Object.defineProperty(exports, "NIL", ({ enumerable: true, get: function () { return nil_js_1.default; } }));
var parse_js_1 = __webpack_require__(8);
Object.defineProperty(exports, "parse", ({ enumerable: true, get: function () { return parse_js_1.default; } }));
var stringify_js_1 = __webpack_require__(11);
Object.defineProperty(exports, "stringify", ({ enumerable: true, get: function () { return stringify_js_1.default; } }));
var v1_js_1 = __webpack_require__(12);
Object.defineProperty(exports, "v1", ({ enumerable: true, get: function () { return v1_js_1.default; } }));
var v1ToV6_js_1 = __webpack_require__(15);
Object.defineProperty(exports, "v1ToV6", ({ enumerable: true, get: function () { return v1ToV6_js_1.default; } }));
var v3_js_1 = __webpack_require__(16);
Object.defineProperty(exports, "v3", ({ enumerable: true, get: function () { return v3_js_1.default; } }));
var v4_js_1 = __webpack_require__(19);
Object.defineProperty(exports, "v4", ({ enumerable: true, get: function () { return v4_js_1.default; } }));
var v5_js_1 = __webpack_require__(21);
Object.defineProperty(exports, "v5", ({ enumerable: true, get: function () { return v5_js_1.default; } }));
var v6_js_1 = __webpack_require__(23);
Object.defineProperty(exports, "v6", ({ enumerable: true, get: function () { return v6_js_1.default; } }));
var v6ToV1_js_1 = __webpack_require__(24);
Object.defineProperty(exports, "v6ToV1", ({ enumerable: true, get: function () { return v6ToV1_js_1.default; } }));
var v7_js_1 = __webpack_require__(25);
Object.defineProperty(exports, "v7", ({ enumerable: true, get: function () { return v7_js_1.default; } }));
var validate_js_1 = __webpack_require__(9);
Object.defineProperty(exports, "validate", ({ enumerable: true, get: function () { return validate_js_1.default; } }));
var version_js_1 = __webpack_require__(26);
Object.defineProperty(exports, "version", ({ enumerable: true, get: function () { return version_js_1.default; } }));


/***/ }),
/* 6 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = 'ffffffff-ffff-ffff-ffff-ffffffffffff';


/***/ }),
/* 7 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = '00000000-0000-0000-0000-000000000000';


/***/ }),
/* 8 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const validate_js_1 = __webpack_require__(9);
function parse(uuid) {
    if (!(0, validate_js_1.default)(uuid)) {
        throw TypeError('Invalid UUID');
    }
    let v;
    return Uint8Array.of((v = parseInt(uuid.slice(0, 8), 16)) >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff, (v = parseInt(uuid.slice(9, 13), 16)) >>> 8, v & 0xff, (v = parseInt(uuid.slice(14, 18), 16)) >>> 8, v & 0xff, (v = parseInt(uuid.slice(19, 23), 16)) >>> 8, v & 0xff, ((v = parseInt(uuid.slice(24, 36), 16)) / 0x10000000000) & 0xff, (v / 0x100000000) & 0xff, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}
exports["default"] = parse;


/***/ }),
/* 9 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const regex_js_1 = __webpack_require__(10);
function validate(uuid) {
    return typeof uuid === 'string' && regex_js_1.default.test(uuid);
}
exports["default"] = validate;


/***/ }),
/* 10 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;


/***/ }),
/* 11 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.unsafeStringify = void 0;
const validate_js_1 = __webpack_require__(9);
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 0x100).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
    return (byteToHex[arr[offset + 0]] +
        byteToHex[arr[offset + 1]] +
        byteToHex[arr[offset + 2]] +
        byteToHex[arr[offset + 3]] +
        '-' +
        byteToHex[arr[offset + 4]] +
        byteToHex[arr[offset + 5]] +
        '-' +
        byteToHex[arr[offset + 6]] +
        byteToHex[arr[offset + 7]] +
        '-' +
        byteToHex[arr[offset + 8]] +
        byteToHex[arr[offset + 9]] +
        '-' +
        byteToHex[arr[offset + 10]] +
        byteToHex[arr[offset + 11]] +
        byteToHex[arr[offset + 12]] +
        byteToHex[arr[offset + 13]] +
        byteToHex[arr[offset + 14]] +
        byteToHex[arr[offset + 15]]).toLowerCase();
}
exports.unsafeStringify = unsafeStringify;
function stringify(arr, offset = 0) {
    const uuid = unsafeStringify(arr, offset);
    if (!(0, validate_js_1.default)(uuid)) {
        throw TypeError('Stringified UUID is invalid');
    }
    return uuid;
}
exports["default"] = stringify;


/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.updateV1State = void 0;
const rng_js_1 = __webpack_require__(13);
const stringify_js_1 = __webpack_require__(11);
const _state = {};
function v1(options, buf, offset) {
    let bytes;
    const isV6 = options?._v6 ?? false;
    if (options) {
        const optionsKeys = Object.keys(options);
        if (optionsKeys.length === 1 && optionsKeys[0] === '_v6') {
            options = undefined;
        }
    }
    if (options) {
        bytes = v1Bytes(options.random ?? options.rng?.() ?? (0, rng_js_1.default)(), options.msecs, options.nsecs, options.clockseq, options.node, buf, offset);
    }
    else {
        const now = Date.now();
        const rnds = (0, rng_js_1.default)();
        updateV1State(_state, now, rnds);
        bytes = v1Bytes(rnds, _state.msecs, _state.nsecs, isV6 ? undefined : _state.clockseq, isV6 ? undefined : _state.node, buf, offset);
    }
    return buf ?? (0, stringify_js_1.unsafeStringify)(bytes);
}
function updateV1State(state, now, rnds) {
    state.msecs ??= -Infinity;
    state.nsecs ??= 0;
    if (now === state.msecs) {
        state.nsecs++;
        if (state.nsecs >= 10000) {
            state.node = undefined;
            state.nsecs = 0;
        }
    }
    else if (now > state.msecs) {
        state.nsecs = 0;
    }
    else if (now < state.msecs) {
        state.node = undefined;
    }
    if (!state.node) {
        state.node = rnds.slice(10, 16);
        state.node[0] |= 0x01;
        state.clockseq = ((rnds[8] << 8) | rnds[9]) & 0x3fff;
    }
    state.msecs = now;
    return state;
}
exports.updateV1State = updateV1State;
function v1Bytes(rnds, msecs, nsecs, clockseq, node, buf, offset = 0) {
    if (rnds.length < 16) {
        throw new Error('Random bytes length must be >= 16');
    }
    if (!buf) {
        buf = new Uint8Array(16);
        offset = 0;
    }
    else {
        if (offset < 0 || offset + 16 > buf.length) {
            throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
    }
    msecs ??= Date.now();
    nsecs ??= 0;
    clockseq ??= ((rnds[8] << 8) | rnds[9]) & 0x3fff;
    node ??= rnds.slice(10, 16);
    msecs += 12219292800000;
    const tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
    buf[offset++] = (tl >>> 24) & 0xff;
    buf[offset++] = (tl >>> 16) & 0xff;
    buf[offset++] = (tl >>> 8) & 0xff;
    buf[offset++] = tl & 0xff;
    const tmh = ((msecs / 0x100000000) * 10000) & 0xfffffff;
    buf[offset++] = (tmh >>> 8) & 0xff;
    buf[offset++] = tmh & 0xff;
    buf[offset++] = ((tmh >>> 24) & 0xf) | 0x10;
    buf[offset++] = (tmh >>> 16) & 0xff;
    buf[offset++] = (clockseq >>> 8) | 0x80;
    buf[offset++] = clockseq & 0xff;
    for (let n = 0; n < 6; ++n) {
        buf[offset++] = node[n];
    }
    return buf;
}
exports["default"] = v1;


/***/ }),
/* 13 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const crypto_1 = __webpack_require__(14);
const rnds8Pool = new Uint8Array(256);
let poolPtr = rnds8Pool.length;
function rng() {
    if (poolPtr > rnds8Pool.length - 16) {
        (0, crypto_1.randomFillSync)(rnds8Pool);
        poolPtr = 0;
    }
    return rnds8Pool.slice(poolPtr, (poolPtr += 16));
}
exports["default"] = rng;


/***/ }),
/* 14 */
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),
/* 15 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const parse_js_1 = __webpack_require__(8);
const stringify_js_1 = __webpack_require__(11);
function v1ToV6(uuid) {
    const v1Bytes = typeof uuid === 'string' ? (0, parse_js_1.default)(uuid) : uuid;
    const v6Bytes = _v1ToV6(v1Bytes);
    return typeof uuid === 'string' ? (0, stringify_js_1.unsafeStringify)(v6Bytes) : v6Bytes;
}
exports["default"] = v1ToV6;
function _v1ToV6(v1Bytes) {
    return Uint8Array.of(((v1Bytes[6] & 0x0f) << 4) | ((v1Bytes[7] >> 4) & 0x0f), ((v1Bytes[7] & 0x0f) << 4) | ((v1Bytes[4] & 0xf0) >> 4), ((v1Bytes[4] & 0x0f) << 4) | ((v1Bytes[5] & 0xf0) >> 4), ((v1Bytes[5] & 0x0f) << 4) | ((v1Bytes[0] & 0xf0) >> 4), ((v1Bytes[0] & 0x0f) << 4) | ((v1Bytes[1] & 0xf0) >> 4), ((v1Bytes[1] & 0x0f) << 4) | ((v1Bytes[2] & 0xf0) >> 4), 0x60 | (v1Bytes[2] & 0x0f), v1Bytes[3], v1Bytes[8], v1Bytes[9], v1Bytes[10], v1Bytes[11], v1Bytes[12], v1Bytes[13], v1Bytes[14], v1Bytes[15]);
}


/***/ }),
/* 16 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.URL = exports.DNS = void 0;
const md5_js_1 = __webpack_require__(17);
const v35_js_1 = __webpack_require__(18);
var v35_js_2 = __webpack_require__(18);
Object.defineProperty(exports, "DNS", ({ enumerable: true, get: function () { return v35_js_2.DNS; } }));
Object.defineProperty(exports, "URL", ({ enumerable: true, get: function () { return v35_js_2.URL; } }));
function v3(value, namespace, buf, offset) {
    return (0, v35_js_1.default)(0x30, md5_js_1.default, value, namespace, buf, offset);
}
v3.DNS = v35_js_1.DNS;
v3.URL = v35_js_1.URL;
exports["default"] = v3;


/***/ }),
/* 17 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const crypto_1 = __webpack_require__(14);
function md5(bytes) {
    if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
    }
    else if (typeof bytes === 'string') {
        bytes = Buffer.from(bytes, 'utf8');
    }
    return (0, crypto_1.createHash)('md5').update(bytes).digest();
}
exports["default"] = md5;


/***/ }),
/* 18 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.URL = exports.DNS = exports.stringToBytes = void 0;
const parse_js_1 = __webpack_require__(8);
const stringify_js_1 = __webpack_require__(11);
function stringToBytes(str) {
    str = unescape(encodeURIComponent(str));
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; ++i) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes;
}
exports.stringToBytes = stringToBytes;
exports.DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
exports.URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
function v35(version, hash, value, namespace, buf, offset) {
    const valueBytes = typeof value === 'string' ? stringToBytes(value) : value;
    const namespaceBytes = typeof namespace === 'string' ? (0, parse_js_1.default)(namespace) : namespace;
    if (typeof namespace === 'string') {
        namespace = (0, parse_js_1.default)(namespace);
    }
    if (namespace?.length !== 16) {
        throw TypeError('Namespace must be array-like (16 iterable integer values, 0-255)');
    }
    let bytes = new Uint8Array(16 + valueBytes.length);
    bytes.set(namespaceBytes);
    bytes.set(valueBytes, namespaceBytes.length);
    bytes = hash(bytes);
    bytes[6] = (bytes[6] & 0x0f) | version;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    if (buf) {
        offset = offset || 0;
        for (let i = 0; i < 16; ++i) {
            buf[offset + i] = bytes[i];
        }
        return buf;
    }
    return (0, stringify_js_1.unsafeStringify)(bytes);
}
exports["default"] = v35;


/***/ }),
/* 19 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const native_js_1 = __webpack_require__(20);
const rng_js_1 = __webpack_require__(13);
const stringify_js_1 = __webpack_require__(11);
function v4(options, buf, offset) {
    if (native_js_1.default.randomUUID && !buf && !options) {
        return native_js_1.default.randomUUID();
    }
    options = options || {};
    const rnds = options.random ?? options.rng?.() ?? (0, rng_js_1.default)();
    if (rnds.length < 16) {
        throw new Error('Random bytes length must be >= 16');
    }
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;
    if (buf) {
        offset = offset || 0;
        if (offset < 0 || offset + 16 > buf.length) {
            throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
        for (let i = 0; i < 16; ++i) {
            buf[offset + i] = rnds[i];
        }
        return buf;
    }
    return (0, stringify_js_1.unsafeStringify)(rnds);
}
exports["default"] = v4;


/***/ }),
/* 20 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const crypto_1 = __webpack_require__(14);
exports["default"] = { randomUUID: crypto_1.randomUUID };


/***/ }),
/* 21 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.URL = exports.DNS = void 0;
const sha1_js_1 = __webpack_require__(22);
const v35_js_1 = __webpack_require__(18);
var v35_js_2 = __webpack_require__(18);
Object.defineProperty(exports, "DNS", ({ enumerable: true, get: function () { return v35_js_2.DNS; } }));
Object.defineProperty(exports, "URL", ({ enumerable: true, get: function () { return v35_js_2.URL; } }));
function v5(value, namespace, buf, offset) {
    return (0, v35_js_1.default)(0x50, sha1_js_1.default, value, namespace, buf, offset);
}
v5.DNS = v35_js_1.DNS;
v5.URL = v35_js_1.URL;
exports["default"] = v5;


/***/ }),
/* 22 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const crypto_1 = __webpack_require__(14);
function sha1(bytes) {
    if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
    }
    else if (typeof bytes === 'string') {
        bytes = Buffer.from(bytes, 'utf8');
    }
    return (0, crypto_1.createHash)('sha1').update(bytes).digest();
}
exports["default"] = sha1;


/***/ }),
/* 23 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const stringify_js_1 = __webpack_require__(11);
const v1_js_1 = __webpack_require__(12);
const v1ToV6_js_1 = __webpack_require__(15);
function v6(options, buf, offset) {
    options ??= {};
    offset ??= 0;
    let bytes = (0, v1_js_1.default)({ ...options, _v6: true }, new Uint8Array(16));
    bytes = (0, v1ToV6_js_1.default)(bytes);
    if (buf) {
        for (let i = 0; i < 16; i++) {
            buf[offset + i] = bytes[i];
        }
        return buf;
    }
    return (0, stringify_js_1.unsafeStringify)(bytes);
}
exports["default"] = v6;


/***/ }),
/* 24 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const parse_js_1 = __webpack_require__(8);
const stringify_js_1 = __webpack_require__(11);
function v6ToV1(uuid) {
    const v6Bytes = typeof uuid === 'string' ? (0, parse_js_1.default)(uuid) : uuid;
    const v1Bytes = _v6ToV1(v6Bytes);
    return typeof uuid === 'string' ? (0, stringify_js_1.unsafeStringify)(v1Bytes) : v1Bytes;
}
exports["default"] = v6ToV1;
function _v6ToV1(v6Bytes) {
    return Uint8Array.of(((v6Bytes[3] & 0x0f) << 4) | ((v6Bytes[4] >> 4) & 0x0f), ((v6Bytes[4] & 0x0f) << 4) | ((v6Bytes[5] & 0xf0) >> 4), ((v6Bytes[5] & 0x0f) << 4) | (v6Bytes[6] & 0x0f), v6Bytes[7], ((v6Bytes[1] & 0x0f) << 4) | ((v6Bytes[2] & 0xf0) >> 4), ((v6Bytes[2] & 0x0f) << 4) | ((v6Bytes[3] & 0xf0) >> 4), 0x10 | ((v6Bytes[0] & 0xf0) >> 4), ((v6Bytes[0] & 0x0f) << 4) | ((v6Bytes[1] & 0xf0) >> 4), v6Bytes[8], v6Bytes[9], v6Bytes[10], v6Bytes[11], v6Bytes[12], v6Bytes[13], v6Bytes[14], v6Bytes[15]);
}


/***/ }),
/* 25 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.updateV7State = void 0;
const rng_js_1 = __webpack_require__(13);
const stringify_js_1 = __webpack_require__(11);
const _state = {};
function v7(options, buf, offset) {
    let bytes;
    if (options) {
        bytes = v7Bytes(options.random ?? options.rng?.() ?? (0, rng_js_1.default)(), options.msecs, options.seq, buf, offset);
    }
    else {
        const now = Date.now();
        const rnds = (0, rng_js_1.default)();
        updateV7State(_state, now, rnds);
        bytes = v7Bytes(rnds, _state.msecs, _state.seq, buf, offset);
    }
    return buf ?? (0, stringify_js_1.unsafeStringify)(bytes);
}
function updateV7State(state, now, rnds) {
    state.msecs ??= -Infinity;
    state.seq ??= 0;
    if (now > state.msecs) {
        state.seq = (rnds[6] << 23) | (rnds[7] << 16) | (rnds[8] << 8) | rnds[9];
        state.msecs = now;
    }
    else {
        state.seq = (state.seq + 1) | 0;
        if (state.seq === 0) {
            state.msecs++;
        }
    }
    return state;
}
exports.updateV7State = updateV7State;
function v7Bytes(rnds, msecs, seq, buf, offset = 0) {
    if (rnds.length < 16) {
        throw new Error('Random bytes length must be >= 16');
    }
    if (!buf) {
        buf = new Uint8Array(16);
        offset = 0;
    }
    else {
        if (offset < 0 || offset + 16 > buf.length) {
            throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
    }
    msecs ??= Date.now();
    seq ??= ((rnds[6] * 0x7f) << 24) | (rnds[7] << 16) | (rnds[8] << 8) | rnds[9];
    buf[offset++] = (msecs / 0x10000000000) & 0xff;
    buf[offset++] = (msecs / 0x100000000) & 0xff;
    buf[offset++] = (msecs / 0x1000000) & 0xff;
    buf[offset++] = (msecs / 0x10000) & 0xff;
    buf[offset++] = (msecs / 0x100) & 0xff;
    buf[offset++] = msecs & 0xff;
    buf[offset++] = 0x70 | ((seq >>> 28) & 0x0f);
    buf[offset++] = (seq >>> 20) & 0xff;
    buf[offset++] = 0x80 | ((seq >>> 14) & 0x3f);
    buf[offset++] = (seq >>> 6) & 0xff;
    buf[offset++] = ((seq << 2) & 0xff) | (rnds[10] & 0x03);
    buf[offset++] = rnds[11];
    buf[offset++] = rnds[12];
    buf[offset++] = rnds[13];
    buf[offset++] = rnds[14];
    buf[offset++] = rnds[15];
    return buf;
}
exports["default"] = v7;


/***/ }),
/* 26 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const validate_js_1 = __webpack_require__(9);
function version(uuid) {
    if (!(0, validate_js_1.default)(uuid)) {
        throw TypeError('Invalid UUID');
    }
    return parseInt(uuid.slice(14, 15), 16);
}
exports["default"] = version;


/***/ }),
/* 27 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigManager = void 0;
const vscode = __importStar(__webpack_require__(1));
const logger_1 = __webpack_require__(4);
/**
 * 配置管理器
 * 负责读取和管理插件配置项
 */
class ConfigManager {
    constructor() {
        // 配置前缀
        this.configPrefix = 'tabAutoComplete';
        // 缓存配置值
        this.cachedConfig = {
            enabled: true,
            triggerDelay: 300,
            apiUrl: 'http://localhost:11434',
            modelName: 'qwen2.5-coder:1.5b',
            temperature: 0.3,
            maxTokens: 300,
            maxContextLines: 2000,
            includeImports: true,
            includeComments: true,
            cacheEnabled: true,
            retentionPeriodHours: 24,
            maxSnippets: 1000,
            enabledFileTypes: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.html', '.css', '.md', '*'],
            disabledFileTypes: ['.txt', '.log', '.json', '.yml', '.yaml'],
            logLevel: logger_1.LogLevel.ERROR,
            adaptToProjectSize: true
        };
        this.logger = logger_1.Logger.getInstance();
        // 在构造函数中加载配置
        this.loadConfiguration();
        // 监听配置变更
        this.configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(this.configPrefix)) {
                this.loadConfiguration();
            }
        });
        this.logger.debug('ConfigManager初始化完成');
    }
    /**
     * 加载配置
     */
    loadConfiguration() {
        const config = vscode.workspace.getConfiguration(this.configPrefix);
        // 加载通用设置
        this.cachedConfig.enabled = config.get('general.enabled', true);
        this.cachedConfig.triggerDelay = config.get('general.triggerDelay', 300);
        // 加载API设置
        this.cachedConfig.apiUrl = config.get('model.url', 'http://localhost:11434');
        this.cachedConfig.modelName = config.get('model.name', 'qwen2.5-coder:1.5b');
        this.cachedConfig.temperature = config.get('model.temperature', 0.3);
        this.cachedConfig.maxTokens = config.get('model.maxTokens', 300);
        // 上下文设置
        this.cachedConfig.maxContextLines = config.get('context.maxLines', 100);
        this.cachedConfig.includeImports = config.get('context.includeImports', true);
        this.cachedConfig.includeComments = config.get('context.includeComments', true);
        // 缓存设置
        this.cachedConfig.cacheEnabled = config.get('cache.enabled', true);
        this.cachedConfig.retentionPeriodHours = config.get('cache.retentionPeriodHours', 24);
        this.cachedConfig.maxSnippets = config.get('cache.maxSnippets', 1000);
        // 文件类型设置
        this.cachedConfig.enabledFileTypes = config.get('fileTypes.enabled', ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.html', '.css', '.md', '*']);
        this.cachedConfig.disabledFileTypes = config.get('fileTypes.disabled', ['.txt', '.log', '.json', '.yml', '.yaml']);
        // 日志设置
        const logLevelStr = config.get('logging.level', 'error');
        this.cachedConfig.logLevel = this.parseLogLevel(logLevelStr);
        // 高级设置
        this.cachedConfig.adaptToProjectSize = config.get('advanced.adaptToProjectSize', true);
        // 更新Logger的日志级别
        this.logger.setLogLevel(this.cachedConfig.logLevel);
        this.logger.debug('配置已重新加载');
    }
    /**
     * 将字符串转换为LogLevel枚举
     */
    parseLogLevel(level) {
        switch (level.toLowerCase()) {
            case 'debug':
                return logger_1.LogLevel.DEBUG;
            case 'info':
                return logger_1.LogLevel.INFO;
            case 'warn':
                return logger_1.LogLevel.WARN;
            case 'error':
                return logger_1.LogLevel.ERROR;
            case 'none':
                return logger_1.LogLevel.NONE;
            default:
                return logger_1.LogLevel.ERROR;
        }
    }
    /**
     * 获取日志级别
     */
    getLogLevel() {
        return this.cachedConfig.logLevel;
    }
    /**
     * 设置日志级别
     */
    async setLogLevel(level) {
        const levelStr = logger_1.LogLevel[level].toLowerCase();
        await this.updateConfigValue('logging.level', levelStr);
        this.logger.setLogLevel(level);
    }
    /**
     * 重新加载配置
     */
    reloadConfig() {
        this.loadConfiguration();
    }
    /**
     * 更新配置值
     */
    async updateConfigValue(key, value, global = true) {
        const config = vscode.workspace.getConfiguration(this.configPrefix);
        await config.update(key, value, global);
        this.reloadConfig();
    }
    /**
     * 是否启用插件
     */
    isEnabled() {
        return this.cachedConfig.enabled;
    }
    /**
     * 设置插件启用状态
     */
    async setEnabled(enabled) {
        await this.updateConfigValue('general.enabled', enabled);
    }
    /**
     * 获取触发补全的延迟时间
     */
    getTriggerDelay() {
        return this.cachedConfig.triggerDelay;
    }
    /**
     * 获取API URL
     */
    getApiUrl() {
        return this.cachedConfig.apiUrl;
    }
    /**
     * 获取模型名称
     */
    getModelName() {
        return this.cachedConfig.modelName;
    }
    /**
     * 设置模型名称
     */
    async setModelName(modelName) {
        await this.updateConfigValue('model.name', modelName);
    }
    /**
     * 获取温度参数
     * 较低的温度生成更可预测的文本，较高的温度允许更多创造性
     */
    getTemperature() {
        // 检查项目类型并适当调整温度
        const baseTemperature = this.cachedConfig.temperature;
        // 如果配置了自适应项目大小，则进行调整
        if (this.shouldAdaptToProjectSize()) {
            const projectSize = this.estimateProjectSize();
            this.logger.debug(`估计项目大小: ${projectSize}`);
            // 大型项目降低一点温度以保持一致性
            if (projectSize === 'large') {
                return Math.max(0.2, baseTemperature - 0.05);
            }
            // 小型项目可以增加一点温度以提高创造性
            else if (projectSize === 'small') {
                return Math.min(0.7, baseTemperature + 0.05);
            }
        }
        return baseTemperature;
    }
    /**
     * 获取最大生成token数
     */
    getMaxTokens() {
        const baseMaxTokens = this.cachedConfig.maxTokens;
        // 如果配置了自适应项目大小，则进行调整
        if (this.shouldAdaptToProjectSize()) {
            const projectSize = this.estimateProjectSize();
            // 大型项目增加token数以包含更多上下文
            if (projectSize === 'large') {
                return Math.min(500, baseMaxTokens + 100);
            }
            // 小型项目可以使用基本设置
            else if (projectSize === 'small') {
                return baseMaxTokens;
            }
        }
        return baseMaxTokens;
    }
    /**
     * 获取最大上下文行数
     */
    getMaxContextLines() {
        return this.cachedConfig.maxContextLines;
    }
    /**
     * 是否包含导入语句
     */
    shouldIncludeImports() {
        return this.cachedConfig.includeImports;
    }
    /**
     * 是否包含注释
     */
    shouldIncludeComments() {
        return this.cachedConfig.includeComments;
    }
    /**
     * 是否启用缓存
     */
    isCacheEnabled() {
        return this.cachedConfig.cacheEnabled;
    }
    /**
     * 获取缓存保留时间（小时）
     */
    getRetentionPeriodHours() {
        return this.cachedConfig.retentionPeriodHours;
    }
    /**
     * 获取最大缓存条目数
     */
    getMaxSnippets() {
        return this.cachedConfig.maxSnippets;
    }
    /**
     * 获取启用的文件类型
     */
    getEnabledFileTypes() {
        const types = this.cachedConfig.enabledFileTypes;
        // 确保返回数组
        if (Array.isArray(types)) {
            return types;
        }
        else if (typeof types === 'string') {
            // 处理字符串情况
            if (types.includes(',')) {
                return types.split(',').map(t => t.trim());
            }
            else {
                return [types];
            }
        }
        // 默认返回所有类型
        return ['*'];
    }
    /**
     * 给定文件扩展名是否适用于针对指定语言的规则
     * @param fileExt 文件扩展名
     * @param language 语言标识符
     */
    isFileExtApplicableForLanguage(fileExt, language) {
        const languageExtMap = {
            'javascript': ['.js', '.jsx'],
            'typescript': ['.ts', '.tsx'],
            'python': ['.py', '.pyw'],
            'java': ['.java'],
            'csharp': ['.cs'],
            'cpp': ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
            'c': ['.c', '.h'],
            'go': ['.go'],
            'rust': ['.rs'],
            'php': ['.php'],
            'ruby': ['.rb'],
            'html': ['.html', '.htm'],
            'css': ['.css'],
            'markdown': ['.md']
        };
        return languageExtMap[language]?.includes(fileExt) || false;
    }
    /**
     * 根据提供的模式检查文件类型
     * @param fileType 文件类型（扩展名或语言标识符）
     * @param patterns 要检查的模式数组
     */
    matchesFileTypePatterns(fileType, patterns) {
        return patterns.some(pattern => {
            // 精确匹配
            if (pattern === fileType) {
                return true;
            }
            // 通配符匹配所有
            if (pattern === '*' || pattern === 'all') {
                return true;
            }
            // 通配符匹配特定扩展名前缀
            if (pattern.endsWith('*') && fileType.startsWith(pattern.slice(0, -1))) {
                return true;
            }
            return false;
        });
    }
    /**
     * 获取禁用的文件类型
     */
    getDisabledFileTypes() {
        const types = this.cachedConfig.disabledFileTypes;
        // 确保返回数组
        if (Array.isArray(types)) {
            return types;
        }
        else if (typeof types === 'string') {
            // 处理字符串情况
            if (types.includes(',')) {
                return types.split(',').map(t => t.trim());
            }
            else {
                return [types];
            }
        }
        // 默认禁用列表
        return ['.txt', '.log'];
    }
    /**
     * 获取完整配置
     */
    getFullConfig() {
        return { ...this.cachedConfig };
    }
    /**
     * 是否启用调试日志
     */
    isDebugEnabled() {
        return this.getLogLevel() === logger_1.LogLevel.DEBUG;
    }
    /**
     * 是否应根据项目大小自适应调整参数
     */
    shouldAdaptToProjectSize() {
        return this.cachedConfig.adaptToProjectSize;
    }
    /**
     * 估计项目大小
     * @returns 'small', 'medium', 或 'large'
     */
    estimateProjectSize() {
        try {
            // 获取当前打开的所有文件数量作为简单估计
            const openedFileCount = vscode.workspace.textDocuments.length;
            // 阈值可以根据需要调整
            if (openedFileCount > 20) {
                return 'large';
            }
            else if (openedFileCount > 8) {
                return 'medium';
            }
            else {
                return 'small';
            }
        }
        catch (error) {
            // 如果无法估计，默认为中型项目
            return 'medium';
        }
    }
    /**
     * 是否启用自适应项目大小
     */
    isAdaptToProjectSizeEnabled() {
        return this.cachedConfig.adaptToProjectSize;
    }
    /**
     * 设置自适应项目大小功能
     */
    async setAdaptToProjectSize(enabled) {
        this.logger.debug(`${enabled ? '启用' : '禁用'}自适应项目大小功能`);
        await this.updateConfigValue('advanced.adaptToProjectSize', enabled);
    }
    /**
     * 获取防抖延迟时间（毫秒）
     */
    getDebounceDelay() {
        return vscode.workspace.getConfiguration('tabAutoComplete').get('debounceDelay', 300);
    }
    /**
     * 获取代码补全提示模板
     */
    getPromptTemplate() {
        return vscode.workspace.getConfiguration('tabAutoComplete').get('prompt.template', '你是一个智能代码补全助手。请根据以下上下文补全代码，只需要补全光标处的代码且只返回补全的代码，不要包含任何解释或注释，补全的内容不要包含上下文中已存在的重复的内容。\n\n上下文:\n```\n${prefix}\n```\n\n请直接补全代码:');
    }
    dispose() {
        if (this.configChangeListener) {
            this.configChangeListener.dispose();
        }
    }
}
exports.ConfigManager = ConfigManager;


/***/ }),
/* 28 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CacheManager = void 0;
const vscode = __importStar(__webpack_require__(1));
const lru_cache_1 = __importDefault(__webpack_require__(29));
const logger_1 = __webpack_require__(4);
const utils_1 = __webpack_require__(32);
/**
 * 缓存管理器
 * 负责存储和检索用户最近的代码片段，用于提高补全的相关性
 */
class CacheManager {
    constructor(storage, configManager) {
        this.storage = storage;
        this.configManager = configManager;
        this.codeSnippets = [];
        this.logger = logger_1.Logger.getInstance();
        // 初始化LRU缓存
        this.lruCache = new lru_cache_1.default({
            max: this.configManager.getMaxSnippets(),
            maxAge: this.configManager.getRetentionPeriodHours() * 60 * 60 * 1000, // 转换为毫秒
        });
        this.logger.debug(`初始化缓存管理器, 最大条目数: ${this.configManager.getMaxSnippets()}, 保留时间: ${this.configManager.getRetentionPeriodHours()}小时`);
        // 从存储中加载缓存
        this.loadCache();
    }
    /**
     * 从存储中加载缓存
     */
    loadCache() {
        this.logger.debug('从存储中加载缓存');
        const cachedData = this.storage.get(CacheManager.CACHE_KEY, []);
        if (cachedData && cachedData.length) {
            this.codeSnippets = cachedData;
            // 将缓存的代码片段添加到LRU缓存
            for (const snippet of this.codeSnippets) {
                this.lruCache.set(snippet.id, snippet);
            }
            this.logger.debug(`已加载 ${this.codeSnippets.length} 个缓存的代码片段`);
            // 清理过期的缓存
            this.cleanExpiredCache();
        }
        else {
            this.logger.debug('没有找到缓存的代码片段');
        }
    }
    /**
     * 清理过期的缓存
     */
    cleanExpiredCache() {
        this.logger.debug('清理过期的缓存片段');
        const now = Date.now();
        const retentionPeriod = this.configManager.getRetentionPeriodHours() * 60 * 60 * 1000; // 转换为毫秒
        let expiredCount = 0;
        this.codeSnippets = this.codeSnippets.filter(snippet => {
            const isExpired = (now - snippet.timestamp) > retentionPeriod;
            if (isExpired) {
                expiredCount++;
                // 从LRU缓存中移除
                this.lruCache.del(snippet.id);
            }
            return !isExpired;
        });
        if (expiredCount > 0) {
            this.logger.debug(`已清理 ${expiredCount} 个过期的缓存片段`);
            this.saveCache();
        }
    }
    /**
     * 保存缓存到存储
     */
    saveCache() {
        this.logger.debug(`保存 ${this.codeSnippets.length} 个代码片段到存储`);
        this.storage.update(CacheManager.CACHE_KEY, this.codeSnippets);
    }
    /**
     * 缓存文档变化
     * 当文档变化时调用此方法，提取并缓存有意义的代码片段
     */
    cacheDocumentChanges(event) {
        if (!this.configManager.isCacheEnabled()) {
            return;
        }
        // 检查变更是否有意义
        if (!this.isSignificantChange(event.contentChanges)) {
            return;
        }
        this.logger.debug(`处理文档变更: ${event.document.fileName}`);
        try {
            for (const change of event.contentChanges) {
                const range = change.range;
                // 获取更改行的上下文
                const context = this.extractContext(event.document, range);
                // 如果上下文为空，跳过
                if (!context) {
                    continue;
                }
                // 提取标签（关键词）
                const language = event.document.languageId;
                const code = change.text;
                if (code.length < 10) {
                    this.logger.debug('代码片段过短，忽略');
                    continue; // 忽略过短的代码片段
                }
                const tags = this.extractTags(code, context, language);
                if (tags.length === 0) {
                    this.logger.debug('无法提取标签，忽略代码片段');
                    continue; // 如果没有提取到标签，忽略
                }
                // 创建代码片段对象
                const snippet = {
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    code,
                    language,
                    timestamp: Date.now(),
                    context,
                    filePath: event.document.fileName,
                    metadata: {
                        tags,
                        frequency: 1
                    }
                };
                // 添加到缓存
                this.addSnippet(snippet);
                this.logger.debug(`缓存了新的代码片段，ID: ${snippet.id}, 语言: ${language}, 标签: ${tags.join(', ')}`);
            }
        }
        catch (error) {
            this.logger.error(`缓存文档变更时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * 判断是否为有意义的变更
     */
    isSignificantChange(changes) {
        // 检查是否有足够长度的文本变更
        for (const change of changes) {
            // 忽略仅包含空格、换行或单个字符的变更
            if (change.text.trim().length > 3) {
                return true;
            }
        }
        return false;
    }
    /**
     * 提取变更的上下文信息
     */
    extractContext(document, range) {
        // 尝试获取包含变更的更大范围（如函数、类定义）
        let contextStart = Math.max(0, range.start.line - 10);
        let contextEnd = Math.min(document.lineCount - 1, range.end.line + 5);
        // 获取上下文文本
        const contextRange = new vscode.Range(new vscode.Position(contextStart, 0), new vscode.Position(contextEnd, document.lineAt(contextEnd).text.length));
        return document.getText(contextRange);
    }
    /**
     * 提取代码中的关键词标签
     */
    extractTags(code, context, language) {
        const tags = [];
        // 根据语言提取不同的关键词
        switch (language) {
            case 'javascript':
            case 'typescript':
                this.extractJavaScriptTags(code, context, tags);
                break;
            case 'python':
                this.extractPythonTags(code, context, tags);
                break;
            // 可以添加更多语言的支持
            default:
                this.extractGenericTags(code, context, tags);
                break;
        }
        this.logger.debug(`提取的标签: ${tags.join(', ')}`);
        return tags;
    }
    /**
     * 从JavaScript/TypeScript代码中提取标签
     */
    extractJavaScriptTags(_code, context, tags) {
        // 提取函数名和类名
        const functionMatch = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
        const classMatch = /class\s+([a-zA-Z0-9_]+)\s*/g;
        const constMatch = /const\s+([a-zA-Z0-9_]+)\s*=/g;
        const letMatch = /let\s+([a-zA-Z0-9_]+)\s*=/g;
        let match;
        while ((match = functionMatch.exec(context)) !== null) {
            if (match[1] && !tags.includes(match[1])) {
                tags.push(match[1]);
            }
        }
        while ((match = classMatch.exec(context)) !== null) {
            if (match[1] && !tags.includes(match[1])) {
                tags.push(match[1]);
            }
        }
        while ((match = constMatch.exec(context)) !== null) {
            if (match[1] && !tags.includes(match[1])) {
                tags.push(match[1]);
            }
        }
        while ((match = letMatch.exec(context)) !== null) {
            if (match[1] && !tags.includes(match[1])) {
                tags.push(match[1]);
            }
        }
    }
    /**
     * 从Python代码中提取标签
     */
    extractPythonTags(_code, context, tags) {
        // 提取函数名和类名
        const functionMatch = /def\s+([a-zA-Z0-9_]+)\s*\(/g;
        const classMatch = /class\s+([a-zA-Z0-9_]+)\s*\(?/g;
        let match;
        while ((match = functionMatch.exec(context)) !== null) {
            if (match[1] && !tags.includes(match[1])) {
                tags.push(match[1]);
            }
        }
        while ((match = classMatch.exec(context)) !== null) {
            if (match[1] && !tags.includes(match[1])) {
                tags.push(match[1]);
            }
        }
    }
    /**
     * 从通用代码中提取标签
     */
    extractGenericTags(_code, context, tags) {
        // 提取所有可能的标识符
        const identifierMatch = /\b([a-zA-Z][a-zA-Z0-9_]{2,})\b/g;
        let match;
        const identifiers = new Set();
        while ((match = identifierMatch.exec(context)) !== null) {
            if (match[1] && !identifiers.has(match[1])) {
                identifiers.add(match[1]);
                // 只将重要标识符（长度大于3的非关键字）添加为标签
                if (match[1].length > 3 && !this.isCommonKeyword(match[1])) {
                    tags.push(match[1]);
                }
            }
        }
    }
    /**
     * 检查是否为常见的编程关键字
     */
    isCommonKeyword(word) {
        const commonKeywords = [
            'function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
            'return', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
            'switch', 'case', 'break', 'default', 'continue', 'new', 'this', 'super',
            'extends', 'implements', 'interface', 'typeof', 'instanceof'
        ];
        return commonKeywords.includes(word.toLowerCase());
    }
    /**
     * 将代码片段添加到缓存
     */
    addSnippet(snippet) {
        // 检查是否已有类似片段
        const similarSnippet = this.findSimilarSnippet(snippet);
        if (similarSnippet) {
            // 更新已有片段
            this.logger.debug(`找到类似的片段，更新而不是添加新的`);
            similarSnippet.timestamp = Date.now();
            similarSnippet.metadata.frequency++;
            // 合并标签
            for (const tag of snippet.metadata.tags) {
                if (!similarSnippet.metadata.tags.includes(tag)) {
                    similarSnippet.metadata.tags.push(tag);
                }
            }
        }
        else {
            // 添加新片段
            this.codeSnippets.push(snippet);
            this.lruCache.set(snippet.id, snippet);
            // 如果缓存已满，LRU缓存会自动删除最旧的项
            this.logger.debug(`添加新片段到缓存，当前缓存大小: ${this.codeSnippets.length}`);
        }
        // 保存到持久化存储
        this.saveCache();
    }
    /**
     * 寻找相似的代码片段
     */
    findSimilarSnippet(snippet) {
        for (const existing of this.codeSnippets) {
            // 如果语言不同，跳过
            if (existing.language !== snippet.language) {
                continue;
            }
            // 计算相似度
            const similarity = this.calculateSimilarity(existing.code, snippet.code);
            if (similarity > 0.8) { // 80%相似度阈值
                return existing;
            }
        }
        return undefined;
    }
    /**
     * 计算两段代码的相似度 (0-1)
     */
    calculateSimilarity(code1, code2) {
        // 简化的相似度计算，基于最长公共子序列
        const distance = utils_1.calculateLevenshteinDistance(code1, code2);
        const maxLength = Math.max(code1.length, code2.length);
        return maxLength === 0 ? 1 : 1 - (distance / maxLength);
    }
    /**
     * 查找与当前上下文相关的代码
     */
    findRelevantCode(currentCode, language, maxResults = 3) {
        this.logger.debug(`查找相关代码，语言: ${language}`);
        const startTime = Date.now();
        if (this.codeSnippets.length === 0) {
            this.logger.debug('缓存为空，没有找到相关代码');
            return [];
        }
        // 提取当前代码的标签
        const context = currentCode; // 使用当前代码作为上下文
        const tags = this.extractTags(currentCode, context, language);
        if (tags.length === 0) {
            this.logger.debug('无法从当前代码提取标签，无法找到相关代码');
            return [];
        }
        this.logger.debug(`当前代码标签: ${tags.join(', ')}`);
        // 对所有缓存的代码片段评分
        const scoredSnippets = this.codeSnippets
            .filter(s => s.language === language) // 仅考虑相同语言的片段
            .map(snippet => {
            const score = this.calculateRelevanceScore(snippet, tags, currentCode);
            return { snippet, score };
        })
            .filter(item => item.score > 0) // 过滤掉不相关的片段
            .sort((a, b) => b.score - a.score) // 按评分降序排序
            .slice(0, maxResults); // 取前N个结果
        const result = scoredSnippets.map(item => item.snippet.code);
        const duration = Date.now() - startTime;
        this.logger.debug(`找到 ${result.length} 个相关代码片段，耗时: ${duration}ms`);
        if (result.length > 0) {
            this.logger.debug(`最佳匹配得分: ${scoredSnippets[0].score.toFixed(2)}`);
        }
        return result;
    }
    /**
     * 计算代码片段与当前上下文的相关性评分
     */
    calculateRelevanceScore(snippet, currentTags, currentCode) {
        let score = 0;
        // 1. 标签匹配度
        for (const tag of currentTags) {
            if (snippet.metadata.tags.includes(tag)) {
                score += 0.2; // 每个匹配标签增加权重
            }
        }
        // 2. 代码相似度
        const similarity = this.calculateSimilarity(snippet.code, currentCode);
        score += similarity * 0.3;
        // 3. 使用频率
        score += Math.min(snippet.metadata.frequency / 10, 0.3); // 最多加0.3分
        // 4. 时间衰减因子 (最近的代码片段得分更高)
        const ageInHours = (Date.now() - snippet.timestamp) / (1000 * 60 * 60);
        const recencyScore = Math.max(0, 0.2 - (ageInHours / 240) * 0.2); // 10天后降为0
        score += recencyScore;
        return score;
    }
    /**
     * 清空缓存
     */
    clearCache() {
        this.logger.debug('清空所有缓存的代码片段');
        this.codeSnippets = [];
        this.lruCache.reset();
        this.saveCache();
    }
    /**
     * 获取缓存的统计信息
     */
    getStats() {
        const languageStats = {};
        for (const snippet of this.codeSnippets) {
            if (!languageStats[snippet.language]) {
                languageStats[snippet.language] = 0;
            }
            languageStats[snippet.language]++;
        }
        return {
            snippetCount: this.codeSnippets.length,
            languageStats
        };
    }
    /**
     * 获取缓存的补全内容
     * @param prefix 前缀文本
     * @returns 缓存的补全内容，如果没有找到则返回undefined
     */
    async get(prefix) {
        if (!this.configManager.isCacheEnabled()) {
            return undefined;
        }
        this.logger.debug(`尝试从缓存中获取补全内容，前缀长度: ${prefix.length}`);
        // 使用前缀的哈希作为键
        const key = this.hashString(prefix);
        // 从LRU缓存中获取
        const cachedSnippet = this.lruCache.get(key);
        if (cachedSnippet) {
            this.logger.debug(`缓存命中，返回缓存的补全内容`);
            return cachedSnippet.code;
        }
        this.logger.debug(`缓存未命中`);
        return undefined;
    }
    /**
     * 将补全内容存储到缓存中
     * @param prefix 前缀文本
     * @param completion 补全内容
     */
    async put(prefix, completion) {
        if (!this.configManager.isCacheEnabled() || !completion || completion.trim().length === 0) {
            return;
        }
        this.logger.debug(`将补全内容存储到缓存中，前缀长度: ${prefix.length}, 补全长度: ${completion.length}`);
        // 使用前缀的哈希作为键
        const key = this.hashString(prefix);
        // 创建代码片段对象
        const snippet = {
            id: key,
            code: completion,
            language: 'unknown',
            timestamp: Date.now(),
            context: prefix.slice(-200),
            filePath: '',
            metadata: {
                tags: [],
                frequency: 1
            }
        };
        // 添加到LRU缓存
        this.lruCache.set(key, snippet);
        // 添加到代码片段列表
        const existingIndex = this.codeSnippets.findIndex(s => s.id === key);
        if (existingIndex >= 0) {
            this.codeSnippets[existingIndex] = snippet;
        }
        else {
            this.codeSnippets.push(snippet);
        }
        // 保存缓存
        this.saveCache();
    }
    /**
     * 计算字符串的哈希值
     * @param str 要哈希的字符串
     * @returns 哈希字符串
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `hash_${Math.abs(hash).toString(16)}`;
    }
}
exports.CacheManager = CacheManager;
CacheManager.CACHE_KEY = 'ollamaCodeCompletionCache';


/***/ }),
/* 29 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



// A linked list to keep track of recently-used-ness
const Yallist = __webpack_require__(30)

const MAX = Symbol('max')
const LENGTH = Symbol('length')
const LENGTH_CALCULATOR = Symbol('lengthCalculator')
const ALLOW_STALE = Symbol('allowStale')
const MAX_AGE = Symbol('maxAge')
const DISPOSE = Symbol('dispose')
const NO_DISPOSE_ON_SET = Symbol('noDisposeOnSet')
const LRU_LIST = Symbol('lruList')
const CACHE = Symbol('cache')
const UPDATE_AGE_ON_GET = Symbol('updateAgeOnGet')

const naiveLength = () => 1

// lruList is a yallist where the head is the youngest
// item, and the tail is the oldest.  the list contains the Hit
// objects as the entries.
// Each Hit object has a reference to its Yallist.Node.  This
// never changes.
//
// cache is a Map (or PseudoMap) that matches the keys to
// the Yallist.Node object.
class LRUCache {
  constructor (options) {
    if (typeof options === 'number')
      options = { max: options }

    if (!options)
      options = {}

    if (options.max && (typeof options.max !== 'number' || options.max < 0))
      throw new TypeError('max must be a non-negative number')
    // Kind of weird to have a default max of Infinity, but oh well.
    const max = this[MAX] = options.max || Infinity

    const lc = options.length || naiveLength
    this[LENGTH_CALCULATOR] = (typeof lc !== 'function') ? naiveLength : lc
    this[ALLOW_STALE] = options.stale || false
    if (options.maxAge && typeof options.maxAge !== 'number')
      throw new TypeError('maxAge must be a number')
    this[MAX_AGE] = options.maxAge || 0
    this[DISPOSE] = options.dispose
    this[NO_DISPOSE_ON_SET] = options.noDisposeOnSet || false
    this[UPDATE_AGE_ON_GET] = options.updateAgeOnGet || false
    this.reset()
  }

  // resize the cache when the max changes.
  set max (mL) {
    if (typeof mL !== 'number' || mL < 0)
      throw new TypeError('max must be a non-negative number')

    this[MAX] = mL || Infinity
    trim(this)
  }
  get max () {
    return this[MAX]
  }

  set allowStale (allowStale) {
    this[ALLOW_STALE] = !!allowStale
  }
  get allowStale () {
    return this[ALLOW_STALE]
  }

  set maxAge (mA) {
    if (typeof mA !== 'number')
      throw new TypeError('maxAge must be a non-negative number')

    this[MAX_AGE] = mA
    trim(this)
  }
  get maxAge () {
    return this[MAX_AGE]
  }

  // resize the cache when the lengthCalculator changes.
  set lengthCalculator (lC) {
    if (typeof lC !== 'function')
      lC = naiveLength

    if (lC !== this[LENGTH_CALCULATOR]) {
      this[LENGTH_CALCULATOR] = lC
      this[LENGTH] = 0
      this[LRU_LIST].forEach(hit => {
        hit.length = this[LENGTH_CALCULATOR](hit.value, hit.key)
        this[LENGTH] += hit.length
      })
    }
    trim(this)
  }
  get lengthCalculator () { return this[LENGTH_CALCULATOR] }

  get length () { return this[LENGTH] }
  get itemCount () { return this[LRU_LIST].length }

  rforEach (fn, thisp) {
    thisp = thisp || this
    for (let walker = this[LRU_LIST].tail; walker !== null;) {
      const prev = walker.prev
      forEachStep(this, fn, walker, thisp)
      walker = prev
    }
  }

  forEach (fn, thisp) {
    thisp = thisp || this
    for (let walker = this[LRU_LIST].head; walker !== null;) {
      const next = walker.next
      forEachStep(this, fn, walker, thisp)
      walker = next
    }
  }

  keys () {
    return this[LRU_LIST].toArray().map(k => k.key)
  }

  values () {
    return this[LRU_LIST].toArray().map(k => k.value)
  }

  reset () {
    if (this[DISPOSE] &&
        this[LRU_LIST] &&
        this[LRU_LIST].length) {
      this[LRU_LIST].forEach(hit => this[DISPOSE](hit.key, hit.value))
    }

    this[CACHE] = new Map() // hash of items by key
    this[LRU_LIST] = new Yallist() // list of items in order of use recency
    this[LENGTH] = 0 // length of items in the list
  }

  dump () {
    return this[LRU_LIST].map(hit =>
      isStale(this, hit) ? false : {
        k: hit.key,
        v: hit.value,
        e: hit.now + (hit.maxAge || 0)
      }).toArray().filter(h => h)
  }

  dumpLru () {
    return this[LRU_LIST]
  }

  set (key, value, maxAge) {
    maxAge = maxAge || this[MAX_AGE]

    if (maxAge && typeof maxAge !== 'number')
      throw new TypeError('maxAge must be a number')

    const now = maxAge ? Date.now() : 0
    const len = this[LENGTH_CALCULATOR](value, key)

    if (this[CACHE].has(key)) {
      if (len > this[MAX]) {
        del(this, this[CACHE].get(key))
        return false
      }

      const node = this[CACHE].get(key)
      const item = node.value

      // dispose of the old one before overwriting
      // split out into 2 ifs for better coverage tracking
      if (this[DISPOSE]) {
        if (!this[NO_DISPOSE_ON_SET])
          this[DISPOSE](key, item.value)
      }

      item.now = now
      item.maxAge = maxAge
      item.value = value
      this[LENGTH] += len - item.length
      item.length = len
      this.get(key)
      trim(this)
      return true
    }

    const hit = new Entry(key, value, len, now, maxAge)

    // oversized objects fall out of cache automatically.
    if (hit.length > this[MAX]) {
      if (this[DISPOSE])
        this[DISPOSE](key, value)

      return false
    }

    this[LENGTH] += hit.length
    this[LRU_LIST].unshift(hit)
    this[CACHE].set(key, this[LRU_LIST].head)
    trim(this)
    return true
  }

  has (key) {
    if (!this[CACHE].has(key)) return false
    const hit = this[CACHE].get(key).value
    return !isStale(this, hit)
  }

  get (key) {
    return get(this, key, true)
  }

  peek (key) {
    return get(this, key, false)
  }

  pop () {
    const node = this[LRU_LIST].tail
    if (!node)
      return null

    del(this, node)
    return node.value
  }

  del (key) {
    del(this, this[CACHE].get(key))
  }

  load (arr) {
    // reset the cache
    this.reset()

    const now = Date.now()
    // A previous serialized cache has the most recent items first
    for (let l = arr.length - 1; l >= 0; l--) {
      const hit = arr[l]
      const expiresAt = hit.e || 0
      if (expiresAt === 0)
        // the item was created without expiration in a non aged cache
        this.set(hit.k, hit.v)
      else {
        const maxAge = expiresAt - now
        // dont add already expired items
        if (maxAge > 0) {
          this.set(hit.k, hit.v, maxAge)
        }
      }
    }
  }

  prune () {
    this[CACHE].forEach((value, key) => get(this, key, false))
  }
}

const get = (self, key, doUse) => {
  const node = self[CACHE].get(key)
  if (node) {
    const hit = node.value
    if (isStale(self, hit)) {
      del(self, node)
      if (!self[ALLOW_STALE])
        return undefined
    } else {
      if (doUse) {
        if (self[UPDATE_AGE_ON_GET])
          node.value.now = Date.now()
        self[LRU_LIST].unshiftNode(node)
      }
    }
    return hit.value
  }
}

const isStale = (self, hit) => {
  if (!hit || (!hit.maxAge && !self[MAX_AGE]))
    return false

  const diff = Date.now() - hit.now
  return hit.maxAge ? diff > hit.maxAge
    : self[MAX_AGE] && (diff > self[MAX_AGE])
}

const trim = self => {
  if (self[LENGTH] > self[MAX]) {
    for (let walker = self[LRU_LIST].tail;
      self[LENGTH] > self[MAX] && walker !== null;) {
      // We know that we're about to delete this one, and also
      // what the next least recently used key will be, so just
      // go ahead and set it now.
      const prev = walker.prev
      del(self, walker)
      walker = prev
    }
  }
}

const del = (self, node) => {
  if (node) {
    const hit = node.value
    if (self[DISPOSE])
      self[DISPOSE](hit.key, hit.value)

    self[LENGTH] -= hit.length
    self[CACHE].delete(hit.key)
    self[LRU_LIST].removeNode(node)
  }
}

class Entry {
  constructor (key, value, length, now, maxAge) {
    this.key = key
    this.value = value
    this.length = length
    this.now = now
    this.maxAge = maxAge || 0
  }
}

const forEachStep = (self, fn, node, thisp) => {
  let hit = node.value
  if (isStale(self, hit)) {
    del(self, node)
    if (!self[ALLOW_STALE])
      hit = undefined
  }
  if (hit)
    fn.call(thisp, hit.value, hit.key, self)
}

module.exports = LRUCache


/***/ }),
/* 30 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {


module.exports = Yallist

Yallist.Node = Node
Yallist.create = Yallist

function Yallist (list) {
  var self = this
  if (!(self instanceof Yallist)) {
    self = new Yallist()
  }

  self.tail = null
  self.head = null
  self.length = 0

  if (list && typeof list.forEach === 'function') {
    list.forEach(function (item) {
      self.push(item)
    })
  } else if (arguments.length > 0) {
    for (var i = 0, l = arguments.length; i < l; i++) {
      self.push(arguments[i])
    }
  }

  return self
}

Yallist.prototype.removeNode = function (node) {
  if (node.list !== this) {
    throw new Error('removing node which does not belong to this list')
  }

  var next = node.next
  var prev = node.prev

  if (next) {
    next.prev = prev
  }

  if (prev) {
    prev.next = next
  }

  if (node === this.head) {
    this.head = next
  }
  if (node === this.tail) {
    this.tail = prev
  }

  node.list.length--
  node.next = null
  node.prev = null
  node.list = null

  return next
}

Yallist.prototype.unshiftNode = function (node) {
  if (node === this.head) {
    return
  }

  if (node.list) {
    node.list.removeNode(node)
  }

  var head = this.head
  node.list = this
  node.next = head
  if (head) {
    head.prev = node
  }

  this.head = node
  if (!this.tail) {
    this.tail = node
  }
  this.length++
}

Yallist.prototype.pushNode = function (node) {
  if (node === this.tail) {
    return
  }

  if (node.list) {
    node.list.removeNode(node)
  }

  var tail = this.tail
  node.list = this
  node.prev = tail
  if (tail) {
    tail.next = node
  }

  this.tail = node
  if (!this.head) {
    this.head = node
  }
  this.length++
}

Yallist.prototype.push = function () {
  for (var i = 0, l = arguments.length; i < l; i++) {
    push(this, arguments[i])
  }
  return this.length
}

Yallist.prototype.unshift = function () {
  for (var i = 0, l = arguments.length; i < l; i++) {
    unshift(this, arguments[i])
  }
  return this.length
}

Yallist.prototype.pop = function () {
  if (!this.tail) {
    return undefined
  }

  var res = this.tail.value
  this.tail = this.tail.prev
  if (this.tail) {
    this.tail.next = null
  } else {
    this.head = null
  }
  this.length--
  return res
}

Yallist.prototype.shift = function () {
  if (!this.head) {
    return undefined
  }

  var res = this.head.value
  this.head = this.head.next
  if (this.head) {
    this.head.prev = null
  } else {
    this.tail = null
  }
  this.length--
  return res
}

Yallist.prototype.forEach = function (fn, thisp) {
  thisp = thisp || this
  for (var walker = this.head, i = 0; walker !== null; i++) {
    fn.call(thisp, walker.value, i, this)
    walker = walker.next
  }
}

Yallist.prototype.forEachReverse = function (fn, thisp) {
  thisp = thisp || this
  for (var walker = this.tail, i = this.length - 1; walker !== null; i--) {
    fn.call(thisp, walker.value, i, this)
    walker = walker.prev
  }
}

Yallist.prototype.get = function (n) {
  for (var i = 0, walker = this.head; walker !== null && i < n; i++) {
    // abort out of the list early if we hit a cycle
    walker = walker.next
  }
  if (i === n && walker !== null) {
    return walker.value
  }
}

Yallist.prototype.getReverse = function (n) {
  for (var i = 0, walker = this.tail; walker !== null && i < n; i++) {
    // abort out of the list early if we hit a cycle
    walker = walker.prev
  }
  if (i === n && walker !== null) {
    return walker.value
  }
}

Yallist.prototype.map = function (fn, thisp) {
  thisp = thisp || this
  var res = new Yallist()
  for (var walker = this.head; walker !== null;) {
    res.push(fn.call(thisp, walker.value, this))
    walker = walker.next
  }
  return res
}

Yallist.prototype.mapReverse = function (fn, thisp) {
  thisp = thisp || this
  var res = new Yallist()
  for (var walker = this.tail; walker !== null;) {
    res.push(fn.call(thisp, walker.value, this))
    walker = walker.prev
  }
  return res
}

Yallist.prototype.reduce = function (fn, initial) {
  var acc
  var walker = this.head
  if (arguments.length > 1) {
    acc = initial
  } else if (this.head) {
    walker = this.head.next
    acc = this.head.value
  } else {
    throw new TypeError('Reduce of empty list with no initial value')
  }

  for (var i = 0; walker !== null; i++) {
    acc = fn(acc, walker.value, i)
    walker = walker.next
  }

  return acc
}

Yallist.prototype.reduceReverse = function (fn, initial) {
  var acc
  var walker = this.tail
  if (arguments.length > 1) {
    acc = initial
  } else if (this.tail) {
    walker = this.tail.prev
    acc = this.tail.value
  } else {
    throw new TypeError('Reduce of empty list with no initial value')
  }

  for (var i = this.length - 1; walker !== null; i--) {
    acc = fn(acc, walker.value, i)
    walker = walker.prev
  }

  return acc
}

Yallist.prototype.toArray = function () {
  var arr = new Array(this.length)
  for (var i = 0, walker = this.head; walker !== null; i++) {
    arr[i] = walker.value
    walker = walker.next
  }
  return arr
}

Yallist.prototype.toArrayReverse = function () {
  var arr = new Array(this.length)
  for (var i = 0, walker = this.tail; walker !== null; i++) {
    arr[i] = walker.value
    walker = walker.prev
  }
  return arr
}

Yallist.prototype.slice = function (from, to) {
  to = to || this.length
  if (to < 0) {
    to += this.length
  }
  from = from || 0
  if (from < 0) {
    from += this.length
  }
  var ret = new Yallist()
  if (to < from || to < 0) {
    return ret
  }
  if (from < 0) {
    from = 0
  }
  if (to > this.length) {
    to = this.length
  }
  for (var i = 0, walker = this.head; walker !== null && i < from; i++) {
    walker = walker.next
  }
  for (; walker !== null && i < to; i++, walker = walker.next) {
    ret.push(walker.value)
  }
  return ret
}

Yallist.prototype.sliceReverse = function (from, to) {
  to = to || this.length
  if (to < 0) {
    to += this.length
  }
  from = from || 0
  if (from < 0) {
    from += this.length
  }
  var ret = new Yallist()
  if (to < from || to < 0) {
    return ret
  }
  if (from < 0) {
    from = 0
  }
  if (to > this.length) {
    to = this.length
  }
  for (var i = this.length, walker = this.tail; walker !== null && i > to; i--) {
    walker = walker.prev
  }
  for (; walker !== null && i > from; i--, walker = walker.prev) {
    ret.push(walker.value)
  }
  return ret
}

Yallist.prototype.splice = function (start, deleteCount, ...nodes) {
  if (start > this.length) {
    start = this.length - 1
  }
  if (start < 0) {
    start = this.length + start;
  }

  for (var i = 0, walker = this.head; walker !== null && i < start; i++) {
    walker = walker.next
  }

  var ret = []
  for (var i = 0; walker && i < deleteCount; i++) {
    ret.push(walker.value)
    walker = this.removeNode(walker)
  }
  if (walker === null) {
    walker = this.tail
  }

  if (walker !== this.head && walker !== this.tail) {
    walker = walker.prev
  }

  for (var i = 0; i < nodes.length; i++) {
    walker = insert(this, walker, nodes[i])
  }
  return ret;
}

Yallist.prototype.reverse = function () {
  var head = this.head
  var tail = this.tail
  for (var walker = head; walker !== null; walker = walker.prev) {
    var p = walker.prev
    walker.prev = walker.next
    walker.next = p
  }
  this.head = tail
  this.tail = head
  return this
}

function insert (self, node, value) {
  var inserted = node === self.head ?
    new Node(value, null, node, self) :
    new Node(value, node, node.next, self)

  if (inserted.next === null) {
    self.tail = inserted
  }
  if (inserted.prev === null) {
    self.head = inserted
  }

  self.length++

  return inserted
}

function push (self, item) {
  self.tail = new Node(item, self.tail, null, self)
  if (!self.head) {
    self.head = self.tail
  }
  self.length++
}

function unshift (self, item) {
  self.head = new Node(item, null, self.head, self)
  if (!self.tail) {
    self.tail = self.head
  }
  self.length++
}

function Node (value, prev, next, list) {
  if (!(this instanceof Node)) {
    return new Node(value, prev, next, list)
  }

  this.list = list
  this.value = value

  if (prev) {
    prev.next = this
    this.prev = prev
  } else {
    this.prev = null
  }

  if (next) {
    next.prev = this
    this.next = next
  } else {
    this.next = null
  }
}

try {
  // add if support for Symbol.iterator is present
  __webpack_require__(31)(Yallist)
} catch (er) {}


/***/ }),
/* 31 */
/***/ ((module) => {


module.exports = function (Yallist) {
  Yallist.prototype[Symbol.iterator] = function* () {
    for (let walker = this.head; walker; walker = walker.next) {
      yield walker.value
    }
  }
}


/***/ }),
/* 32 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * utils.ts - 工具函数集合
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFileName = exports.getFileExtension = exports.safeParseJSON = exports.generateUniqueId = exports.calculateLevenshteinDistance = exports.formatCode = exports.throttle = exports.debounce = void 0;
/**
 * 防抖函数
 * 延迟执行函数，避免频繁调用
 * @param fn 要执行的函数
 * @param delay 延迟时间（毫秒）
 */
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        return new Promise((resolve) => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(async () => {
                const result = await fn(...args);
                resolve(result);
            }, delay);
        });
    };
}
exports.debounce = debounce;
/**
 * 节流函数
 * 限制函数执行频率
 * @param fn 要执行的函数
 * @param limit 限制时间（毫秒）
 */
function throttle(fn, limit) {
    let lastCall = 0;
    let lastResult;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            lastResult = fn.apply(this, args);
            return lastResult;
        }
        return undefined;
    };
}
exports.throttle = throttle;
/**
 * 格式化代码
 * 美化代码显示
 * @param code 代码文本
 * @param _language 编程语言(重命名为_language表示不使用)
 */
function formatCode(code, _language) {
    // 简单的代码格式化，真实场景可能需要使用专门的格式化库
    return code.trim();
}
exports.formatCode = formatCode;
/**
 * 计算文本的相似度
 * 使用Levenshtein距离算法
 * @param str1 第一个字符串
 * @param str2 第二个字符串
 */
function calculateLevenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    // 创建距离矩阵
    const dist = [];
    for (let i = 0; i <= m; i++) {
        dist[i] = [];
        dist[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dist[0][j] = j;
    }
    // 计算距离
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            dist[i][j] = Math.min(dist[i - 1][j] + 1, // 删除
            dist[i][j - 1] + 1, // 插入
            dist[i - 1][j - 1] + cost // 替换或匹配
            );
        }
    }
    return dist[m][n];
}
exports.calculateLevenshteinDistance = calculateLevenshteinDistance;
/**
 * 生成唯一ID
 */
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
exports.generateUniqueId = generateUniqueId;
/**
 * 安全解析JSON
 * @param text JSON字符串
 * @param defaultValue 解析失败时的默认值
 */
function safeParseJSON(text, defaultValue) {
    try {
        return JSON.parse(text);
    }
    catch (e) {
        return defaultValue;
    }
}
exports.safeParseJSON = safeParseJSON;
/**
 * 从路径中提取文件扩展名
 * @param filePath 文件路径
 */
function getFileExtension(filePath) {
    const match = filePath.match(/\.([^.]+)$/);
    return match ? match[1] : '';
}
exports.getFileExtension = getFileExtension;
/**
 * 从路径中提取文件名
 * @param filePath 文件路径
 */
function getFileName(filePath) {
    const match = filePath.match(/([^/\\]+)$/);
    return match ? match[1] : '';
}
exports.getFileName = getFileName;


/***/ }),
/* 33 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatusBarManager = void 0;
const vscode = __importStar(__webpack_require__(1));
/**
 * 状态栏管理器
 * 在VSCode状态栏显示插件状态和提供快速操作
 */
class StatusBarManager {
    constructor(configManager) {
        this.configManager = configManager;
        // 创建状态栏项
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100 // 优先级
        );
        // 设置命令
        this.statusBarItem.command = 'ollamaCodeCompletion.toggleEnabled';
        // 初始化显示
        this.updateStatus();
        // 显示状态栏
        this.statusBarItem.show();
    }
    /**
     * 更新状态栏显示
     */
    updateStatus() {
        const isEnabled = this.configManager.isEnabled();
        this.statusBarItem.text = isEnabled ? '$(sparkle) TabAutoComplete' : '$(stop) TabAutoComplete';
        this.statusBarItem.tooltip = isEnabled ? 'TabAutoComplete已启用 (点击禁用)' : 'TabAutoComplete已禁用 (点击启用)';
    }
    /**
     * 获取状态栏项
     * @returns 状态栏项对象
     */
    getStatusBarItem() {
        return this.statusBarItem;
    }
    /**
     * 显示临时信息
     * @param message 要显示的消息
     * @param timeout 显示时间（毫秒）
     */
    showTemporaryMessage(message, timeout = 3000) {
        const originalText = this.statusBarItem.text;
        const originalTooltip = this.statusBarItem.tooltip;
        const originalBackground = this.statusBarItem.backgroundColor;
        // 显示临时消息
        this.statusBarItem.text = `$(info) ${message}`;
        this.statusBarItem.tooltip = message;
        // 一段时间后恢复原状态
        setTimeout(() => {
            this.statusBarItem.text = originalText;
            this.statusBarItem.tooltip = originalTooltip;
            this.statusBarItem.backgroundColor = originalBackground;
        }, timeout);
    }
    /**
     * 显示请求中的状态
     * @param show 是否显示请求中状态
     */
    showRequestInProgress(show) {
        if (show) {
            this.statusBarItem.text = `$(sync~spin) TabAutoComplete 请求中...`;
            this.statusBarItem.tooltip = '正在发送请求';
        }
        else {
            this.updateStatus(); // 恢复正常状态
        }
    }
    /**
     * 显示错误状态
     * @param errorMessage 错误消息
     */
    showError(errorMessage) {
        this.statusBarItem.text = `$(error) TabAutoComplete 错误`;
        this.statusBarItem.tooltip = errorMessage;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        // 5秒后恢复正常状态
        setTimeout(() => {
            this.updateStatus();
        }, 5000);
    }
    /**
     * 切换启用状态
     */
    async toggleEnabled() {
        const isCurrentlyEnabled = this.configManager.isEnabled();
        await this.configManager.setEnabled(!isCurrentlyEnabled);
        this.updateStatus();
        // 显示通知
        vscode.window.showInformationMessage(isCurrentlyEnabled
            ? 'TabAutoComplete已禁用'
            : 'TabAutoComplete已启用');
    }
    /**
     * 释放资源
     */
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;


/***/ }),
/* 34 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CommandManager = void 0;
const vscode = __importStar(__webpack_require__(1));
/**
 * 命令管理器
 * 注册和处理VSCode命令
 */
class CommandManager {
    constructor(context, configManager, ollamaClient, cacheManager, statusBarManager) {
        this.context = context;
        this.configManager = configManager;
        this.ollamaClient = ollamaClient;
        this.cacheManager = cacheManager;
        this.statusBarManager = statusBarManager;
        this.registerCommands();
    }
    /**
     * 注册命令
     */
    registerCommands() {
        const commands = {
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
    async enableCompletion() {
        await this.configManager.setEnabled(true);
        this.statusBarManager.updateStatus();
        vscode.window.showInformationMessage('Ollama 代码补全已启用');
    }
    /**
     * 禁用代码补全
     */
    async disableCompletion() {
        await this.configManager.setEnabled(false);
        this.statusBarManager.updateStatus();
        vscode.window.showInformationMessage('Ollama 代码补全已禁用');
    }
    /**
     * 切换启用状态
     */
    async toggleEnabled() {
        await this.statusBarManager.toggleEnabled();
    }
    /**
     * 选择Ollama模型
     */
    async selectModel() {
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
        }
        catch (error) {
            console.error('选择模型时出错:', error);
            vscode.window.showErrorMessage('选择模型时出错');
        }
    }
    /**
     * 清除代码补全缓存
     */
    async clearCache() {
        const confirm = await vscode.window.showWarningMessage('确定要清除所有代码补全缓存吗？', { modal: true }, '确定');
        if (confirm === '确定') {
            this.cacheManager.clearCache();
            vscode.window.showInformationMessage('代码补全缓存已清除');
        }
    }
    /**
     * 测试与Ollama服务的连接
     */
    async testConnection() {
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
            }
            else {
                vscode.window.showErrorMessage(`连接测试失败: ${result.message}`);
                this.statusBarManager.showError(result.message);
            }
        }
        catch (error) {
            this.statusBarManager.showRequestInProgress(false);
            console.error('测试连接时出错:', error);
            vscode.window.showErrorMessage('测试连接时出错');
        }
    }
    /**
     * 显示当前配置
     */
    showConfig() {
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
        const panel = vscode.window.createWebviewPanel('ollamaCodeCompletionConfig', 'Ollama 代码补全配置', vscode.ViewColumn.One, {});
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
    markdownToHtml(markdown) {
        return markdown
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^- (.*$)/gm, '<ul><li>$1</li></ul>')
            .replace(/<\/ul><ul>/g, '')
            .replace(/\n\n/g, '<br><br>');
    }
}
exports.CommandManager = CommandManager;


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map