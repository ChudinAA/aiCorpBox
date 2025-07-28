#!/usr/bin/env node
/**
 * AI Box Frontend Service - Чистая версия без переменных окружения
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Очищаем проблемные переменные окружения
delete process.env.REPLIT_DB_URL;
delete process.env.DATABASE_URL;

const app = express();
const PORT = 3000;
const GATEWAY_URL = 'http://localhost:8000';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'aibox-frontend',
    version: '1.0.0',
    gateway_url: GATEWAY_URL
  });
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'aibox-frontend',
      version: '1.0.0',
      description: 'AI Box Frontend Service - Максимально обособленный интерфейс',
      gateway_url: GATEWAY_URL,
      features: [
        'Чат с AI',
        'RAG поиск и загрузка документов', 
        'AI Agents выполнение задач',
        'Database интерфейс',
        'Системный мониторинг',
        'WebSocket поддержка'
      ]
    },
    timestamp: new Date().toISOString()
  });
});

// Main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    message: err.message
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI Box Frontend запущен на порту ${PORT}`);
  console.log(`📡 Gateway URL: ${GATEWAY_URL}`);  
  console.log(`🌐 Интерфейс доступен по адресу: http://localhost:${PORT}`);
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