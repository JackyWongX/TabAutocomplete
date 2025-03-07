import * as vscode from 'vscode';
import { OllamaClient } from '../api/ollamaClient';
import { ConfigManager } from '../config/configManager';
import { CacheManager } from '../cache/cacheManager';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * 代码补全提供程序
 * 负责分析用户代码，收集上下文，请求模型生成补全，并将补全内容应用到编辑器中
 */
export class CompletionProvider implements vscode.CompletionItemProvider, vscode.Disposable {
    private client: OllamaClient;
    private configManager: ConfigManager;
    private logger: Logger;
    private cacheManager: CacheManager;
    private statusBarItem: vscode.StatusBarItem;
    private diagnosticsCollection: vscode.DiagnosticCollection;

    // 跟踪状态
    private isRegisteredFlag: boolean = false;
    private lastCompletionResult: string | null = null;
    private lastContext: string = '';
    private lastPosition: vscode.Position | null = null;
    private errorsShown: Set<string> = new Set();
    private abortControllers: Map<string, AbortController> = new Map();
    public lastShownCompletion: any = undefined;
    
    // 预览相关属性
    private lastDecorator: vscode.TextEditorDecorationType | null = null;
    private lastInsertText: string | null = null;
    private lastPreviewPosition: vscode.Position | null = null;

    /**
     * 构造函数
     */
    constructor(
        configManager: ConfigManager, 
        logger: Logger, 
        cacheManager: CacheManager,
        statusBarItem: vscode.StatusBarItem,
        diagnosticsCollection: vscode.DiagnosticCollection,
        _context: vscode.ExtensionContext
    ) {
        this.configManager = configManager;
        this.logger = logger;
        this.cacheManager = cacheManager;
        this.statusBarItem = statusBarItem;
        this.diagnosticsCollection = diagnosticsCollection;
        this.client = new OllamaClient(configManager);
        
        this.logger.debug('CompletionProvider 已初始化');
    }

    /**
     * 处理错误
     */
    private onError(e: any) {
        // 忽略一些常见的预期错误
        const ERRORS_TO_IGNORE = [
            "unexpected server status",
            "operation was aborted",
        ];

        if (ERRORS_TO_IGNORE.some((err) => 
            typeof e === "string" ? e.includes(err) : e?.message?.includes(err))) {
            return;
        }

        this.logger.error('生成代码补全时出错', e);
        
        if (!this.errorsShown.has(e.message)) {
            this.errorsShown.add(e.message);
            
            let options = ["文档"];
            if (e.message.includes("Ollama可能未安装")) {
                options.push("下载Ollama");
            } else if (e.message.includes("Ollama可能未运行")) {
                options = ["启动Ollama"];
            }
            
            vscode.window.showErrorMessage(e.message, ...options).then((val) => {
                if (val === "文档") {
                    vscode.env.openExternal(vscode.Uri.parse("https://github.com/ollama/ollama"));
                } else if (val === "下载Ollama") {
                    vscode.env.openExternal(vscode.Uri.parse("https://ollama.ai/download"));
                } else if (val === "启动Ollama") {
                    // 启动Ollama的逻辑
                    this.startOllama();
                }
            });
        }
    }

    /**
     * 启动Ollama服务
     */
    private async startOllama() {
        // 根据平台选择不同的启动命令
        let command = '';
        if (process.platform === 'win32') {
            command = 'start ollama serve';
        } else if (process.platform === 'darwin') {
            command = 'open -a Ollama';
        } else {
            command = 'ollama serve';
        }

        try {
            // 使用VS Code的终端执行命令
            const terminal = vscode.window.createTerminal('Ollama');
            terminal.sendText(command);
            terminal.show();
            
            this.logger.info('已尝试启动Ollama服务');
            vscode.window.showInformationMessage('正在尝试启动Ollama服务，请稍候...');
            
            // 等待几秒钟后测试连接
            setTimeout(async () => {
                const result = await this.client.testConnection();
                if (result.success) {
                    vscode.window.showInformationMessage('Ollama服务已成功启动！');
                } else {
                    vscode.window.showErrorMessage('Ollama服务启动失败，请手动启动Ollama。');
                }
            }, 5000);
        } catch (error) {
            this.logger.error('启动Ollama服务失败', error);
            vscode.window.showErrorMessage('启动Ollama服务失败，请手动启动Ollama。');
        }
    }

