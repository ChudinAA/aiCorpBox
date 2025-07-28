#!/usr/bin/env node
/**
 * AI Box Frontend Service
 * Максимально обособленный фронтенд для взаимодействия с AI Box Gateway
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const ApiClient = require('./src/utils/apiClient');
const WebSocketManager = require('./src/utils/websocketManager');

// Инициализация приложения
const app = express();
const PORT = process.env.FRONTEND_PORT || 5000;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:8000';

// Настройка trust proxy для работы через Replit прокси
app.set('trust proxy', true);

// Инициализация API клиента и WebSocket менеджера
const apiClient = new ApiClient(GATEWAY_URL);
const wsManager = new WebSocketManager();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting с учетом proxy
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // максимум 1000 запросов с одного IP
  message: 'Слишком много запросов с вашего IP, попробуйте позже',
  standardHeaders: true, // Возвращать информацию о лимитах в заголовках `RateLimit-*`
  legacyHeaders: false, // Отключить заголовки `X-RateLimit-*`
  // Обработчик для определения IP адреса с учетом proxy
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  // Пропускать успешные запросы к статическим файлам
  skip: (req) => {
    return req.path.startsWith('/js/') || 
           req.path.startsWith('/styles/') || 
           req.path.startsWith('/images/');
  }
});
app.use(limiter);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'aibox-frontend',
    version: '1.0.0',
    gateway_url: GATEWAY_URL
  });
});

// API Routes
app.use('/api', require('./src/routes/api'));

// WebSocket endpoint info
app.get('/api/websocket/info', (req, res) => {
  res.json({
    websocket_url: `ws://localhost:${PORT}/ws`,
    gateway_websocket: `${GATEWAY_URL.replace('http', 'ws')}/ws`,
    status: 'available'
  });
});

// Главная страница - загрузка интерфейса
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Маршрут для всех остальных путей (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Что-то пошло не так'
  });
});

// Запуск сервера
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI Box Frontend запущен на порту ${PORT}`);
  console.log(`📡 Gateway URL: ${GATEWAY_URL}`);
  console.log(`🌐 Интерфейс доступен по адресу: http://localhost:${PORT}`);
});

// WebSocket сервер
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('Новое WebSocket соединение');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      // Проксирование сообщений к Gateway WebSocket
      const response = await wsManager.proxyMessage(data);
      ws.send(JSON.stringify(response));
    } catch (error) {
      console.error('Ошибка WebSocket:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Ошибка обработки сообщения',
        error: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket соединение закрыто');
  });

  ws.on('error', (error) => {
    console.error('Ошибка WebSocket:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Получен сигнал SIGTERM, завершение работы...');
  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Получен сигнал SIGINT, завершение работы...');
  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
});

module.exports = app;