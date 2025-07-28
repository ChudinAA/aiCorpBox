/**
 * WebSocket Manager для серверной части Frontend Service
 * Управляет проксированием WebSocket сообщений к Gateway
 */

const WebSocket = require('ws');

class WebSocketManager {
  constructor() {
    this.gatewayWs = null;
    this.reconnectInterval = 5000;
    this.maxReconnectAttempts = 10;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
    this.isConnecting = false;
  }

  /**
   * Подключение к Gateway WebSocket
   */
  async connectToGateway() {
    if (this.isConnecting || (this.gatewayWs && this.gatewayWs.readyState === WebSocket.OPEN)) {
      return;
    }

    const gatewayUrl = process.env.GATEWAY_URL || 'http://gateway:5000';
    const wsUrl = gatewayUrl.replace('http', 'ws') + '/ws';

    this.isConnecting = true;

    try {
      console.log(`🔌 Подключение к Gateway WebSocket: ${wsUrl}`);
      
      this.gatewayWs = new WebSocket(wsUrl);

      this.gatewayWs.on('open', () => {
        console.log('✅ WebSocket соединение с Gateway установлено');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.flushMessageQueue();
      });

      this.gatewayWs.on('close', (code, reason) => {
        console.log(`🔌 WebSocket соединение с Gateway закрыто: ${code} ${reason}`);
        this.isConnecting = false;
        this.scheduleReconnect();
      });

      this.gatewayWs.on('error', (error) => {
        console.error('❌ WebSocket ошибка Gateway:', error);
        this.isConnecting = false;
        this.scheduleReconnect();
      });

    } catch (error) {
      console.error('❌ Ошибка подключения к Gateway WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Планирование переподключения
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Превышено максимальное количество попыток переподключения к Gateway');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectInterval * this.reconnectAttempts, 30000);
    
    console.log(`🔄 Попытка переподключения к Gateway ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);
    
    setTimeout(() => {
      this.connectToGateway();
    }, delay);
  }

  /**
   * Отправка накопленных сообщений
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.gatewayWs && this.gatewayWs.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      this.gatewayWs.send(JSON.stringify(message));
    }
  }

  /**
   * Проксирование сообщения к Gateway
   */
  async proxyMessage(data) {
    // Инициализация соединения если не подключен
    if (!this.gatewayWs || this.gatewayWs.readyState !== WebSocket.OPEN) {
      await this.connectToGateway();
    }

    return new Promise((resolve, reject) => {
      const messageId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const messageWithId = { ...data, frontend_message_id: messageId };

      // Если соединение активно - отправляем сразу
      if (this.gatewayWs && this.gatewayWs.readyState === WebSocket.OPEN) {
        this.gatewayWs.send(JSON.stringify(messageWithId));

        // Настройка обработчика ответа
        const responseHandler = (message) => {
          try {
            const response = JSON.parse(message);
            if (response.frontend_message_id === messageId) {
              this.gatewayWs.removeListener('message', responseHandler);
              resolve(response);
            }
          } catch (error) {
            console.error('❌ Ошибка парсинга ответа Gateway:', error);
          }
        };

        this.gatewayWs.on('message', responseHandler);

        // Таймаут для ответа
        setTimeout(() => {
          this.gatewayWs.removeListener('message', responseHandler);
          resolve({
            type: 'error',
            message: 'Timeout: Gateway не ответил в течение 30 секунд',
            frontend_message_id: messageId
          });
        }, 30000);

      } else {
        // Добавляем в очередь если не подключены
        this.messageQueue.push(messageWithId);
        resolve({
          type: 'queued',
          message: 'Сообщение добавлено в очередь, ожидание подключения к Gateway',
          frontend_message_id: messageId
        });
      }
    });
  }

  /**
   * Отправка чат сообщения через WebSocket
   */
  async sendChatMessage(message, serviceType = 'general') {
    return this.proxyMessage({
      type: 'chat_message',
      message,
      service_type: serviceType,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Запрос статуса агента
   */
  async requestAgentStatus(agentId) {
    return this.proxyMessage({
      type: 'agent_status_request',
      agent_id: agentId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Подписка на обновления поиска RAG
   */
  async subscribeToRAGUpdates(searchId) {
    return this.proxyMessage({
      type: 'rag_subscribe',
      search_id: searchId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Получение системных уведомлений
   */
  async requestSystemNotifications() {
    return this.proxyMessage({
      type: 'system_notifications_request',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Проверка статуса соединения
   */
  isConnected() {
    return this.gatewayWs && this.gatewayWs.readyState === WebSocket.OPEN;
  }

  /**
   * Закрытие соединения
   */
  disconnect() {
    if (this.gatewayWs) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Предотвращаем переподключение
      this.gatewayWs.close(1000, 'Frontend service shutdown');
      this.gatewayWs = null;
    }
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      gatewayUrl: process.env.GATEWAY_URL || 'http://gateway:5000'
    };
  }
}

module.exports = WebSocketManager;