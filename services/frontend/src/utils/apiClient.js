/**
 * API Client для взаимодействия с AI Box Gateway
 * Серверная часть для проксирования запросов
 */

const axios = require('axios');

class ApiClient {
  constructor(gatewayUrl) {
    this.gatewayUrl = gatewayUrl;
    this.timeout = 30000;
    this.axiosInstance = axios.create({
      baseURL: gatewayUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AIBox-Frontend/1.0.0'
      }
    });

    // Настройка interceptors
    this.setupInterceptors();
  }

  /**
   * Настройка axios interceptors
   */
  setupInterceptors() {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log(`➡️ HTTP ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log(`⬅️ HTTP ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error(`❌ HTTP Error ${error.response?.status || 'NETWORK'} ${error.config?.url}`);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Универсальный метод для HTTP запросов
   */
  async request(method, url, data = null, options = {}) {
    try {
      const config = {
        method: method.toLowerCase(),
        url: url,
        ...options
      };

      if (data && !['get', 'delete'].includes(config.method)) {
        config.data = data;
      }

      if (data && config.method === 'get') {
        config.params = data;
      }

      const response = await this.axiosInstance(config);
      return {
        success: true,
        data: response.data,
        status: response.status,
        headers: response.headers
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Обработка ошибок
   */
  handleError(error) {
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: {
          type: 'timeout',
          message: 'Timeout: Gateway не отвечает',
          details: 'Превышено время ожидание ответа от Gateway'
        }
      };
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        success: false,
        error: {
          type: 'connection_error',
          message: 'Gateway недоступен',
          details: 'Не удается подключиться к Gateway сервису'
        }
      };
    }

    if (error.response) {
      return {
        success: false,
        error: {
          type: 'http_error',
          status: error.response.status,
          message: error.response.data?.message || error.message,
          details: error.response.data
        }
      };
    }

    return {
      success: false,
      error: {
        type: 'unknown_error',
        message: error.message || 'Неизвестная ошибка',
        details: error.toString()
      }
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
  async checkHealth() {
    return this.get('/health');
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
  async uploadDocument(formData) {
    return this.post('/rag/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
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
   * Кастомный запрос
   */
  async customRequest(method, path, data = null, options = {}) {
    return this.request(method, path, data, options);
  }
}

module.exports = ApiClient;