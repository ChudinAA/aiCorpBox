/**
 * API Routes для Frontend Service
 * Проксирование запросов к AI Box Gateway с дополнительной обработкой
 */

const express = require('express');
const router = express.Router();
const ApiClient = require('../utils/apiClient');

// Инициализация API клиента
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:5000';
const apiClient = new ApiClient(GATEWAY_URL);

/**
 * Middleware для обработки ошибок API
 */
const handleApiResponse = (req, res, next) => {
  res.apiResponse = (result) => {
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        timestamp: new Date().toISOString()
      });
    } else {
      const statusCode = result.error?.status || 500;
      res.status(statusCode).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'] || 'unknown'
      });
    }
  };
  next();
};

router.use(handleApiResponse);

/**
 * Проверка состояния Gateway
 */
router.get('/gateway/health', async (req, res) => {
  const result = await apiClient.checkHealth();
  res.apiResponse(result);
});

/**
 * Получение информации о доступных сервисах
 */
router.get('/services', async (req, res) => {
  const result = await apiClient.getServicesInfo();
  res.apiResponse(result);
});

/**
 * Чат с AI
 */
router.post('/chat', async (req, res) => {
  const { message, service_type = 'general', session_id } = req.body;
  
  if (!message) {
    return res.status(400).json({
      success: false,
      error: {
        type: 'validation_error',
        message: 'Поле message обязательно для заполнения'
      }
    });
  }

  const result = await apiClient.sendChatMessage(message, service_type, session_id);
  res.apiResponse(result);
});

/**
 * RAG Service Routes
 */

// Загрузка документа
router.post('/rag/upload', async (req, res) => {
  try {
    const file = req.files?.file;
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    
    if (!file) {
      return res.status(400).json({
        success: false,
        error: {
          type: 'validation_error',
          message: 'Файл для загрузки не предоставлен'
        }
      });
    }

    const result = await apiClient.uploadDocument(file, metadata);
    res.apiResponse(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        type: 'processing_error',
        message: 'Ошибка обработки загрузки файла',
        details: error.message
      }
    });
  }
});

// Поиск в документах
router.post('/rag/search', async (req, res) => {
  const { query, filters = {} } = req.body;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: {
        type: 'validation_error',
        message: 'Поле query обязательно для заполнения'
      }
    });
  }

  const result = await apiClient.searchDocuments(query, filters);
  res.apiResponse(result);
});

/**
 * Agents Service Routes
 */

// Получение доступных агентов
router.get('/agents', async (req, res) => {
  const result = await apiClient.getAvailableAgents();
  res.apiResponse(result);
});

// Выполнение задачи агентом
router.post('/agents/execute', async (req, res) => {
  const { agent_type, task, context = {} } = req.body;
  
  if (!agent_type || !task) {
    return res.status(400).json({
      success: false,
      error: {
        type: 'validation_error',
        message: 'Поля agent_type и task обязательны для заполнения'
      }
    });
  }

  const result = await apiClient.executeAgentTask(agent_type, task, context);
  res.apiResponse(result);
});

/**
 * Database Service Routes
 */

// Получение схемы базы данных
router.get('/database/schema', async (req, res) => {
  const result = await apiClient.getDatabaseSchema();
  res.apiResponse(result);
});

// Выполнение SQL запроса
router.post('/database/query', async (req, res) => {
  const { query, safe_mode = true } = req.body;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: {
        type: 'validation_error',
        message: 'Поле query обязательно для заполнения'
      }
    });
  }

  const result = await apiClient.executeDatabaseQuery(query, safe_mode);
  res.apiResponse(result);
});

/**
 * Системные метрики
 */
router.get('/metrics', async (req, res) => {
  const result = await apiClient.getSystemMetrics();
  res.apiResponse(result);
});

/**
 * Универсальный проксирующий эндпоинт
 * Позволяет легко адаптироваться к новым API Gateway endpoints
 */
router.post('/proxy', async (req, res) => {
  const { method = 'GET', path, data, params } = req.body;
  
  if (!path) {
    return res.status(400).json({
      success: false,
      error: {
        type: 'validation_error',
        message: 'Поле path обязательно для проксирования'
      }
    });
  }
  
  console.log(`🔄 Проксирование запроса: ${method.toUpperCase()} ${path}`);
  
  try {
    const result = await apiClient.request(method, path, data, { params });
    res.apiResponse({ success: true, data: result });
  } catch (error) {
    res.apiResponse({ success: false, error });
  }
});

/**
 * Информация о Frontend Service
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'aibox-frontend',
      version: '1.0.0',
      description: 'AI Box Frontend Service - Максимально обособленный интерфейс',
      gateway_url: GATEWAY_URL,
      features: [
        'API проксирование к Gateway',
        'WebSocket поддержка',
        'Автоматическая обработка ошибок',
        'Rate limiting',
        'CORS поддержка',
        'Health monitoring'
      ],
      endpoints: {
        '/api/gateway/health': 'Проверка состояния Gateway',
        '/api/services': 'Информация о доступных сервисах',
        '/api/chat': 'Чат с AI',
        '/api/rag/*': 'RAG сервис endpoints',
        '/api/agents/*': 'AI Agents endpoints',
        '/api/database/*': 'Database сервис endpoints',
        '/api/metrics': 'Системные метрики',
        '/api/proxy/*': 'Универсальное проксирование'
      }
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;