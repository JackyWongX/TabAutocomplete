import { ConfigManager } from '../config/configManager';
import { Logger } from '../utils/logger';
import { BaseClient, ModelConfig, ModelProvider } from './baseClient';
import { OllamaClient } from './ollamaClient';
import { DeepSeekClient } from './deepseekClient';
import { OpenAIClient } from './openaiClient';

/**
 * API客户端工厂类
 * 负责根据配置创建适当的API客户端
 */
export class ClientFactory {
    private logger: Logger;
    
    constructor(private configManager: ConfigManager) {
        this.logger = Logger.getInstance();
    }
    
    /**
     * 创建API客户端
     * @param modelConfig 模型配置
     * @returns API客户端实例
     */
    public createClient(modelConfig: ModelConfig): BaseClient {
        this.logger.debug(`创建API客户端: 提供商=${modelConfig.provider}, 模型=${modelConfig.model}`);
        
        switch (modelConfig.provider) {
            case ModelProvider.OLLAMA:
                return new OllamaClient(this.configManager, modelConfig);
                
            case ModelProvider.DEEPSEEK:
                return new DeepSeekClient(this.configManager, modelConfig);
                
            case ModelProvider.OPENAI:
                return new OpenAIClient(this.configManager, modelConfig);
                
            default:
                this.logger.error(`不支持的模型提供商: ${modelConfig.provider}`);
                throw new Error(`不支持的模型提供商: ${modelConfig.provider}`);
        }
    }
} 