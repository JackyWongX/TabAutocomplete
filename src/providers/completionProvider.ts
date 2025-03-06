import * as vscode from 'vscode';
import { OllamaClient } from '../api/ollamaClient';
import { ConfigManager } from '../config/configManager';
import { CacheManager } from '../cache/cacheManager';
import { Logger } from '../utils/logger';

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
     * 应用补全内容到编辑器
     */
    public applyCompletion(editor: vscode.TextEditor, position: vscode.Position, text: string): void {
        try {
            if (!text || text.trim().length === 0) {
                this.logger.debug('补全内容为空，不应用');
                return;
            }

            const document = editor.document;
            
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
            
            // 获取当前行文本
            const lineText = document.lineAt(position.line).text;
            const textBeforeCursor = lineText.substring(0, position.character);
            
            // 如果补全文本包含当前行的文本，移除这部分
            if (processedText.startsWith(textBeforeCursor)) {
                processedText = processedText.substring(textBeforeCursor.length);
            }
            
            // 检测并移除文档中已存在的重复内容
            processedText = this.removeDuplicateContent(document, processedText);
            
            // 记录应用内容
            this.logger.debug(`应用补全内容，长度: ${processedText.length} 字符`);
            
            // 如果去重后内容为空，则不应用
            if (processedText.trim().length === 0) {
                this.logger.debug('去重后补全内容为空，不应用');
                return;
            }
            
            // 编辑文档插入补全内容
            editor.edit(editBuilder => {
                editBuilder.insert(position, processedText);
            }).then(success => {
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
            }).then(undefined, error => {
                this.logger.error(`应用编辑时出错: ${error instanceof Error ? error.message : '未知错误'}`);
            });
        }
        catch (error) {
            this.logger.error('应用补全时出错', error);
        }
    }

    /**
     * 检查一行是否为注释行
     * @param line 要检查的行
     * @param language 语言ID
     * @returns 是否为注释行
     */
    private isCommentLine(line: string, language: string = ''): boolean {
        const trimmedLine = line.trim();
        
        // 通用注释标记识别
        if (trimmedLine.startsWith('//') ||     // C风格语言
            trimmedLine.startsWith('/*') ||     // C风格语言
            trimmedLine.startsWith('*') ||      // C风格语言多行注释中间行
            trimmedLine.startsWith('#') ||      // Python, Shell, Ruby等
            trimmedLine.startsWith('--') ||     // SQL, Haskell等
            trimmedLine.startsWith('<!--') ||   // HTML, XML
            trimmedLine.startsWith('"""') ||    // Python文档字符串
            trimmedLine.startsWith("'''") ||    // Python文档字符串
            trimmedLine.startsWith('%') ||      // MATLAB, LaTeX
            trimmedLine.startsWith(';') ||      // Lisp, Assembly
            trimmedLine.startsWith("REM ") ||   // Batch文件
            trimmedLine === "=begin" ||         // Ruby多行注释开始
            trimmedLine === "=end") {           // Ruby多行注释结束
            return true;
        }
        
        // 特定语言的注释识别
        if (language) {
            switch (language.toLowerCase()) {
                case 'html':
                case 'xml':
                case 'svg':
                    return trimmedLine.includes('<!--');
                case 'vb':
                case 'vba':
                    return trimmedLine.startsWith("'") || trimmedLine.startsWith("REM");
                // 其他特殊语言可以在这里添加
            }
        }
        
        return false;
    }
    
    /**
     * 检测并移除文档中已存在的重复内容
     * @param document 当前文档
     * @param completionText 补全内容
     * @returns 去除重复后的补全内容
     */
    private removeDuplicateContent(document: vscode.TextDocument, completionText: string): string {
        try {
            this.logger.debug('开始检测重复内容...');
            
            // 获取文档全文和补全内容
            const documentText = document.getText();
            const docLines = documentText.split('\n');
            const compLines = completionText.split('\n');
            const language = document.languageId;
            
            // 检查补全内容是否完全包含在文档中，但要排除注释中出现的情况
            if (documentText.includes(completionText)) {
                // 查找补全内容在文档中的位置
                const contentPos = documentText.indexOf(completionText);
                
                // 检查这个位置是否在注释中
                // 在这一行前面是否有注释标记
                const lineStartPos = documentText.lastIndexOf('\n', contentPos) + 1;
                const lineEndPos = documentText.indexOf('\n', contentPos);
                const line = documentText.substring(lineStartPos, lineEndPos > -1 ? lineEndPos : documentText.length);
                
                // 如果这一行包含注释标记，不认为是重复
                if (this.isCommentLine(line, language)) {
                    this.logger.debug('补全内容在文档的注释中找到，不视为重复');
                } else {
                    this.logger.debug('补全内容完全包含在文档中，不应用');
                    return '';
                }
            }
            
            // 首先，检测补全内容是否与文档开头有重叠（例如重复的import语句）
            // 这种情况通常是因为模型会重新生成整个文件的开头部分
            let skipLinesCount = 0;
            for (let i = 0; i < Math.min(compLines.length, docLines.length); i++) {
                const compLine = compLines[i].trim();
                const docLine = docLines[i].trim();
                
                // 跳过空行和注释行的比较
                if (compLine === '' || this.isCommentLine(compLine, language) || 
                    docLine === '' || this.isCommentLine(docLine, language)) {
                    continue;
                }
                
                if (compLine === docLine) {
                    skipLinesCount = i + 1;
                } else {
                    break;
                }
            }
            
            // 如果前面部分有重复，从重复部分之后开始取补全内容
            let filteredCompLines = skipLinesCount > 0 
                ? compLines.slice(skipLinesCount) 
                : [...compLines];
            
            // 去除所有空行
            filteredCompLines = filteredCompLines.filter(line => line.trim() !== '');
            
            // 检测并移除与文档末尾重复的部分
            let skipEndLinesCount = 0;
            for (let i = 0; i < Math.min(filteredCompLines.length, docLines.length); i++) {
                const compLine = filteredCompLines[filteredCompLines.length - 1 - i].trim();
                const docLine = docLines[docLines.length - 1 - i].trim();
                
                // 跳过空行和注释行的比较
                if (compLine === '' || this.isCommentLine(compLine, language) || 
                    docLine === '' || this.isCommentLine(docLine, language)) {
                    continue;
                }
                
                if (compLine === docLine) {
                    skipEndLinesCount = i + 1;
                } else {
                    break;
                }
            }
            
            if (skipEndLinesCount > 0) {
                filteredCompLines = filteredCompLines.slice(0, filteredCompLines.length - skipEndLinesCount);
            }
            
            // 特别处理：识别补全内容中的函数定义，与文档中的函数进行比较
            const docFunctions = this.extractFunctions(docLines);
            const compFunctions = this.extractFunctions(filteredCompLines);
            
            // 处理重复函数
            const finalCompLines: string[] = [];
            let inFunction = false;
            let currentFunctionName = '';
            
            for (let i = 0; i < filteredCompLines.length; i++) {
                const line = filteredCompLines[i];
                const trimmedLine = line.trim();
                
                // 检测函数开始
                if (trimmedLine.startsWith('def ') || 
                    trimmedLine.match(/^(int|void|char|double|float|bool|string|auto|std::string)\s+\w+\s*\(/)) {
                    const funcNameMatch = trimmedLine.match(/def\s+([a-zA-Z0-9_]+)\s*\(/) || 
                                         trimmedLine.match(/\w+\s+([a-zA-Z0-9_]+)\s*\(/);
                    if (funcNameMatch) {
                        currentFunctionName = funcNameMatch[1];
                        inFunction = true;
                        
                        // 检查文档中是否已有相同名称的函数
                        const existingFunc = docFunctions.find(f => f.name === currentFunctionName);
                        if (existingFunc) {
                            // 找到补全中的整个函数定义
                            const compFunc = compFunctions.find(f => f.name === currentFunctionName);
                            if (compFunc) {
                                // 比较函数签名（参数列表）
                                const docFuncFirstLine = docLines[existingFunc.start].trim();
                                const compFuncFirstLine = filteredCompLines[compFunc.start - (skipLinesCount > 0 ? skipLinesCount : 0)].trim();
                                
                                if (docFuncFirstLine === compFuncFirstLine) {
                                    // 完全相同的函数，跳过整个函数
                                    i = compFunc.end - (skipLinesCount > 0 ? skipLinesCount : 0);
                                    inFunction = false;
                                    continue;
                                } else {
                                    // 函数名相同但签名不同（可能是更新版本）
                                    // 在这种情况下，我们跳过文档中的旧函数版本，使用补全中的新版本
                                    // 但是不在这里添加，而是在最终处理中处理替换
                                    this.logger.debug(`发现更新版本的函数: ${currentFunctionName}`);
                                }
                            }
                        }
                    }
                }
                
                // 检测函数结束
                if (inFunction && (i === filteredCompLines.length - 1 || 
                    (filteredCompLines[i+1].trim().length === 0 && 
                     (i+2 >= filteredCompLines.length || !filteredCompLines[i+2].startsWith(' '))))) {
                    inFunction = false;
                }
                
                // 如果不是函数内部，检查行是否与文档中已有内容重复
                if (!inFunction) {
                    if (trimmedLine.length === 0) continue; // 跳过空行
                    
                    // 检查这一行是否与文档中的某行完全相同，但排除注释中的匹配
                    const isDuplicate = docLines.some(docLine => {
                        const trimmedDocLine = docLine.trim();
                        // 如果是注释行，不视为重复
                        if (this.isCommentLine(trimmedDocLine, language)) {
                            return false;
                        }
                        return trimmedDocLine === trimmedLine;
                    });
                    
                    if (!isDuplicate) {
                        finalCompLines.push(line);
                    }
                } else {
                    // 在函数内部，我们保留所有行
                    finalCompLines.push(line);
                }
            }
            
            // 特别处理main代码块
            const mainBlockStart = finalCompLines.findIndex(line => 
                line.trim().startsWith('if __name__ == "__main__"') || 
                line.trim().startsWith('int main(')
            );
            
            if (mainBlockStart !== -1) {
                // 检查文档中是否已有main代码块
                const docMainStart = docLines.findIndex(line => 
                    line.trim().startsWith('if __name__ == "__main__"') || 
                    line.trim().startsWith('int main(')
                );
                
                if (docMainStart !== -1) {
                    // 找到main块的结束
                    let mainBlockEnd = finalCompLines.length - 1;
                    for (let i = mainBlockStart + 1; i < finalCompLines.length; i++) {
                        const line = finalCompLines[i];
                        if (line.trim() === '}') {
                            mainBlockEnd = i;
                            break;
                        }
                    }
                    
                    // 从补全内容中移除main块
                    finalCompLines.splice(mainBlockStart, mainBlockEnd - mainBlockStart + 1);
                    
                    this.logger.debug(`移除了重复的main代码块，从行${mainBlockStart}到${mainBlockEnd}`);
                }
            }
            
            // 额外的重复内容检测
            // 这会检测连续的多行重复
            for (let i = 0; i < finalCompLines.length; i++) {
                if (finalCompLines[i].trim().length === 0) continue;
                
                // 尝试查找3行或更多行的连续匹配
                if (i + 2 < finalCompLines.length) {
                    const chunk = finalCompLines.slice(i, i + 3);
                    const trimmedChunk = chunk.map(line => line.trim()).filter(line => line.length > 0);
                    
                    // 只有当chunk中有足够的非空行时才检查
                    if (trimmedChunk.length >= 2) {
                        // 在文档中查找这个块
                        for (let j = 0; j <= docLines.length - trimmedChunk.length; j++) {
                            // 排除注释块
                            if (this.isCommentLine(docLines[j], language)) {
                                continue;
                            }
                            
                            const docChunk = docLines.slice(j, j + trimmedChunk.length);
                            const trimmedDocChunk = docChunk.map(line => line.trim()).filter(line => line.length > 0);
                            
                            if (trimmedChunk.length === trimmedDocChunk.length &&
                                trimmedChunk.every((line, index) => line === trimmedDocChunk[index])) {
                                // 找到重复块，移除所有行
                                finalCompLines.splice(i, chunk.length);
                                i--; // 回退索引，因为我们移除了当前行
                                break;
                            }
                        }
                    }
                }
            }
            
            // 处理可能的import语句重复
            const importLines = finalCompLines.filter(line => 
                line.trim().startsWith('import ') || 
                line.trim().startsWith('from ') || 
                line.trim().startsWith('#include ')
            );
            
            for (const importLine of importLines) {
                const importStatement = importLine.trim();
                // 检查这个import语句是否已存在于文档中
                if (docLines.some(line => line.trim() === importStatement)) {
                    // 移除重复的import语句
                    const index = finalCompLines.findIndex(line => line.trim() === importStatement);
                    if (index !== -1) {
                        finalCompLines.splice(index, 1);
                    }
                }
            }
            
            // 最终输出
            let result = finalCompLines.join('\n');
            
            // 如果结果只有空白字符，不应用
            if (result.trim().length === 0) {
                this.logger.debug('去重后内容为空，不应用');
                return '';
            }
            
            // 输出去重结果统计
            const originalLineCount = compLines.length;
            const finalLineCount = finalCompLines.length;
            const duplicateLines = originalLineCount - finalLineCount;
            const duplicateRate = duplicateLines > 0 ? Math.round((duplicateLines / originalLineCount) * 100) : 0;
            this.logger.debug(`重复检测完成: 原始行数=${originalLineCount}, 去重后行数=${finalLineCount}, 重复行数=${duplicateLines}, 重复率=${duplicateRate}%`);
            
            return result;
        } catch (error) {
            this.logger.error('去重过程中出错', error);
            return completionText; // 出错时返回原文本
        }
    }
    
    /**
     * 从代码行中提取函数定义信息
     * @param lines 代码行
     * @returns 函数定义信息数组
     */
    private extractFunctions(lines: string[]): Array<{name: string, start: number, end: number}> {
        const functions: Array<{name: string, start: number, end: number}> = [];
        let currentFunction: {name: string, start: number} | null = null;
        let indentLevel = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
                continue;
            }
            
            // 检测函数定义
            if (trimmedLine.startsWith('def ')) {
                const match = trimmedLine.match(/def\s+([a-zA-Z0-9_]+)\s*\(/);
                if (match) {
                    // 如果已经在处理一个函数，先结束它
                    if (currentFunction) {
                        functions.push({
                            name: currentFunction.name,
                            start: currentFunction.start,
                            end: i - 1
                        });
                    }
                    
                    // 开始新函数
                    currentFunction = {
                        name: match[1],
                        start: i
                    };
                    
                    // 计算缩进级别
                    indentLevel = line.search(/\S/);
                }
            }
            // 检测函数结束
            else if (currentFunction && 
                    (i === lines.length - 1 || // 文件结束
                     (line.search(/\S/) <= indentLevel && line.search(/\S/) >= 0))) { // 缩进减少
                functions.push({
                    name: currentFunction.name,
                    start: currentFunction.start,
                    end: i - 1
                });
                currentFunction = null;
            }
        }
        
        // 处理最后一个函数
        if (currentFunction) {
            functions.push({
                name: currentFunction.name,
                start: currentFunction.start,
                end: lines.length - 1
            });
        }
        
        return functions;
    }

    /**
     * 在指定位置直接应用补全（供外部调用）
     */
    public async applyCompletionAtPosition(document: vscode.TextDocument, position: vscode.Position): Promise<void> {
        try {
            // 只有当前有活动编辑器时才能应用补全
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
                this.logger.debug('没有合适的编辑器应用补全');
                return;
            }
            
            // 收集上下文
            const context = this.collectContext(document, position);
            if (!context) {
                this.logger.debug('无法收集补全上下文');
                return;
            }
            
            // 调用Ollama API获取补全
            this.logger.debug('调用Ollama API获取补全内容');
            const completionText = await this.client.getCompletion(context);
            
            if (!completionText || completionText.trim().length === 0) {
                this.logger.debug('获取到的补全内容为空');
                return;
            }
            
            // 处理补全文本
            const lineText = document.lineAt(position.line).text;
            const textBeforeCursor = lineText.substring(0, position.character);
            let processedText = completionText;
            
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
            
            // 如果补全文本包含当前行的文本，移除这部分
            if (processedText.startsWith(textBeforeCursor)) {
                processedText = processedText.substring(textBeforeCursor.length);
            }
            
            // 直接应用补全内容
            this.applyCompletion(editor, position, processedText);
            
            // 保存结果用于后续操作
            this.lastCompletionResult = completionText;
            this.lastContext = context.prompt || '';
            this.lastPosition = position;
        } catch (error) {
            this.logger.error('应用补全时出错', error);
        }
    }

    /**
     * 获取触发补全的字符
     */
    public getTriggerCharacters(): string[] {
        return ['#', '.', '(', ' ', '\n'];
    }

    /**
     * 提供代码补全项
     * 这是VSCode补全API的入口方法
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null> {
        // 记录调用详细信息
        this.logger.debug(`补全被触发: 文件=${document.fileName}, 位置=${position.line}:${position.character}, 触发原因=${context.triggerKind}, 触发字符='${context.triggerCharacter || ''}'`);
        
        // 检查插件是否已注册
        if (!this.isRegisteredFlag) {
            this.logger.debug('补全提供程序未注册，跳过补全');
            return null;
        }
        
        // 检查文件类型是否支持
        if (!this.isFileTypeSupported(document)) {
            this.logger.debug(`文件类型 ${document.languageId} 不支持，跳过补全`);
            return null;
        }
        
        try {
            const lineText = document.lineAt(position.line).text;
            const textBeforeCursor = lineText.substring(0, position.character);
            
            this.logger.debug(`光标前文本: "${textBeforeCursor}"`);
            
            // 放宽补全触发条件
            // 只有当行完全为空且不是由回车键触发时才不触发补全
            if (textBeforeCursor.trim() === '') {
                // 检查是否由回车键触发
                const isEnterKeyTrigger = context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter && 
                                         context.triggerCharacter === '\n';
                
                if (!isEnterKeyTrigger) {
                    this.logger.debug('当前行完全为空，不是由回车键触发，不触发补全');
                    return null;
                }
                
                // 如果是回车键触发且当前行为空，检查上一行内容以提供智能补全
                if (position.line > 0) {
                    const previousLineText = document.lineAt(position.line - 1).text.trim();
                    this.logger.debug(`回车键触发补全，上一行内容: "${previousLineText}"`);
                    
                    // 如果上一行为空，仍然不触发补全
                    if (previousLineText === '') {
                        this.logger.debug('上一行也为空，不触发补全');
                        return null;
                    }
                } else {
                    this.logger.debug('当前是文件第一行且为空，不触发补全');
                    return null;
                }
            }
            
            // 总是尝试生成补全，不再检查上下文长度
            this.logger.debug('开始生成补全...');
            const completionList = await this.generateCompletions(document, position, token);
            
            if (completionList.items.length > 0) {
                for (let i = 0; i < Math.min(completionList.items.length, 3); i++) {
                    const item = completionList.items[i];
                    this.logger.debug(`补全项 #${i+1}: label="${item.label}", kind=${item.kind}, preselect=${item.preselect}`);
                    if (item.insertText instanceof vscode.SnippetString) {
                        this.logger.debug(`补全项 #${i+1} 插入文本(SnippetString): ${item.insertText.value}`);
                    } else if (typeof item.insertText === 'string') {
                        this.logger.debug(`补全项 #${i+1} 插入文本(String): ${item.insertText}`);
                    } else {
                        this.logger.debug(`补全项 #${i+1} 没有insertText或类型未知`);
                    }
                }
                return completionList;
            } else {
                this.logger.debug('没有生成补全项，返回null');
                return null;
            }
        } catch (error) {
            this.logger.error('生成补全时出错', error);
            return null;
        }
    }

    /**
     * 生成补全内容
     */
    private async generateCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionList> {
        // 检查是否取消
        if (token.isCancellationRequested) {
            return new vscode.CompletionList([], false);
        }
        
        // 收集上下文信息
        const context = this.collectContext(document, position);
        if (!context) {
            return new vscode.CompletionList([], false);
        }
        
        // 检查用户是否在注释中
        const isInComment = context.isInComment || false;
        
        // 获取文档内容
        const documentText = document.getText();
        
        // 获取光标位置前后的文本
        const cursorOffset = document.offsetAt(position);
        const prefix = documentText.substring(0, cursorOffset);
        const suffix = documentText.substring(cursorOffset);
        
        // 设置提示前缀
        let promptPrefix = '';
        
        // 设置基本提示前缀
        promptPrefix = `请为以下${context.language}代码补全后续内容。只输出代码，不要解释。上下文:\n`;
        
        // 构建完整提示
        let prompt = promptPrefix + prefix;
        
        // 如果有下文，添加到提示中
        if (suffix.trim().length > 0) {
            prompt += `\n\n下文内容:\n${suffix}`;
        }
        
        // 记录提示内容
        if (this.configManager.isDebugEnabled()) {
            this.logger.debug(`构建的模型提示: ${prompt.substring(0, 200)}...`);
        }
        
        // 检查用户是否在注释中
        context.isInComment = this.isUserInComment(document, position);
        if (context.isInComment) {
            context.commentMode = true; // 添加注释模式标记
        } else {
            context.commentMode = false;
        }
        
        // 添加缓存的相关代码
        if (this.configManager.isCacheEnabled()) {
            const currentText = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
            const language = document.languageId;
            context.relevantCachedCode = await this.cacheManager.findRelevantCode(currentText, language);
        }

        // 请求模型生成补全
        let completionText = null;
        try {
            // 创建上下文信息，包含前面收集的信息
            const contextForClient: any = {
                document: document,
                position: position,
                documentText: document.getText(),
                textBeforeCursor: this.getTextBeforeCursor(document, position),
                importStatements: this.getImportStatements(document),
                fileType: document.languageId,
                filename: document.fileName,
                relevantCachedCode: [],
                previousCompletion: null,
                isInComment: context ? context.isInComment : false,
                prompt: prompt
            };
            
            // 调用Ollama API获取补全
            completionText = await this.client.getCompletion(contextForClient);
        } catch (error) {
            this.logger.error('请求模型生成补全时出错', error);
            completionText = null;
        }
        
        // 如果没有获取到补全内容，返回空列表
        if (!completionText || completionText.trim().length === 0) {
            this.logger.debug('获取到的补全内容为空');
            return new vscode.CompletionList([], false);
        }
        
        // 创建补全项
        const completionItems = this.createCompletionItems(completionText, document, position, isInComment);
        // 始终将是否有更多补全设置为false，禁用连续补全
        const completionList = new vscode.CompletionList(completionItems, false);
        
        if (completionText) {
            // 确保无论如何都应用补全
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.uri.toString() === document.uri.toString()) {
                setTimeout(() => {
                    this.logger.debug('直接应用补全内容');
                    this.applyCompletion(editor, position, completionText);
                }, 100);
            }
        }
        
        return completionList;
    }

    /**
     * 收集文档上下文信息
     */
    private collectContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): any {
        this.logger.debug('收集文档上下文信息');
        
        const maxContextLines = this.configManager.getMaxContextLines();
        const includeImports = this.configManager.shouldIncludeImports();
        const includeComments = this.configManager.shouldIncludeComments();
        
        // 获取当前行以上的内容
        const startLine = Math.max(0, position.line - maxContextLines);
        const precedingText = document.getText(
            new vscode.Range(
                new vscode.Position(startLine, 0),
                position
            )
        );
        
        // 获取当前行
        const currentLine = document.lineAt(position.line).text.substring(0, position.character);
        
        // 获取当前文件的部分内容作为上下文
        const fileContext = document.getText(
            new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(
                    Math.min(document.lineCount, position.line + maxContextLines / 2),
                    0
                )
            )
        );
        
        if (this.configManager.shouldLogPerformance()) {
            this.logger.debug(`上下文文本大小: 前文=${precedingText.length}字符, 当前行=${currentLine.length}字符, 文件上下文=${fileContext.length}字符`);
        }
        
        return {
            precedingText,
            currentLine,
            fileContext,
            position,
            document,
            language: document.languageId,
            fileName: document.fileName,
            includeImports,
            includeComments,
            isInComment: false
        };
    }

    /**
     * 创建补全项
     */
    private createCompletionItems(
        completionText: string | null,
        document: vscode.TextDocument,
        position: vscode.Position,
        _isInComment: boolean = false
    ): vscode.CompletionItem[] {
        try {
            if (!completionText || completionText.trim().length === 0) {
                return [];
            }
            
            // 检查补全文本是否已经存在于文档中
            const documentText = document.getText();
            if (documentText.includes(completionText)) {
                return [];
            }
            
            // 分析文档和补全内容，避免重复
            const docLines = documentText.split('\n');
            const compLines = completionText.split('\n');
            
            // 找出新增行（不在文档中的行）
            let newLines = compLines.filter(line => {
                // 忽略空行和只有空格的行
                if (line.trim().length === 0) return false;
                // 检查这行是否已经在文档中存在（精确匹配）
                return !docLines.some(docLine => docLine.trim() === line.trim());
            });
            
            // 如果所有行都已存在，则不提供补全
            if (newLines.length === 0) {
                return [];
            }
            
            this.logger.debug(`创建补全项，最终内容长度: ${completionText.length}字符`);
            
            // 创建补全项
            const item = new vscode.CompletionItem(completionText.split('\n')[0].substring(0, 50) + '...', vscode.CompletionItemKind.Snippet);
            
            // 设置插入文本
            item.insertText = completionText;
            
            // 设置详细信息
            item.detail = '基于上下文的AI补全';
            
            // 设置文档
            item.documentation = new vscode.MarkdownString(
                '```' + document.languageId + '\n' + completionText + '\n```'
            );
            
            // 设置排序文本，确保我们的补全项排在前面
            item.sortText = '0';
            
            // 设置为预选项，让用户可以直接按Tab选择
            item.preselect = true;
            
            // 添加插入规则，让VSCode知道这是纯文本插入
            // 注意：不使用insertTextRules，因为它在某些VSCode版本中可能不存在
            
            // 重要：使用resolveCompletionItem回调而非command
            item.command = {
                title: '应用代码补全',
                command: 'ollamaCompletion.applyCompletion',
                arguments: [document, position, completionText]
            };
            
            return [item];
        } catch (error) {
            this.logger.error('创建补全项时出错', error);
            return [];
        }
    }

    /**
     * 检查是否支持当前文件类型
     */
    private isFileTypeSupported(document: vscode.TextDocument): boolean {
        const fileName = document.fileName.toLowerCase();
        const languageId = document.languageId;
        const enabledTypes = this.configManager.getEnabledFileTypes();
        const disabledTypes = this.configManager.getDisabledFileTypes();
        
        this.logger.debug(`检查文件类型支持: 文件=${fileName}, 语言ID=${languageId}`);
        this.logger.debug(`启用的文件类型: ${JSON.stringify(enabledTypes)}`);
        this.logger.debug(`禁用的文件类型: ${JSON.stringify(disabledTypes)}`);
        
        // 根据文件路径检查是否应该被排除
        // ConfigManager没有getExcludePatterns方法，使用空数组
        const excludePatterns: string[] = [];
        
        for (const pattern of excludePatterns) {
            if (new RegExp(pattern).test(fileName)) {
                this.logger.debug(`文件路径 ${fileName} 匹配排除模式 ${pattern}`);
                return false;
            }
        }
        
        // 如果在禁用列表中，则不支持
        if (disabledTypes.includes(languageId)) {
            this.logger.debug(`语言ID ${languageId} 在禁用列表中`);
            return false;
        }
        
        // 如果启用类型为空或包含 "all"，则所有未明确禁用的类型都支持
        if (enabledTypes.length === 0 || enabledTypes.includes('all')) {
            this.logger.debug(`支持所有未禁用的文件类型`);
            return true;
        }
        
        // 否则，只有在启用列表中的才支持
        const isSupported = enabledTypes.includes(languageId);
        this.logger.debug(`语言ID ${languageId} ${isSupported ? '在' : '不在'}启用列表中`);
        
        // 对于常见编程语言，即使不在启用列表中也支持
        const commonLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby'];
        if (!isSupported && commonLanguages.includes(languageId)) {
            this.logger.debug(`语言ID ${languageId} 是常见编程语言，强制启用支持`);
            return true;
        }
        
        return isSupported;
    }

    /**
     * 判断补全提供器是否已注册
     */
    public isRegistered(): boolean {
        return this.isRegisteredFlag;
    }

    /**
     * 设置注册状态
     */
    public setRegistered(value: boolean): void {
        this.isRegisteredFlag = value;
        this.logger.debug(`CompletionProvider 注册状态设置为: ${value}`);
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        // 清理资源
        if (this.diagnosticsCollection) {
            this.diagnosticsCollection.clear();
            this.diagnosticsCollection.dispose();
        }
        
        this.logger.debug('释放CompletionProvider资源');
        this.isRegisteredFlag = false;
    }

    /**
     * 获取光标前的文本
     */
    private getTextBeforeCursor(document: vscode.TextDocument, position: vscode.Position): string {
        // 获取当前文档从开始到光标位置的所有文本
        return document.getText(new vscode.Range(0, 0, position.line, position.character));
    }

    /**
     * 获取文档中的导入语句
     */
    private getImportStatements(document: vscode.TextDocument): string[] {
        const text = document.getText();
        const importStatements: string[] = [];
        const languageId = document.languageId;
        
        // 根据不同语言匹配导入语句
        let regex: RegExp;
        
        switch (languageId) {
            case 'python':
                regex = /^(?:import|from)\s+.+$/gm;
                break;
            case 'javascript':
            case 'typescript':
            case 'typescriptreact':
            case 'javascriptreact':
                regex = /^(?:import|export)\s+.+$/gm;
                break;
            case 'java':
            case 'kotlin':
            case 'scala':
                regex = /^(?:import|package)\s+.+$/gm;
                break;
            case 'go':
                regex = /^(?:import|package)\s+.+$/gm;
                break;
            default:
                regex = /^(?:import|using|include|require|from|package)\s+.+$/gm;
        }
        
        let match;
        while ((match = regex.exec(text)) !== null) {
            importStatements.push(match[0]);
        }
        
        return importStatements;
    }

    /**
     * 判断用户是否在注释中
     */
    private isUserInComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const languageId = document.languageId;
        
        // 根据不同语言处理注释
        switch (languageId) {
            case 'python':
                // 检查单行注释 #
                const lineText = document.lineAt(position.line).text.substring(0, position.character);
                if (lineText.trim().startsWith('#')) {
                    return true;
                }
                
                // 检查多行注释 ''' 或 """
                const singleLineOffset = document.offsetAt(new vscode.Position(position.line, 0));
                const textUntilPosition = text.substring(0, offset);
                
                const tripleQuoteRegex = /(?:'''|""")[\s\S]*?(?:'''|""")|(?:'''|""")/g;
                let match;
                while ((match = tripleQuoteRegex.exec(textUntilPosition)) !== null) {
                    const commentStart = match.index;
                    const commentEnd = commentStart + match[0].length;
                    
                    if (offset >= commentStart && offset <= commentEnd) {
                        return true;
                    }
                }
                return false;
                
            case 'javascript':
            case 'typescript':
            case 'typescriptreact':
            case 'javascriptreact':
            case 'c':
            case 'cpp':
            case 'csharp':
            case 'java':
            case 'go':
                // 检查单行注释 //
                const jsLineText = document.lineAt(position.line).text.substring(0, position.character);
                if (jsLineText.trim().startsWith('//')) {
                    return true;
                }
                
                // 检查多行注释 /* */
                const singleLineOffset2 = document.offsetAt(new vscode.Position(position.line, 0));
                const textUntilPosition2 = text.substring(0, offset);
                
                const lastCommentStart = textUntilPosition2.lastIndexOf('/*');
                const lastCommentEnd = textUntilPosition2.lastIndexOf('*/');
                
                return lastCommentStart !== -1 && (lastCommentEnd === -1 || lastCommentEnd < lastCommentStart);
                
            default:
                return false;
        }
    }

    /**
     * 计算两个字符串的相似度 (0-1)
     */
    private calculateSimilarity(str1: string, str2: string): number {
        // 去除空格和命名空间前缀进行规范化
        const normalized1 = str1.replace(/\s+/g, ' ').replace(/std::/g, '').trim();
        const normalized2 = str2.replace(/\s+/g, ' ').replace(/std::/g, '').trim();
        
        if (normalized1 === normalized2) return 1.0;
        if (normalized1.length === 0 || normalized2.length === 0) return 0.0;
        
        // 一个简单的相似度计算方法 - 可以替换为更复杂的算法
        const longerStr = normalized1.length > normalized2.length ? normalized1 : normalized2;
        const shorterStr = normalized1.length > normalized2.length ? normalized2 : normalized1;
        
        // 检查子串包含关系
        if (longerStr.includes(shorterStr)) {
            return shorterStr.length / longerStr.length;
        }
        
        // 计算共同字符
        let common = 0;
        for (let i = 0; i < shorterStr.length; i++) {
            if (longerStr.includes(shorterStr[i])) {
                common++;
            }
        }
        
        return common / longerStr.length;
    }
} 