import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getFileName } from './utils';

/**
 * 日志级别
 */
export enum LogLevel {
    NONE = 0,
    ERROR = 1
}

/**
 * 日志管理器
 * 负责记录和管理日志，支持输出到文件和控制台
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.NONE;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TabAutoComplete');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public error(message: string, error?: any): void {
        if (this.logLevel >= LogLevel.ERROR) {
            const errorMessage = error ? `${message}: ${error.message || error}` : message;
            this.outputChannel.appendLine(`[ERROR] ${errorMessage}`);
        }
        // 始终显示错误通知
        vscode.window.showErrorMessage(message);
    }

    public showOutputChannel(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
} 