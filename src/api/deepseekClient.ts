import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';
import { Logger } from '../utils/logger';
import { BaseClient, ModelConfig, ModelProvider } from './baseClient';

/**
 * DeepSeek API客户端
 * 负责与DeepSeek API通信，发送代码补全请求
 */
export class DeepSeekClient implements BaseClient {
    private logger: Logger;
    private modelConfig: ModelConfig;
    private readonly DEFAULT_API_BASE = 'https://api.deepseek.com/v1';

    constructor(
        private configManager: ConfigManager,
        modelConfig: ModelConfig
    ) {
        this.logger = Logger.getInstance();
        this.modelConfig = modelConfig;
        
        if (!this.modelConfig.apiBase) {
            this.modelConfig.apiBase = this.DEFAULT_API_BASE;
        }
        
        if (!this.modelConfig.apiKey) {
            throw new Error('DeepSeek API需要API密钥');
        }
    }

    /**
     * 获取代码补全
     * @param context 上下文信息
     * @returns 补全结果文本
     */
    public async getCompletion(context: any): Promise<string | null> {
        try {
            const prompt = this.buildPrompt(context);
            
            // 记录提示词（仅在调试模式下）
            if (this.configManager.isDebugEnabled()) {
                this.logger.debug(`完整提示词:\n${prompt}`);
            } else {
                // 仅记录提示词的前100个字符
                this.logger.debug(`提示词前100个字符: ${prompt.substring(0, 100)}...`);
            }
            
            const temperature = this.modelConfig.temperature || this.configManager.getTemperature();
            const maxTokens = this.modelConfig.maxTokens || this.configManager.getMaxTokens();
            
            // 构建请求数据
            const requestData = {
                model: this.modelConfig.model,
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: temperature,
                max_tokens: maxTokens
            };
            
            // 发送请求
            this.logger.debug(`发送请求到 DeepSeek API: ${this.modelConfig.apiBase}/chat/completions`);
            
            const response = await fetch(`${this.modelConfig.apiBase}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.modelConfig.apiKey}`
                },
                body: JSON.stringify(requestData)
            });
            
            // 检查响应状态
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
                return null;
            }
            
            // 解析响应
            const responseData = await response.json();
            
            // 提取补全文本
            const completionText = responseData.choices[0]?.message?.content;
            
            if (!completionText) {
                this.logger.error('API响应中没有找到补全文本');
                return null;
            }
            
            // 处理补全结果
            return this.processCompletionResult(completionText, context);
            
        } catch (error) {
            this.logger.error(`获取补全时出错: ${error}`);
            return null;
        }
    }
    
    /**
     * 测试与API的连接
     * @returns 连接测试结果
     */
    public async testConnection(): Promise<{success: boolean, message: string, models?: string[]}> {
        this.logger.info(`测试与 DeepSeek API 的连接`);
        
        try {
            // 发送简单的模型列表请求
            const response = await fetch(`${this.modelConfig.apiBase}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.modelConfig.apiKey}`
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                return {
                    success: false,
                    message: `连接失败: ${response.status} ${response.statusText} - ${errorText}`
                };
            }
            
            const data = await response.json();
            const models = data.data.map((model: any) => model.id);
            
            return {
                success: true,
                message: '连接成功',
                models: models
            };
            
        } catch (error) {
            return {
                success: false,
                message: `连接失败: ${error}`
            };
        }
    }
    
    /**
     * 生成补全
     * @param prompt 提示词
     * @param options 选项
     * @param signal 中止信号
     * @returns 生成的补全文本
     */
    public async generateCompletion(
        prompt: string, 
        options: { temperature?: number; maxTokens?: number; model?: string }, 
        signal?: AbortSignal
    ): Promise<string | null> {
        try {
            const modelName = options.model || this.modelConfig.model;
            const temperature = options.temperature !== undefined ? options.temperature : this.modelConfig.temperature || this.configManager.getTemperature();
            const maxTokens = options.maxTokens || this.modelConfig.maxTokens || this.configManager.getMaxTokens();
            
            this.logger.debug(`生成补全: 模型=${modelName}, 温度=${temperature}, 最大令牌数=${maxTokens}`);
            
            // 构建请求数据
            const requestData = {
                model: modelName,
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: temperature,
                max_tokens: maxTokens
            };
            
            // 创建请求控制器
            const controller = signal ? undefined : new AbortController();
            const requestSignal = signal || controller?.signal;
            
            // 发送请求
            const response = await fetch(`${this.modelConfig.apiBase}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.modelConfig.apiKey}`
                },
                body: JSON.stringify(requestData),
                signal: requestSignal
            });
            
            // 检查响应状态
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
                return null;
            }
            
            // 解析响应
            const responseData = await response.json();
            
            // 提取补全文本
            const completionText = responseData.choices[0]?.message?.content;
            
            if (!completionText) {
                this.logger.error('API响应中没有找到补全文本');
                return null;
            }
            
            return completionText;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger.info('请求被中止');
                return null;
            }
            
            this.logger.error(`生成补全时出错: ${error}`);
            return null;
        }
    }
    
    /**
     * 构建提示词
     * @param context 上下文信息
     * @returns 构建的提示词
     */
    private buildPrompt(context: any): string {
        // 使用配置管理器中的提示模板
        let promptTemplate = this.configManager.getPromptTemplate();
        
        // 替换模板中的占位符
        return promptTemplate.replace('${prefix}', context.prefix);
    }
    
    /**
     * 处理补全结果
     * @param completionText 补全文本
     * @param _context 上下文信息
     * @returns 处理后的补全文本
     */
    private processCompletionResult(completionText: string, _context: any): string | null {
        if (!completionText) {
            return null;
        }
        
        // 清理补全文本，移除可能的代码块标记
        let cleanedText = completionText;
        
        // 如果补全文本包含代码块标记，提取其中的代码
        const codeBlockRegex = /```(?:\w*\n)?([\s\S]*?)```/;
        const match = cleanedText.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedText = match[1].trim();
        }
        
        return cleanedText;
    }
} 