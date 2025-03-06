// 为lru-cache模块添加声明
declare module 'lru-cache' {
    class LRUCache<K, V> {
        constructor(options?: {
            max?: number;
            maxAge?: number;
            length?: (value: V, key: K) => number;
            dispose?: (key: K, value: V) => void;
            stale?: boolean;
            noDisposeOnSet?: boolean;
            updateAgeOnGet?: boolean;
        });
        set(key: K, value: V, maxAge?: number): boolean;
        get(key: K): V | undefined;
        peek(key: K): V | undefined;
        del(key: K): void;
        reset(): void;
        has(key: K): boolean;
        forEach(fn: (value: V, key: K, cache: this) => void, thisArg?: any): void;
        keys(): K[];
        values(): V[];
        length: number;
        itemCount: number;
    }
    export default LRUCache;
}

// 为axios模块添加最小声明（项目中已有@types/axios依赖）
declare module 'axios' {
    export interface AxiosRequestConfig {
        url?: string;
        method?: string;
        baseURL?: string;
        headers?: any;
        params?: any;
        data?: any;
        timeout?: number;
        responseType?: string;
    }

    export interface AxiosResponse<T = any> {
        data: T;
        status: number;
        statusText: string;
        headers: any;
        config: AxiosRequestConfig;
        request?: any;
    }

    export interface AxiosError<T = any> extends Error {
        config: AxiosRequestConfig;
        code?: string;
        request?: any;
        response?: AxiosResponse<T>;
        isAxiosError: boolean;
        toJSON: () => object;
    }

    export interface AxiosInstance {
        (config: AxiosRequestConfig): Promise<AxiosResponse>;
        (url: string, config?: AxiosRequestConfig): Promise<AxiosResponse>;
        defaults: AxiosRequestConfig;
        get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
        post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
        put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
        delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    }

    export function create(config?: AxiosRequestConfig): AxiosInstance;
    export default create;
} 