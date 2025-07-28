/**
 * API Client для взаимодействия с Backend через REST API
 * Максимально обособленный клиент с автоматической обработкой ошибок
 */

class APIClient {
    constructor() {
        this.baseURL = '/api';
        this.timeout = 30000;
        this.headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
    }

    /**
     * Базовый метод для HTTP запросов
     */
    async request(method, url, data = null, options = {}) {
        const requestOptions = {
            method: method.toUpperCase(),
            headers: { ...this.headers, ...options.headers },
            ...options
        };

        // Добавление данных для POST/PUT запросов
        if (data && !['GET', 'DELETE'].includes(requestOptions.method)) {
            if (data instanceof FormData) {
                // Для FormData не устанавливаем Content-Type
                delete requestOptions.headers['Content-Type'];
                requestOptions.body = data;
            } else {
                requestOptions.body = JSON.stringify(data);
            }
        }

        // Добавление query параметров для GET запросов
        if (data && requestOptions.method === 'GET') {
            const params = new URLSearchParams(data);
            url += `?${params.toString()}`;
        }

        const fullURL = url.startsWith('http') ? url : `${this.baseURL}${url}`;

        try {
            console.log(`🔄 API Request: ${requestOptions.method} ${fullURL}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await fetch(fullURL, {
                ...requestOptions,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseData = await this.handleResponse(response);
            console.log(`✅ API Response: ${response.status} ${fullURL}`);
            
            return responseData;

        } catch (error) {
            console.error(`❌ API Error: ${fullURL}`, error);
            throw this.handleError(error, fullURL);
        }
    }

    /**
     * Обработка ответа сервера
     */
    async handleResponse(response) {
        let data;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            throw {
                status: response.status,
                message: data.error?.message || data.message || `HTTP ${response.status}`,
                data: data
            };
        }

        return data;
    }

    /**
     * Обработка ошибок
     */
    handleError(error, url) {
        if (error.name === 'AbortError') {
            return {
                type: 'timeout',
                message: 'Превышено время ожидания ответа',
                url: url
            };
        }

        if (error.status) {
            return {
                type: 'http_error',
                status: error.status,
                message: error.message,
                data: error.data,
                url: url
            };
        }

        return {
            type: 'network_error',
            message: 'Ошибка сети или недоступность сервера',
            details: error.message,
            url: url
        };
    }

    // HTTP методы
    async get(url, params = null, options = {}) {
        return this.request('GET', url, params, options);
    }

    async post(url, data = null, options = {}) {
        return this.request('POST', url, data, options);
    }

    async put(url, data = null, options = {}) {
        return this.request('PUT', url, data, options);
    }

    async delete(url, options = {}) {
        return this.request('DELETE', url, null, options);
    }

    // Специализированные методы для AI Box API

    /**
     * Проверка здоровья Gateway
     */
    async checkGatewayHealth() {
        return this.get('/gateway/health');
    }

    /**
     * Получение информации о сервисах
     */
    async getServicesInfo() {
        return this.get('/services');
    }

    /**
     * Отправка чат сообщения
     */
    async sendChatMessage(message, serviceType = 'general', sessionId = null) {
        return this.post('/chat', {
            message,
            service_type: serviceType,
            session_id: sessionId
        });
    }

    /**
     * RAG - Загрузка документа
     */
    async uploadDocument(file, metadata = {}) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('metadata', JSON.stringify(metadata));

        return this.post('/rag/upload', formData);
    }

    /**
     * RAG - Поиск в документах
     */
    async searchDocuments(query, filters = {}) {
        return this.post('/rag/search', { query, filters });
    }

    /**
     * Agents - Получение доступных агентов
     */
    async getAvailableAgents() {
        return this.get('/agents');
    }

    /**
     * Agents - Выполнение задачи агентом
     */
    async executeAgentTask(agentType, task, context = {}) {
        return this.post('/agents/execute', {
            agent_type: agentType,
            task,
            context
        });
    }

    /**
     * Database - Получение схемы
     */
    async getDatabaseSchema() {
        return this.get('/database/schema');
    }

    /**
     * Database - Выполнение SQL запроса
     */
    async executeDatabaseQuery(query, safeMode = true) {
        return this.post('/database/query', {
            query,
            safe_mode: safeMode
        });
    }

    /**
     * Получение системных метрик
     */
    async getSystemMetrics() {
        return this.get('/metrics');
    }

    /**
     * Универсальный проксирующий метод
     */
    async proxyRequest(method, path, data = null) {
        return this.request(method, `/proxy/${path}`, data);
    }

    /**
     * Получение информации о Frontend сервисе
     */
    async getFrontendInfo() {
        return this.get('/info');
    }
}

// Класс для обработки ошибок API с пользовательскими уведомлениями
class APIErrorHandler {
    static handle(error, context = '') {
        let message = 'Произошла ошибка';
        let type = 'error';

        switch (error.type) {
            case 'timeout':
                message = 'Превышено время ожидания ответа от сервера';
                break;
            case 'network_error':
                message = 'Ошибка сети. Проверьте подключение к интернету';
                break;
            case 'http_error':
                if (error.status === 400) {
                    message = error.message || 'Неверные данные запроса';
                } else if (error.status === 401) {
                    message = 'Требуется авторизация';
                } else if (error.status === 403) {
                    message = 'Доступ запрещен';
                } else if (error.status === 404) {
                    message = 'Ресурс не найден';
                } else if (error.status === 500) {
                    message = 'Внутренняя ошибка сервера';
                } else if (error.status === 503) {
                    message = 'Сервис временно недоступен';
                } else {
                    message = error.message || `Ошибка сервера (${error.status})`;
                }
                break;
            default:
                message = error.message || 'Неизвестная ошибка';
        }

        if (context) {
            message = `${context}: ${message}`;
        }

        // Показ уведомления пользователю
        if (window.Utils) {
            window.Utils.showNotification(message, type);
        } else {
            console.error(message);
        }

        return { success: false, error: error, message: message };
    }
}

// Глобальная обертка для API вызовов с обработкой ошибок
window.api = {
    async call(apiMethod, ...args) {
        try {
            return await apiMethod.apply(this, args);
        } catch (error) {
            return APIErrorHandler.handle(error);
        }
    }
};