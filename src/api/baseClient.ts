import * as vscode from 'vscode';

/**
 * 模型提供商类型
 */
export enum ModelProvider {
    OLLAMA = 'ollama',
    DEEPSEEK = 'deepseek',
    OPENAI = 'openai',
    SILICONFLOW = 'siliconflow',
    // 可以添加更多提供商
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
    title: string;
    model: string;
    provider: ModelProvider;
    apiKey?: string;
    apiBase?: string;
    contextLength?: number;
    temperature?: number;
    maxTokens?: number;
}

/**
 * 基础API客户端接口
 * 所有模型提供商的客户端都应实现此接口
 */
export interface BaseClient {
    /**
     * 获取代码补全
     * @param context 上下文信息
     * @returns 补全结果文本
     */
    getCompletion(context: any): Promise<string | null>;
    
    /**
     * 测试与API的连接
     * @returns 连接测试结果
     */
    testConnection(): Promise<{success: boolean, message: string, models?: string[]}>;
    
    /**
     * 生成补全
     * @param prompt 提示词
     * @param options 选项
     * @param signal 中止信号
     * @returns 生成的补全文本
     */
    generateCompletion(
        prompt: string, 
        options: { temperature?: number; maxTokens?: number; model?: string }, 
        signal?: AbortSignal
    ): Promise<string | null>;
} 