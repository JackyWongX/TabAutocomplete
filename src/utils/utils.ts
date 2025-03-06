/**
 * utils.ts - 工具函数集合
 */

/**
 * 防抖函数
 * 延迟执行函数，避免频繁调用
 * @param fn 要执行的函数
 * @param delay 延迟时间（毫秒）
 */
export function debounce<T extends (...args: any[]) => Promise<any>>(fn: T, delay: number): (...args: any[]) => Promise<any> {
    let timer: NodeJS.Timeout | null = null;
    
    return function(...args: any[]): Promise<any> {
        return new Promise((resolve) => {
            if (timer) {
                clearTimeout(timer);
            }
            
            timer = setTimeout(async () => {
                const result = await fn(...args);
                resolve(result);
            }, delay);
        });
    };
}

/**
 * 节流函数
 * 限制函数执行频率
 * @param fn 要执行的函数
 * @param limit 限制时间（毫秒）
 */
export function throttle<T extends (...args: any[]) => any>(fn: T, limit: number): (...args: Parameters<T>) => ReturnType<T> | undefined {
    let lastCall = 0;
    let lastResult: ReturnType<T>;
    
    return function(this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
        const now = Date.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            lastResult = fn.apply(this, args);
            return lastResult;
        }
        return undefined;
    };
}

/**
 * 格式化代码
 * 美化代码显示
 * @param code 代码文本
 * @param _language 编程语言(重命名为_language表示不使用)
 */
export function formatCode(code: string, _language: string): string {
    // 简单的代码格式化，真实场景可能需要使用专门的格式化库
    return code.trim();
}

/**
 * 计算文本的相似度
 * 使用Levenshtein距离算法
 * @param str1 第一个字符串
 * @param str2 第二个字符串
 */
export function calculateLevenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    
    // 创建距离矩阵
    const dist: number[][] = [];
    for (let i = 0; i <= m; i++) {
        dist[i] = [];
        dist[i][0] = i;
    }
    
    for (let j = 0; j <= n; j++) {
        dist[0][j] = j;
    }
    
    // 计算距离
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            dist[i][j] = Math.min(
                dist[i - 1][j] + 1,      // 删除
                dist[i][j - 1] + 1,      // 插入
                dist[i - 1][j - 1] + cost // 替换或匹配
            );
        }
    }
    
    return dist[m][n];
}

/**
 * 生成唯一ID
 */
export function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * 安全解析JSON
 * @param text JSON字符串
 * @param defaultValue 解析失败时的默认值
 */
export function safeParseJSON<T>(text: string, defaultValue: T): T {
    try {
        return JSON.parse(text) as T;
    } catch (e) {
        return defaultValue;
    }
}

/**
 * 从路径中提取文件扩展名
 * @param filePath 文件路径
 */
export function getFileExtension(filePath: string): string {
    const match = filePath.match(/\.([^.]+)$/);
    return match ? match[1] : '';
}

/**
 * 从路径中提取文件名
 * @param filePath 文件路径
 */
export function getFileName(filePath: string): string {
    const match = filePath.match(/([^/\\]+)$/);
    return match ? match[1] : '';
} 