    /**
     * 取消当前的补全请求
     */
    public cancel() {
        this.abortControllers.forEach((controller) => {
            controller.abort();
        });
        this.abortControllers.clear();
    }

    /**
     * 创建中止控制器
     */
    private createAbortController(completionId: string): AbortController {
        const controller = new AbortController();
        this.abortControllers.set(completionId, controller);
        return controller;
    }

    /**
     * 删除中止控制器
     */
    private deleteAbortController(completionId: string) {
        this.abortControllers.delete(completionId);
    }

    /**
     * 接受补全
     */
    public async accept(completionId: string): Promise<void> {
        this.logger.debug(`接受补全: ${completionId}`);
        // 可以在这里添加接受补全的统计或其他逻辑
        
        // 如果有活动编辑器，应用补全
        if (this.lastShownCompletion && this.lastShownCompletion.completion) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const document = editor.document;
                const position = editor.selection.active;
                
                // 应用补全
                await this.applyCompletion(editor, position, this.lastShownCompletion.completion);
            }
        }
    }

    /**
     * 标记补全已显示
     */
    public markDisplayed(completionId: string, outcome: any) {
        this.logger.debug(`标记补全已显示: ${completionId}`);
        // 记录outcome相关信息
        if (outcome) {
            this.logger.debug(`补全长度: ${outcome.completion?.length || 0}, 是否来自缓存: ${outcome.cacheHit || false}`);
        }
    }

    /**
     * 应用补全内容到编辑器
     */
    public async applyCompletion(editor: vscode.TextEditor, position: vscode.Position, text: string): Promise<void> {
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
                } else {
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
                    newPosition = new vscode.Position(
                        position.line + insertedLines.length - 1,
                        insertedLines.length > 1 ? lastLineLength : position.character + lastLineLength
                    );
                } else {
                    // 插入了单行文本
                    newPosition = new vscode.Position(position.line, position.character + processedText.length);
                }
                
                // 设置新的光标位置
                editor.selection = new vscode.Selection(newPosition, newPosition);
                
                // 确保编辑器视图能看到新的光标位置
                editor.revealRange(new vscode.Range(newPosition, newPosition));
                
                // 更新最后位置
                this.lastPosition = newPosition;
            } else {
                this.logger.debug('应用补全内容失败，编辑操作返回false');
            }
        } catch (error) {
            this.logger.error('应用补全时出错', error);
            throw error; // 重新抛出错误以便调用者处理
        }
    }

    /**
     * 获取触发字符
     */
    public getTriggerCharacters(): string[] {
        return ['.', '(', '{', '[', ',', ' ', '\n'];
    }

    /**
     * 提供代码补全项
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null> {
        try {
            // 检查是否启用了代码补全
            if (!this.configManager.isEnabled()) {
                this.logger.debug('代码补全功能已禁用，不提供补全');
                return null;
            }

            // 记录触发信息
            this.logger.debug(`触发补全，类型: ${context.triggerKind}, 字符: ${context.triggerCharacter || 'none'}`);

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
            const completionId = uuidv4();
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
            let completion: string | null = null;
            let cacheHit = false;
            
            if (this.configManager.isCacheEnabled()) {
                this.logger.debug('缓存已启用，尝试从缓存获取补全');
                try {
                    const cachedCompletion = await this.cacheManager.get(contextData.prefix);
                    if (cachedCompletion) {
                        completion = cachedCompletion;
                        cacheHit = true;
                        this.logger.debug('使用缓存的补全结果');
                    } else {
                        this.logger.debug('缓存未命中');
                    }
                } catch (error) {
                    this.logger.debug(`从缓存获取补全时出错: ${error instanceof Error ? error.message : String(error)}`);
                }
            } else {
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
                    completion = await this.client.generateCompletion(
                        prompt,
                        {
                            temperature: temperature,
                            maxTokens: maxTokens,
                            model: modelName
                        },
                        signal
                    );
                    
                    // 如果请求被中止，返回null
                    if (signal.aborted) {
                        this.logger.debug('补全请求被中止');
                        this.statusBarItem.text = "$(code) 补全";
                        this.statusBarItem.tooltip = "Ollama代码补全";
                        return null;
                    }
                    
                    if (completion) {
                        this.logger.debug(`模型生成补全成功，原始补全长度: ${completion.length}`);
                    } else {
                        this.logger.debug('模型返回空补全');
                    }
                    
                    // 处理补全结果
                    completion = this.processCompletionResult(completion, contextData);
                    
                    if (completion) {
                        this.logger.debug(`处理后的补全长度: ${completion.length}`);
                    } else {
                        this.logger.debug('处理后补全为空');
                    }
                    
                    // 保存到缓存
                    if (this.configManager.isCacheEnabled() && completion) {
                        this.logger.debug('将补全结果保存到缓存');
                        await this.cacheManager.put(contextData.prefix, completion);
                    }
                } catch (error) {
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
            const item = new vscode.CompletionItem(
                completion.split('\n')[0] + '...',
                vscode.CompletionItemKind.Snippet
            );
            
            // 设置插入文本
            item.insertText = completion;
            
            // 设置详细信息
            item.detail = '基于上下文的AI补全';
            
            // 设置文档
            item.documentation = new vscode.MarkdownString(
                '```' + document.languageId + '\n' + completion + '\n```'
            );
            
            // 设置排序文本，确保我们的补全项排在前面
            item.sortText = '0';
            
            // 设置为预选项，让用户可以直接按Tab选择
            item.preselect = true;
            
            // 设置命令
            item.command = {
                title: '应用代码补全',
                command: 'ollamaCompletion.applyCompletion',
                arguments: [completionId]
            };
            
            // 更新状态栏
            this.statusBarItem.text = "$(code) 补全";
            this.statusBarItem.tooltip = "Ollama代码补全";
            this.logger.debug('成功创建补全项，返回补全结果');

            return [item];
        } catch (error) {
            this.logger.error(`provideCompletionItems方法出错: ${error instanceof Error ? error.message : String(error)}`);
            this.onError(error);
            return null;
        } finally {
            this.statusBarItem.text = "$(code) 补全";
            this.statusBarItem.tooltip = "Ollama代码补全";
        }
    }

    /**
     * 准备提示
     */
    private preparePrompt(contextData: any): string {
        // 构建提示模板
        let prompt = `你是一个智能代码补全助手。请根据以下上下文，补全代码。只返回补全的代码，不要包含任何解释或注释。

上下文:
\`\`\`
${contextData.prefix}
\`\`\`

请直接补全代码:`;

        return prompt;
    }

    /**
     * 处理补全结果
     */
    private processCompletionResult(completion: string | null, contextData: any): string | null {
        if (!completion) {
            return null;
        }
        
        // 移除可能的代码块标记
        let processedText = completion;
        if (processedText.startsWith('```')) {
            const langMatch = processedText.match(/^```(\w+)\n/);
            if (langMatch) {
                processedText = processedText.substring(langMatch[0].length);
            } else {
                processedText = processedText.substring(3);
            }
        }
        if (processedText.endsWith('```')) {
            processedText = processedText.substring(0, processedText.length - 3);
        }
        
        // 如果补全文本包含前缀，移除这部分
        if (processedText.startsWith(contextData.prefix)) {
            processedText = processedText.substring(contextData.prefix.length);
        }
        
        return processedText;
    }

    /**
     * 收集上下文
     */
    private collectContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): any {
        // 获取当前文件的内容
        const text = document.getText();
        const offset = document.offsetAt(position);
        
        // 分割前缀和后缀
        const prefix = text.substring(0, offset);
        const suffix = text.substring(offset);
        
        // 获取导入语句
        const imports = this.getImportStatements(document);
        
        // 获取上下文行数
        const maxContextLines = this.configManager.getMaxContextLines();
        
        // 获取前面的行
        const lines = prefix.split('\n');
        const contextLines = lines.slice(Math.max(0, lines.length - maxContextLines));
        
        // 构建上下文
        const context = {
            prefix,
            suffix,
            prompt: '',
            imports,
            language: document.languageId,
            lineCount: document.lineCount,
            fileName: document.fileName,
            contextLines: contextLines.join('\n')
        };
        
        return context;
    }

    /**
     * 获取导入语句
     */
    private getImportStatements(document: vscode.TextDocument): string[] {
        const text = document.getText();
        const lines = text.split('\n');
        const imports: string[] = [];
        
        // 根据语言类型识别导入语句
        const language = document.languageId;
        
        // 正则表达式匹配不同语言的导入语句
        let importRegex: RegExp;
        
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
    public isFileTypeSupported(document: vscode.TextDocument): boolean {
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
            } catch (error) {
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
            } catch (error) {
                this.logger.debug(`获取启用类型时出错: ${error}`);
                
                // 如果出错，默认支持常见编程语言
                if (commonLanguages.includes(languageId)) {
                    return true;
                }
            }
            
            this.logger.debug(`文件类型不支持: ${languageId}, ${fileExt}`);
            return false;
        } catch (error) {
            this.logger.error(`检查文件类型支持时出错: ${error}`);
            return false;
        }
    }

    /**
     * 检查是否已注册
     */
    public isRegistered(): boolean {
        return this.isRegisteredFlag;
    }

    /**
     * 设置注册状态
     */
    public setRegistered(value: boolean): void {
        this.isRegisteredFlag = value;
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.cancel();
        this.logger.debug('CompletionProvider 已释放');
    }

    /**
     * 设置最后使用的装饰器
     */
    public setLastDecorator(decorator: vscode.TextEditorDecorationType): void {
        // 如果已经有装饰器，先清除它
        this.clearPreview();
        this.lastDecorator = decorator;
    }

    /**
     * 设置最后的插入文本
     */
    public setLastInsertText(text: string): void {
        this.lastInsertText = text;
    }

    /**
     * 设置最后的位置
     */
    public setLastPosition(position: vscode.Position): void {
        this.lastPosition = position;
    }

    /**
     * 设置最后的预览位置
     */
    public setLastPreviewPosition(position: vscode.Position | null): void {
        this.lastPreviewPosition = position;
    }

    /**
     * 获取最后的插入文本
     */
    public getLastInsertText(): string | null {
        return this.lastInsertText;
    }

    /**
     * 获取最后的位置
     */
    public getLastPosition(): vscode.Position | null {
        return this.lastPosition;
    }

    /**
     * 检查是否有活动的预览
     */
    public hasActivePreview(): boolean {
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
    public clearPreview(): void {
        try {
            // 清除并释放装饰器
            if (this.lastDecorator) {
                this.lastDecorator.dispose();
                this.lastDecorator = null;
            }
            
            // 清除编辑器中的所有预览装饰器
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const emptyDecorationType = vscode.window.createTextEditorDecorationType({});
                editor.setDecorations(emptyDecorationType, []);
                emptyDecorationType.dispose();
            }
            
            // 重置所有状态
            this.lastInsertText = null;
            this.lastPreviewPosition = null;
            this.lastPosition = null;
            
            this.logger.debug('预览已清除');
        } catch (error) {
            this.logger.error('清除预览时出错', error);
        }
    }

    /**
     * 设置预览
     */
    public setPreview(text: string, position: vscode.Position): void {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // 清除之前的预览
            this.clearPreview();

            // 创建新的装饰器
            const decorationType = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: text,
                    color: '#888888'
                }
            });

            // 应用装饰器
            editor.setDecorations(decorationType, [new vscode.Range(position, position)]);

            // 保存状态
            this.lastDecorator = decorationType;
            this.lastInsertText = text;
            this.lastPosition = position;
            this.lastPreviewPosition = position;
            
            this.logger.debug('预览已设置');
        } catch (error) {
            this.logger.error('设置预览时出错', error);
            this.clearPreview();
        }
    }

    /**
     * 获取最后使用的装饰器
     */
    public getLastDecorator(): vscode.TextEditorDecorationType | null {
        return this.lastDecorator;
    }

    /**
     * 获取最后的预览位置
     */
    public getLastPreviewPosition(): vscode.Position | null {
        return this.lastPreviewPosition;
    }
}
