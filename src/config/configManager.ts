import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * 配置管理器
 * 负责读取和管理插件配置项
 */
export class ConfigManager {
    // 配置前缀
    private readonly configPrefix = 'ollamaCodeCompletion';
    
    // 缓存配置值
    private cachedConfig: {
        enabled: boolean;
        triggerDelay: number;
        apiUrl: string;
        modelName: string;
        temperature: number;
        maxTokens: number;
        maxContextLines: number;
        surroundingLines: number;
        includeImports: boolean;
        includeComments: boolean;
        cacheEnabled: boolean;
        retentionPeriodHours: number;
        maxSnippets: number;
        enabledFileTypes: string[];
        disabledFileTypes: string[];
        debugEnabled: boolean;
        logLevel: string;
        logPerformance: boolean;
        adaptToProjectSize: boolean;
    } = {
        enabled: true,
        triggerDelay: 300,
        apiUrl: 'http://localhost:11434',
        modelName: 'codellama:7b',
        temperature: 0.3,
        maxTokens: 300,
        maxContextLines: 100,
        surroundingLines: 5,
        includeImports: true,
        includeComments: true,
        cacheEnabled: true,
        retentionPeriodHours: 24,
        maxSnippets: 1000,
        enabledFileTypes: ['.js', '.ts', '.py', '.java', '*'],
        disabledFileTypes: ['.md', '.txt'],
        debugEnabled: false,
        logLevel: 'info',
        logPerformance: false,
        adaptToProjectSize: true
    };
    
    private logger: Logger;
    
    constructor() {
        this.cachedConfig = this.loadConfig();
        this.logger = Logger.getInstance();
    }
    
    /**
     * 加载配置
     */
    private loadConfig() {
        const config = vscode.workspace.getConfiguration(this.configPrefix);
        
        return {
            enabled: this.getConfigValue('general.enabled', true),
            triggerDelay: this.getConfigValue('general.triggerDelay', 300),
            apiUrl: this.getConfigValue('model.url', 'http://localhost:11434'),
            modelName: this.getConfigValue('model.name', 'codellama:7b'),
            temperature: this.getConfigValue('model.temperature', 0.3),
            maxTokens: this.getConfigValue('model.maxTokens', 300),
            maxContextLines: this.getConfigValue('context.maxLines', 100),
            surroundingLines: this.getConfigValue('context.surroundingLines', 5),
            includeImports: this.getConfigValue('context.includeImports', true),
            includeComments: this.getConfigValue('context.includeComments', true),
            cacheEnabled: this.getConfigValue('cache.enabled', true),
            retentionPeriodHours: this.getConfigValue('cache.retentionPeriodHours', 24),
            maxSnippets: this.getConfigValue('cache.maxSnippets', 1000),
            enabledFileTypes: this.getConfigValue('fileTypes.enabled', ['.js', '.ts', '.py', '.java', '*']),
            disabledFileTypes: this.getConfigValue('fileTypes.disabled', ['.md', '.txt']),
            debugEnabled: this.getConfigValue('debug.enabled', false),
            logLevel: this.getConfigValue('debug.logLevel', 'info'),
            logPerformance: this.getConfigValue('debug.logPerformance', false),
            adaptToProjectSize: this.getConfigValue('advanced.adaptToProjectSize', true)
        };
    }
    
    /**
     * 获取配置值
     */
    private getConfigValue<T>(key: string, defaultValue: T): T {
        const config = vscode.workspace.getConfiguration(this.configPrefix);
        return config.get<T>(key, defaultValue);
    }
    
    /**
     * 重新加载配置
     */
    public reloadConfig(): void {
        this.cachedConfig = this.loadConfig();
    }
    
