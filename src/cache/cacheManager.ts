import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';
import LRUCache from 'lru-cache';
import { Logger } from '../utils/logger';
import { calculateLevenshteinDistance } from '../utils/utils';

/**
 * 代码片段接口
 */
interface CodeSnippet {
    id: string;              // 唯一标识符
    code: string;            // 代码内容
    language: string;        // 编程语言
    timestamp: number;       // 创建时间戳
    context: string;         // 上下文信息（如函数名、类名）
    filePath: string;        // 文件路径
    metadata: {              // 元数据
        tags: string[];      // 关键词标签
        frequency: number;   // 使用频率
    };
}

/**
 * 缓存管理器
 * 负责存储和检索用户最近的代码片段，用于提高补全的相关性
 */
export class CacheManager {
    private static readonly CACHE_KEY = 'ollamaCodeCompletionCache';
    private codeSnippets: CodeSnippet[] = [];
    private lruCache: LRUCache<string, CodeSnippet>;
    private logger: Logger;
    
    constructor(
        private storage: vscode.Memento, 
        private configManager: ConfigManager
    ) {
        this.logger = Logger.getInstance();
        
        // 初始化LRU缓存
        this.lruCache = new LRUCache<string, CodeSnippet>({
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
    private loadCache(): void {
        this.logger.debug('从存储中加载缓存');
        const cachedData = this.storage.get<CodeSnippet[]>(CacheManager.CACHE_KEY, []);
        
        if (cachedData && cachedData.length) {
            this.codeSnippets = cachedData;
            
            // 将缓存的代码片段添加到LRU缓存
            for (const snippet of this.codeSnippets) {
                this.lruCache.set(snippet.id, snippet);
            }
            
            this.logger.info(`已加载 ${this.codeSnippets.length} 个缓存的代码片段`);
            
            // 清理过期的缓存
            this.cleanExpiredCache();
        } else {
            this.logger.debug('没有找到缓存的代码片段');
        }
    }
    
    /**
     * 清理过期的缓存
     */
    private cleanExpiredCache(): void {
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
            this.logger.info(`已清理 ${expiredCount} 个过期的缓存片段`);
            this.saveCache();
        }
    }
    
    /**
     * 保存缓存到存储
     */
    private saveCache(): void {
        this.logger.debug(`保存 ${this.codeSnippets.length} 个代码片段到存储`);
        this.storage.update(CacheManager.CACHE_KEY, this.codeSnippets);
    }
    
    /**
     * 缓存文档变化
     * 当文档变化时调用此方法，提取并缓存有意义的代码片段
     */
    public cacheDocumentChanges(event: vscode.TextDocumentChangeEvent): void {
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
                const snippet: CodeSnippet = {
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
        } catch (error) {
            this.logger.error(`缓存文档变更时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * 判断是否为有意义的变更
     */
    private isSignificantChange(changes: readonly vscode.TextDocumentContentChangeEvent[]): boolean {
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
    private extractContext(document: vscode.TextDocument, range: vscode.Range): string {
        // 尝试获取包含变更的更大范围（如函数、类定义）
        let contextStart = Math.max(0, range.start.line - 10);
        let contextEnd = Math.min(document.lineCount - 1, range.end.line + 5);
        
        // 获取上下文文本
        const contextRange = new vscode.Range(
            new vscode.Position(contextStart, 0),
            new vscode.Position(contextEnd, document.lineAt(contextEnd).text.length)
        );
        
        return document.getText(contextRange);
    }
    
    /**
     * 提取代码中的关键词标签
     */
    private extractTags(code: string, context: string, language: string): string[] {
        const tags: string[] = [];
        
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
    private extractJavaScriptTags(_code: string, context: string, tags: string[]): void {
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
    private extractPythonTags(_code: string, context: string, tags: string[]): void {
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
    private extractGenericTags(_code: string, context: string, tags: string[]): void {
        // 提取所有可能的标识符
        const identifierMatch = /\b([a-zA-Z][a-zA-Z0-9_]{2,})\b/g;
        
        let match;
        const identifiers = new Set<string>();
        
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
    private isCommonKeyword(word: string): boolean {
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
    public addSnippet(snippet: CodeSnippet): void {
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
        } else {
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
    private findSimilarSnippet(snippet: CodeSnippet): CodeSnippet | undefined {
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
    private calculateSimilarity(code1: string, code2: string): number {
        // 简化的相似度计算，基于最长公共子序列
        const distance = calculateLevenshteinDistance(code1, code2);
        const maxLength = Math.max(code1.length, code2.length);
        
        return maxLength === 0 ? 1 : 1 - (distance / maxLength);
    }
    
    /**
     * 查找与当前上下文相关的代码
     */
    public findRelevantCode(
        currentCode: string, 
        language: string, 
        maxResults: number = 3
    ): string[] {
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
    private calculateRelevanceScore(
        snippet: CodeSnippet,
        currentTags: string[],
        currentCode: string
    ): number {
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
    public clearCache(): void {
        this.logger.info('清空所有缓存的代码片段');
        this.codeSnippets = [];
        this.lruCache.reset();
        this.saveCache();
    }
    
    /**
     * 获取缓存的统计信息
     */
    public getStats(): { snippetCount: number; languageStats: Record<string, number> } {
        const languageStats: Record<string, number> = {};
        
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
    public async get(prefix: string): Promise<string | undefined> {
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
    public async put(prefix: string, completion: string): Promise<void> {
        if (!this.configManager.isCacheEnabled() || !completion || completion.trim().length === 0) {
            return;
        }

        this.logger.debug(`将补全内容存储到缓存中，前缀长度: ${prefix.length}, 补全长度: ${completion.length}`);
        
        // 使用前缀的哈希作为键
        const key = this.hashString(prefix);
        
        // 创建代码片段对象
        const snippet: CodeSnippet = {
            id: key,
            code: completion,
            language: 'unknown', // 这里可以传入实际的语言
            timestamp: Date.now(),
            context: prefix.slice(-200), // 存储前缀的最后200个字符作为上下文
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
        } else {
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
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `hash_${Math.abs(hash).toString(16)}`;
    }
} 