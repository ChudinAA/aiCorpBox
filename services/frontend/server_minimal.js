#!/usr/bin/env node
/**
 * AI Box Frontend Service - Минимальная версия для тестирования
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
// Не используем dotenv из-за проблем с переменными окружения

const app = express();
const PORT = process.env.FRONTEND_PORT || 3000;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:5000';

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

// Simple API endpoint
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

// Catch all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI Box Frontend запущен на порту ${PORT}`);
  console.log(`📡 Gateway URL: ${GATEWAY_URL}`);
  console.log(`🌐 Интерфейс доступен по адресу: http://localhost:${PORT}`);
});

module.exports = app;