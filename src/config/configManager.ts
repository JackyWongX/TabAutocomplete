import * as vscode from 'vscode';
import { Logger, LogLevel } from '../utils/logger';

/**
 * 配置管理器
 * 负责读取和管理插件配置项
 */
export class ConfigManager {
    // 配置前缀
    private readonly configPrefix = 'tabAutoComplete';
    
    // 缓存配置值
    private cachedConfig: {
        enabled: boolean;
        triggerDelay: number;
        apiUrl: string;
        modelName: string;
        temperature: number;
        maxTokens: number;
        maxContextLines: number;
        includeImports: boolean;
        includeComments: boolean;
        cacheEnabled: boolean;
        retentionPeriodHours: number;
        maxSnippets: number;
        enabledFileTypes: string[] | string;
        disabledFileTypes: string[] | string;
        logLevel: LogLevel;
        adaptToProjectSize: boolean;
    } = {
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
        logLevel: LogLevel.ERROR,
        adaptToProjectSize: true
    };
    
    private logger: Logger;
    private configChangeListener: vscode.Disposable;
    
    constructor() {
        this.logger = Logger.getInstance();
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
    private loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration(this.configPrefix);
        
        // 加载通用设置
        this.cachedConfig.enabled = config.get<boolean>('general.enabled', true);
        this.cachedConfig.triggerDelay = config.get<number>('general.triggerDelay', 300);
        
        // 加载API设置
        this.cachedConfig.apiUrl = config.get<string>('model.url', 'http://localhost:11434');
        this.cachedConfig.modelName = config.get<string>('model.name', 'qwen2.5-coder:1.5b');
        this.cachedConfig.temperature = config.get<number>('model.temperature', 0.3);
        this.cachedConfig.maxTokens = config.get<number>('model.maxTokens', 300);
        
        // 上下文设置
        this.cachedConfig.maxContextLines = config.get<number>('context.maxLines', 100);
        this.cachedConfig.includeImports = config.get<boolean>('context.includeImports', true);
        this.cachedConfig.includeComments = config.get<boolean>('context.includeComments', true);
        
        // 缓存设置
        this.cachedConfig.cacheEnabled = config.get<boolean>('cache.enabled', true);
        this.cachedConfig.retentionPeriodHours = config.get<number>('cache.retentionPeriodHours', 24);
        this.cachedConfig.maxSnippets = config.get<number>('cache.maxSnippets', 1000);
        
        // 文件类型设置
        this.cachedConfig.enabledFileTypes = config.get<string[]>('fileTypes.enabled', ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.html', '.css', '.md', '*']);
        this.cachedConfig.disabledFileTypes = config.get<string[]>('fileTypes.disabled', ['.txt', '.log', '.json', '.yml', '.yaml']);
        
        // 日志设置
        const logLevelStr = config.get<string>('logging.level', 'error');
        this.cachedConfig.logLevel = this.parseLogLevel(logLevelStr);
        
        // 高级设置
        this.cachedConfig.adaptToProjectSize = config.get<boolean>('advanced.adaptToProjectSize', true);
        
        // 更新Logger的日志级别
        this.logger.setLogLevel(this.cachedConfig.logLevel);
        
        this.logger.debug('配置已重新加载');
    }
    
    /**
     * 将字符串转换为LogLevel枚举
     */
    private parseLogLevel(level: string): LogLevel {
        switch (level.toLowerCase()) {
            case 'debug':
                return LogLevel.DEBUG;
            case 'info':
                return LogLevel.INFO;
            case 'warn':
                return LogLevel.WARN;
            case 'error':
                return LogLevel.ERROR;
            case 'none':
                return LogLevel.NONE;
            default:
                return LogLevel.ERROR;
        }
    }
    
    /**
     * 获取日志级别
     */
    public getLogLevel(): LogLevel {
        return this.cachedConfig.logLevel;
    }
    
    /**
     * 设置日志级别
     */
    public async setLogLevel(level: LogLevel): Promise<void> {
        const levelStr = LogLevel[level].toLowerCase();
        await this.updateConfigValue('logging.level', levelStr);
        this.logger.setLogLevel(level);
    }
    
    /**
     * 重新加载配置
     */
    public reloadConfig(): void {
        this.loadConfiguration();
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
        const types = this.cachedConfig.enabledFileTypes;
        
        // 确保返回数组
        if (Array.isArray(types)) {
            return types;
        } else if (typeof types === 'string') {
            // 处理字符串情况
            if (types.includes(',')) {
                return types.split(',').map(t => t.trim());
            } else {
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
    private isFileExtApplicableForLanguage(fileExt: string, language: string): boolean {
        const languageExtMap: {[key: string]: string[]} = {
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
    private matchesFileTypePatterns(fileType: string, patterns: string[]): boolean {
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
    public getDisabledFileTypes(): string[] {
        const types = this.cachedConfig.disabledFileTypes;
        
        // 确保返回数组
        if (Array.isArray(types)) {
            return types;
        } else if (typeof types === 'string') {
            // 处理字符串情况
            if (types.includes(',')) {
                return types.split(',').map(t => t.trim());
            } else {
                return [types];
            }
        }
        
        // 默认禁用列表
        return ['.txt', '.log'];
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
        return this.getLogLevel() === LogLevel.DEBUG;
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

    /**
     * 获取防抖延迟时间（毫秒）
     */
    public getDebounceDelay(): number {
        return vscode.workspace.getConfiguration('tabAutoComplete').get('debounceDelay', 300);
    }

    /**
     * 获取代码补全提示模板
     */
    public getPromptTemplate(): string {
        return vscode.workspace.getConfiguration('tabAutoComplete').get('prompt.template', 
            '你是一个智能代码补全助手。请根据以下上下文补全代码，只需要补全光标处的代码且只返回补全的代码，不要包含任何解释或注释，补全的内容不要包含上下文中已存在的重复的内容。\n\n上下文:\n```\n${prefix}\n```\n\n请直接补全代码:');
    }

    public dispose(): void {
        if (this.configChangeListener) {
            this.configChangeListener.dispose();
        }
    }
} 