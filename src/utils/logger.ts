import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getFileName } from './utils';

/**
 * 日志级别
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4  // 禁用日志
}

/**
 * 日志管理器
 * 负责记录和管理日志，支持输出到文件和控制台
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.INFO;
    private debugEnabled: boolean = false;
    private performanceLoggingEnabled: boolean = false;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Ollama Code Completion');
        this.log(LogLevel.INFO, '日志系统初始化完成');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.log(LogLevel.INFO, `日志级别设置为: ${LogLevel[level]}`);
    }

    public setDebugEnabled(enabled: boolean): void {
        this.debugEnabled = enabled;
        this.log(LogLevel.INFO, `调试模式: ${enabled ? '启用' : '禁用'}`);
    }

    public setPerformanceLoggingEnabled(enabled: boolean): void {
        this.performanceLoggingEnabled = enabled;
        this.log(LogLevel.INFO, `性能日志: ${enabled ? '启用' : '禁用'}`);
    }

    public log(level: LogLevel, message: string, data?: any): void {
        // 当调试模式启用时，总是输出DEBUG级别日志
        if (level === LogLevel.DEBUG && !this.debugEnabled) {
            return; // 不在调试模式且是DEBUG日志，不输出
        }
        
        // 按常规日志级别过滤
        if (level < this.logLevel && level !== LogLevel.DEBUG) {
            return;
        }

        // 获取调用堆栈信息
        const stackTrace = new Error().stack || '';
        const stackLines = stackTrace.split('\n');
        
        // 找到调用log方法的文件和行号
        // 通常第3行包含调用者信息 (0=Error, 1=log方法, 2=debug/info/warn/error方法, 3=实际调用者)
        let callerInfo = '未知位置';
        if (stackLines.length > 3) {
            // 尝试从堆栈中提取文件名和行号
            const callerLine = stackLines[3].trim();
            const match = callerLine.match(/at .+\((.+):(\d+):(\d+)\)/) || 
                          callerLine.match(/at (.+):(\d+):(\d+)/);
            
            if (match) {
                const filePath = match[1];
                const lineNumber = match[2];
                // 只获取文件名，不要完整路径
                const fileName = filePath.split(/[\/\\]/).pop() || filePath;
                callerInfo = `${fileName}:${lineNumber}`;
            }
        }

        const timestamp = new Date().toISOString();
        const levelString = LogLevel[level];
        
        let logMessage = `${timestamp} ${levelString} [${callerInfo}]: ${message}`;
        
        if (data) {
            if (data instanceof Error) {
                logMessage += `\n${data.stack || data.message}`;
            } else if (typeof data === 'object') {
                try {
                    logMessage += `\n${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    logMessage += `\n[无法序列化对象: ${e}]`;
                }
            } else {
                logMessage += `\n${data}`;
            }
        }
        
        // 确保日志消息始终显示在输出通道中
        this.outputChannel.appendLine(logMessage);
        
        // 对于错误和警告，也在控制台中显示
        if (level === LogLevel.ERROR) {
            console.error(logMessage);
        } else if (level === LogLevel.WARN) {
            console.warn(logMessage);
        } else if (level === LogLevel.DEBUG || level === LogLevel.INFO) {
            console.log(logMessage);
        }
    }

    public debug(message: string, data?: any): void {
        if (this.debugEnabled) {
            this.log(LogLevel.DEBUG, message, data);
        }
    }

    public info(message: string, data?: any): void {
        this.log(LogLevel.INFO, message, data);
    }

    public warn(message: string, data?: any): void {
        this.log(LogLevel.WARN, message, data);
    }

    /**
     * 记录错误信息
     * @param message 错误消息
     * @param error 错误对象（可选）
     */
    public error(message: string, error?: any): void {
        this.log(LogLevel.ERROR, message);
        
        // 增强错误处理，确保捕获完整的错误信息
        if (error) {
            // 提取错误信息和堆栈
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : null;
            
            // 记录基本错误信息
            this.log(LogLevel.ERROR, `错误详情: ${errorMessage}`);
            
            // 记录错误堆栈（如果有）
            if (errorStack) {
                this.log(LogLevel.ERROR, `错误堆栈:\n${errorStack}`);
            }
            
            // 如果错误对象包含其他有用信息，也记录下来
            if (typeof error === 'object' && error !== null) {
                try {
                    // 尝试提取可能的额外属性（如HTTP状态码等）
                    const extraProps = Object.keys(error)
                        .filter(key => !['message', 'stack'].includes(key))
                        .reduce((acc, key) => {
                            try {
                                const value = JSON.stringify(error[key]);
                                return `${acc}${key}: ${value}, `;
                            } catch {
                                return `${acc}${key}: [无法序列化], `;
                            }
                        }, '');
                    
                    if (extraProps) {
                        this.log(LogLevel.ERROR, `额外错误信息: ${extraProps}`);
                    }
                } catch (e) {
                    this.log(LogLevel.ERROR, `无法提取错误的额外属性: ${e}`);
                }
            }
            
            // 记录当前调用堆栈，帮助定位问题源头
            try {
                throw new Error('调用堆栈追踪');
            } catch (stackTraceError) {
                const stackTrace = stackTraceError instanceof Error ? stackTraceError.stack : null;
                if (stackTrace) {
                    // 跳过第一行（Error: 调用堆栈追踪）
                    const stackLines = stackTrace.split('\n').slice(1).join('\n');
                    this.log(LogLevel.ERROR, `调用位置:\n${stackLines}`);
                }
            }
        }
    }

    public logPerformance(message: string, data?: any): void {
        if (this.performanceLoggingEnabled) {
            this.log(LogLevel.DEBUG, `[性能] ${message}`, data);
        }
    }

    public showOutputChannel(): void {
        this.outputChannel.show();
    }
} 