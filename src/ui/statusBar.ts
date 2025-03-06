import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';

/**
 * 状态栏管理器
 * 在VSCode状态栏显示插件状态和提供快速操作
 */
export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    
    constructor(private configManager: ConfigManager) {
        // 创建状态栏项
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100 // 优先级
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
    public updateStatus(): void {
        const isEnabled = this.configManager.isEnabled();
        this.statusBarItem.text = isEnabled ? '$(sparkle) Ollama' : '$(stop) Ollama';
        this.statusBarItem.tooltip = isEnabled ? 'Ollama代码补全已启用 (点击禁用)' : 'Ollama代码补全已禁用 (点击启用)';
    }
    
    /**
     * 获取状态栏项
     * @returns 状态栏项对象
     */
    public getStatusBarItem(): vscode.StatusBarItem {
        return this.statusBarItem;
    }
    
    /**
     * 显示临时信息
     * @param message 要显示的消息
     * @param timeout 显示时间（毫秒）
     */
    public showTemporaryMessage(message: string, timeout: number = 3000): void {
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
    public showRequestInProgress(show: boolean): void {
        if (show) {
            this.statusBarItem.text = `$(sync~spin) Ollama 请求中...`;
            this.statusBarItem.tooltip = '正在向Ollama服务发送请求';
        } else {
            this.updateStatus(); // 恢复正常状态
        }
    }
    
    /**
     * 显示错误状态
     * @param errorMessage 错误消息
     */
    public showError(errorMessage: string): void {
        this.statusBarItem.text = `$(error) Ollama 错误`;
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
    public async toggleEnabled(): Promise<void> {
        const isCurrentlyEnabled = this.configManager.isEnabled();
        await this.configManager.setEnabled(!isCurrentlyEnabled);
        this.updateStatus();
        
        // 显示通知
        vscode.window.showInformationMessage(
            isCurrentlyEnabled 
                ? 'Ollama 代码补全已禁用' 
                : 'Ollama 代码补全已启用'
        );
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        this.statusBarItem.dispose();
    }
} 