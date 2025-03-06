import axios from 'axios';
import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';
import { Logger } from '../utils/logger';

/**
 * Ollama API客户端
 * 负责与本地运行的Ollama服务通信，发送代码补全请求
 */
export class OllamaClient {
    private logger: Logger;

    constructor(private configManager: ConfigManager) {
        this.logger = Logger.getInstance();
    }

    /**
     * 获取代码补全
     * @param context 上下文信息
     * @returns 补全结果文本
     */
    public async getCompletion(context: any): Promise<string | null> {
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
            } else {
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
            const headers: Record<string, string> = {};
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
                        } catch (parseError) {
                            this.logger.debug(`解析响应行时出错: ${parseError.message}, 行内容: ${line.substring(0, 50)}...`);
                        }
                    }
                    
                    this.logger.debug(`从流式响应中提取的完整内容, 长度: ${completionText.length}`);
                    
                    // 检查是否为空或者只有代码块标记
                    if (completionText.trim() === '```' || completionText.trim() === '``' || completionText.trim().length <= 3) {
                        this.logger.debug(`流式响应提取内容过短或只有代码块标记，尝试备用方法`);
                        completionText = '';
                    }
                } catch (error) {
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
                } catch (error) {
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
                } else {
                    // 尝试使用cleanJsonResponse方法
                    try {
                        const cleanedJson = this.cleanJsonResponse(responseText);
                        const jsonObj = JSON.parse(cleanedJson);
                        if (jsonObj.response) {
                            completionText = jsonObj.response;
                            this.logger.debug(`从清理后的JSON中提取到response，长度: ${completionText.length}`);
                        } else {
                            // 如果没有response字段，尝试提取任何内容
                            completionText = this.extractAnyContent(responseText);
                            this.logger.debug(`尝试提取任何内容，结果长度: ${completionText ? completionText.length : 0}`);
                        }
                    } catch (error) {
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
                } else {
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
            } else {
                this.logger.debug(`没有有效的补全结果`);
            }
            
            return processedCompletion;
        } catch (error) {
            this.logger.error(`获取补全时出错: ${error.message}`, error);
            return null;
        }
    }

    /**
     * 清理JSON响应中的格式问题
     */
    private cleanJsonResponse(text: string): string {
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
                } catch (e) {
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
                        this.logger.debug(`组合了${i+1}行形成有效JSON`);
                        break;
                    } catch (e) {
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
        } else if (closeBracesCount > openBracesCount) {
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
            } else {
                cleaned = '{' + cleaned;
            }
        }
        
        if (!cleaned.endsWith('}')) {
            this.logger.debug('添加结束大括号');
            const lastBrace = cleaned.lastIndexOf('}');
            if (lastBrace >= 0) {
                cleaned = cleaned.substring(0, lastBrace + 1);
            } else {
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
            .replace(/[\u0000-\u001F]+/g, ' ')            // 替换控制字符
            .replace(/([^\\])"/g, '$1\\"')               // 转义未转义的引号
            .replace(/^([^{]*)({.*)$/, '$2')             // 移除前导非JSON文本
            .replace(/^{([^:]*):/, '{"response":');      // 尝试修复响应格式
        
        // 确保响应包含response字段
        if (!cleaned.includes('"response"')) {
            this.logger.debug('添加缺失的response字段');
            
            // 尝试提取任何文本作为响应
            const textMatch = cleaned.match(/"([^"]{5,})"/);
            if (textMatch && textMatch[1]) {
                cleaned = `{"response": "${textMatch[1].replace(/"/g, '\\"')}"}`;
            } else {
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
    private buildPrompt(context: any): string {
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
        } else {
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
    private postProcessCompletion(completionText: string, context: any): string {
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
                    .replace(/function\s+([a-zA-Z0-9_]+)\s*\(/g, 'def $1(')  // function转def
                    .replace(/var\s+|let\s+|const\s+/g, '')  // 移除变量声明
                    .replace(/this\./g, 'self.')  // this替换为self
                    .replace(/===|==/g, '==')  // 严格等于转换
                    .replace(/!==|!=/g, '!=')  // 严格不等于转换
                    .replace(/;/g, '')  // 移除分号
                    .replace(/true/g, 'True')  // 布尔值转换
                    .replace(/false/g, 'False')
                    .replace(/null/g, 'None');
            }
        } else if (fileType === 'javascript' || fileType === 'typescript') {
            // 检查JS/TS文件中是否包含Python代码特征
            const pyFeatures = /def\s+|elif\s+|self\.|:\s*$/m;
            if (pyFeatures.test(completionText)) {
                this.logger.debug(`检测到${fileType}文件中返回了疑似Python代码，尝试修复`);
                
                // 简单转换尝试
                completionText = completionText
                    .replace(/def\s+([a-zA-Z0-9_]+)\s*\(/g, 'function $1(')  // def转function
                    .replace(/elif\s+/g, 'else if (')  // elif转else if
                    .replace(/self\./g, 'this.')  // self替换为this
                    .replace(/True/g, 'true')  // 布尔值转换
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
    private cleanJsonWrappedCode(text: string): string {
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
                } catch (e) {
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
        } catch (error) {
            this.logger.debug(`清理JSON包装代码时出错: ${error instanceof Error ? error.message : '未知错误'}`);
        }
        
        // 如果没有检测到特殊模式或处理失败，返回原始文本
        return text;
    }

    /**
     * 检测当前是否在多行注释中
     */
    private isInMultilineComment(text: string, language: string): boolean {
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
    public async testConnection(): Promise<{success: boolean, message: string, models?: string[]}> {
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
                } catch (jsonError) {
                    this.logger.error(`解析JSON响应时出错: ${jsonError}`);
                    return {
                        success: false,
                        message: `收到无效的JSON响应: ${responseText.substring(0, 100)}...`
                    };
                }
                
                if (data.models) {
                    const models = data.models.map((model: any) => model.name);
                    this.logger.info(`成功连接到 Ollama 服务，发现 ${models.length} 个模型: ${models.join(', ')}`);
                    return {
                        success: true,
                        message: '成功连接到Ollama服务',
                        models
                    };
                } else {
                    this.logger.warn(`响应缺少models字段: ${JSON.stringify(data)}`);
                }
            } else {
                this.logger.warn(`Ollama API响应状态不成功: ${response.status} ${response.statusText}`);
            }
            
            this.logger.warn('已连接到 Ollama 服务，但无法获取模型列表');
            return {
                success: true,
                message: '已连接到Ollama服务，但无法获取模型列表',
                models: []
            };
        } catch (error) {
            this.logger.error(`测试Ollama连接时出错: ${error instanceof Error ? error.message : String(error)}`);
            this.logger.error(`错误堆栈: ${error instanceof Error ? error.stack : '无堆栈'}`);
            
            let errorMessage = '无法连接到Ollama服务';
            
            if (error instanceof Error) {
                const networkError = error as unknown as { code?: string };
                if (networkError.code === 'ECONNREFUSED') {
                    errorMessage = 'Ollama服务未运行或无法访问';
                } else if ('response' in error) {
                    const responseError = error as any;
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
    private extractCompletionDirectly(text: string): string | null {
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
            /"response"\s*:\s*"((?:\\"|[^"])*?)"/,  // 标准response字段
            /"content"\s*:\s*"((?:\\"|[^"])*?)"/,   // 流式响应中的content字段
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
    private extractAnyContent(text: string): string {
        // 1. 移除任何可能的JSON语法
        let content = text.replace(/[{}\[\]"]/g, ' ');
        
        // 2. 找到第一个冒号后的内容
        const colonIndex = content.indexOf(':');
        if (colonIndex > 0) {
            content = content.substring(colonIndex + 1);
        }
        
        // 3. 清理并规范化文本
        content = content
            .replace(/\\n/g, '\n')          // 处理换行符
            .replace(/\s+/g, ' ')           // 压缩空白字符
            .trim();                         // 修剪两端空白
        
        // 4. 如果内容很短，可能是错误信息，返回空字符串
        if (content.length < 5) {
            return '';
        }
        
        return content;
    }
}