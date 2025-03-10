import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getFileName } from './utils';

/**
 * 日志级别枚举
 * 按照标准日志级别从低到高排序：DEBUG < INFO < WARN < ERROR
 */
export enum LogLevel {
    NONE = 0,    // 不输出任何日志
    DEBUG = 1,   // 调试信息
    INFO = 2,    // 一般信息
    WARN = 3,    // 警告信息
    ERROR = 4    // 错误信息
}

/**
 * 日志管理器
 * 负责记录和管理日志，支持输出到文件和控制台
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.NONE;
    private debugEnabled: boolean = false;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TabAutoComplete');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.log(LogLevel.INFO, `日志级别已设置为: ${LogLevel[level]}`);
    }

    private shouldLog(level: LogLevel): boolean {
        if (level === LogLevel.DEBUG && this.debugEnabled) {
            return true;
        }
        return this.logLevel !== LogLevel.NONE && level <= this.logLevel;
    }

    private formatMessage(level: LogLevel, message: string, data?: any): string {
        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level].padEnd(5);
        let formattedMessage = `[${timestamp}] [${levelStr}] ${message}`;
        
        if (data) {
            if (data instanceof Error) {
                formattedMessage += `\n    ${data.stack || data.message}`;
            } else if (typeof data === 'object') {
                try {
                    formattedMessage += `\n    ${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    formattedMessage += `\n    [无法序列化的对象]`;
                }
            } else {
                formattedMessage += `\n    ${data}`;
            }
        }
        
        return formattedMessage;
    }

    private log(level: LogLevel, message: string, data?: any): void {
        if(level < this.logLevel){return;}
        
        if (this.shouldLog(level)) {
            const formattedMessage = this.formatMessage(level, message, data);
            this.outputChannel.appendLine(formattedMessage);
            
            // 对于警告和错误，同时输出到控制台
            if (level === LogLevel.ERROR) {
                console.error(formattedMessage);
            } else if (level === LogLevel.WARN) {
                console.warn(formattedMessage);
            }
        }
    }

    public debug(message: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, data);
    }

    public info(message: string, data?: any): void {
        this.log(LogLevel.INFO, message, data);
    }

    public warn(message: string, data?: any): void {
        this.log(LogLevel.WARN, message, data);
        // 可选：显示警告通知
        if (this.shouldLog(LogLevel.WARN)) {
            vscode.window.showWarningMessage(message);
        }
    }

    public error(message: string, error?: any): void {
        this.log(LogLevel.ERROR, message, error);
        // 始终显示错误通知
        vscode.window.showErrorMessage(message);
    }

    public setDebugEnabled(enabled: boolean): void {
        this.debugEnabled = enabled;
        this.log(LogLevel.INFO, `调试模式已${enabled ? '启用' : '禁用'}`);
    }

    public showOutputChannel(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
} 