    /**
     * 更新配置值
     */
    public async updateConfigValue<T>(key: string, value: T, global: boolean = true): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.configPrefix);
        await config.update(key, value, global);
        this.reloadConfig();
    }
    
    /**
     * 是否启用插件
     */
    public isEnabled(): boolean {
        return this.cachedConfig.enabled;
    }
    
    /**
     * 设置插件启用状态
     */
    public async setEnabled(enabled: boolean): Promise<void> {
        await this.updateConfigValue('general.enabled', enabled);
    }
    
    /**
     * 获取触发补全的延迟时间
     */
    public getTriggerDelay(): number {
        return this.cachedConfig.triggerDelay;
    }
    
    /**
     * 获取API URL
     */
    public getApiUrl(): string {
        return this.cachedConfig.apiUrl;
    }
    
    /**
     * 获取模型名称
     */
    public getModelName(): string {
        return this.cachedConfig.modelName;
    }
    
    /**
     * 设置模型名称
     */
    public async setModelName(modelName: string): Promise<void> {
        await this.updateConfigValue('model.name', modelName);
    }
    
    /**
     * 获取温度参数
     * 较低的温度生成更可预测的文本，较高的温度允许更多创造性
     */
    public getTemperature(): number {
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
    public getMaxTokens(): number {
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
    public getMaxContextLines(): number {
        return this.cachedConfig.maxContextLines;
    }
    
    /**
     * 获取回车触发补全时的上下文行数
     */
    public getSurroundingLines(): number {
        return this.cachedConfig.surroundingLines;
    }
    
    /**
     * 是否包含导入语句
     */
    public shouldIncludeImports(): boolean {
        return this.cachedConfig.includeImports;
    }
    
    /**
     * 是否包含注释
     */
    public shouldIncludeComments(): boolean {
        return this.cachedConfig.includeComments;
    }
    
    /**
     * 是否启用缓存
     */
    public isCacheEnabled(): boolean {
        return this.cachedConfig.cacheEnabled;
    }
    
    /**
     * 获取缓存保留时间（小时）
     */
    public getRetentionPeriodHours(): number {
        return this.cachedConfig.retentionPeriodHours;
    }
    
    /**
     * 获取最大缓存条目数
     */
    public getMaxSnippets(): number {
        return this.cachedConfig.maxSnippets;
    }
    
    /**
     * 获取启用的文件类型
     */
    public getEnabledFileTypes(): string[] {
        // 将扩展名格式转换为语言ID格式
        const enabledTypes = this.cachedConfig.enabledFileTypes;
        
        // 如果包含'*'，表示支持所有类型
        if (enabledTypes.includes('*')) {
            return ['all'];
        }
        
        // 将文件扩展名映射到语言ID
        const extensionToLanguageMap: {[key: string]: string} = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.cs': 'csharp',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby',
            '.html': 'html',
            '.css': 'css',
            '.md': 'markdown',
            '.h': 'c',
            '.hpp': 'cpp',
            '.cc': 'cpp',
            '.cxx': 'cpp',
            '.hxx': 'cpp'
        };
        
        // 转换扩展名到语言ID
        const languageIds = enabledTypes.map(ext => 
            extensionToLanguageMap[ext] || ext
        ).filter(id => id); // 过滤掉undefined
        
        // 确保包含基本语言ID
        const essentialLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp'];
        essentialLanguages.forEach(lang => {
            if (!languageIds.includes(lang)) {
                languageIds.push(lang);
            }
        });
        
        return languageIds;
    }
    
    /**
     * 获取禁用的文件类型
     */
    public getDisabledFileTypes(): string[] {
        // 获取禁用类型列表
        const disabledTypes = this.cachedConfig.disabledFileTypes;
        
        // 将文件扩展名映射到语言ID
        const extensionToLanguageMap: {[key: string]: string} = {
            '.md': 'markdown',
            '.txt': 'plaintext',
            '.json': 'json',
            '.xml': 'xml',
            '.log': 'log',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.h': 'c',
            '.hpp': 'cpp',
            '.cc': 'cpp',
            '.cxx': 'cpp',
            '.hxx': 'cpp',
            '.cs': 'csharp',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby',
            '.html': 'html',
            '.css': 'css'
        };
        
        // 转换扩展名到语言ID
        return disabledTypes.map(ext => 
            extensionToLanguageMap[ext] || ext
        ).filter(id => id); // 过滤掉undefined
    }
    
    /**
     * 获取完整配置
     */
    public getFullConfig(): any {
        return { ...this.cachedConfig };
    }

    /**
     * 是否启用调试日志
     */
    public isDebugEnabled(): boolean {
        return this.cachedConfig.debugEnabled;
    }
    
    /**
     * 获取日志级别
     */
    public getLogLevel(): string {
        return this.cachedConfig.logLevel;
    }
    
    /**
     * 是否记录性能指标
     */
    public shouldLogPerformance(): boolean {
        return this.cachedConfig.logPerformance;
    }
    
    /**
     * 启用调试模式
     */
    public async setDebugEnabled(enabled: boolean): Promise<void> {
        await this.updateConfigValue('debug.enabled', enabled);
    }
    
    /**
     * 设置日志级别
     */
    public async setLogLevel(level: string): Promise<void> {
        await this.updateConfigValue('debug.logLevel', level);
    }
    
    /**
     * 是否应根据项目大小自适应调整参数
     */
    private shouldAdaptToProjectSize(): boolean {
        return this.cachedConfig.adaptToProjectSize;
    }
    
    /**
     * 估计项目大小
     * @returns 'small', 'medium', 或 'large'
     */
    private estimateProjectSize(): 'small' | 'medium' | 'large' {
        try {
            // 获取当前打开的所有文件数量作为简单估计
            const openedFileCount = vscode.workspace.textDocuments.length;
            
            // 阈值可以根据需要调整
            if (openedFileCount > 20) {
                return 'large';
            } else if (openedFileCount > 8) {
                return 'medium';
            } else {
                return 'small';
            }
        } catch (error) {
            // 如果无法估计，默认为中型项目
            return 'medium';
        }
    }

    /**
     * 是否启用自适应项目大小
     */
    public isAdaptToProjectSizeEnabled(): boolean {
        return this.cachedConfig.adaptToProjectSize;
    }

    /**
     * 设置自适应项目大小功能
     */
    public async setAdaptToProjectSize(enabled: boolean): Promise<void> {
        this.logger.debug(`${enabled ? '启用' : '禁用'}自适应项目大小功能`);
        await this.updateConfigValue('advanced.adaptToProjectSize', enabled);
    }
} 