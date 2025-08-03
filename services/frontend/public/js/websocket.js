/**
 * WebSocket Manager для реального времени взаимодействия с AI Box Gateway
 */

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectInterval = 5000; // 5 секунд
        this.maxReconnectAttempts = 10;
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.messageQueue = [];
        this.eventHandlers = new Map();
        this.sessionId = this.generateSessionId();
    }

    /**
     * Генерация уникального ID сессии
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Подключение к WebSocket
     */
    connect() {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        this.isConnecting = true;
        const wsUrl = AIBox.config.wsUrl;
        
        console.log(`🔌 Подключение к WebSocket: ${wsUrl}`);

        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (error) {
            console.error('❌ Ошибка создания WebSocket соединения:', error);
            this.handleConnectionError();
        }
    }

    /**
     * Настройка обработчиков событий WebSocket
     */
    setupEventHandlers() {
        this.ws.onopen = (event) => {
            console.log('✅ WebSocket соединение установлено');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            
            // Обновление статуса в UI
            if (window.StatusManager) {
                window.StatusManager.updateWebSocketStatus(true);
            }

            // Отправка накопленных сообщений
            this.flushMessageQueue();

            // Уведомление о подключении
            this.emit('connected', { sessionId: this.sessionId });
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 WebSocket сообщение получено:', data);
                this.handleMessage(data);
            } catch (error) {
                console.error('❌ Ошибка парсинга WebSocket сообщения:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('🔌 WebSocket соединение закрыто:', event.code, event.reason);
            this.isConnecting = false;
            
            // Обновление статуса в UI
            if (window.StatusManager) {
                window.StatusManager.updateWebSocketStatus(false);
            }

            // Попытка переподключения если это не было намеренное закрытие
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }

            this.emit('disconnected', { code: event.code, reason: event.reason });
        };

        this.ws.onerror = (error) => {
            console.error('❌ WebSocket ошибка:', error);
            this.handleConnectionError();
        };
    }

    /**
     * Обработка сообщений от сервера
     */
    handleMessage(data) {
        const { type, ...payload } = data;

        switch (type) {
            case 'chat_response':
                this.emit('chatResponse', payload);
                break;
            case 'agent_progress':
                this.emit('agentProgress', payload);
                break;
            case 'rag_search_result':
                this.emit('ragSearchResult', payload);
                break;
            case 'system_notification':
                this.emit('systemNotification', payload);
                if (window.Utils) {
                    window.Utils.showNotification(payload.message, payload.severity || 'info');
                }
                break;
            case 'error':
                this.emit('error', payload);
                if (window.Utils) {
                    window.Utils.showNotification(payload.message || 'WebSocket ошибка', 'error');
                }
                break;
            default:
                console.log('📨 Неизвестный тип WebSocket сообщения:', type, payload);
                this.emit('message', data);
        }
    }

    /**
     * Отправка сообщения через WebSocket
     */
    send(data) {
        const message = {
            ...data,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString()
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('📤 Отправка WebSocket сообщения:', message);
            this.ws.send(JSON.stringify(message));
            return true;
        } else {
            console.log('📝 WebSocket не подключен, добавление в очередь:', message);
            this.messageQueue.push(message);
            
            // Попытка подключения если не подключены
            if (!this.isConnecting) {
                this.connect();
            }
            return false;
        }
    }

    /**
     * Отправка накопленных сообщений
     */
    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                console.log('📤 Отправка сообщения из очереди:', message);
                this.ws.send(JSON.stringify(message));
            } else {
                // Если соединение снова потеряно, возвращаем сообщение в очередь
                this.messageQueue.unshift(message);
                break;
            }
        }
    }

    /**
     * Планирование переподключения
     */
    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectInterval * this.reconnectAttempts, 30000);
        
        console.log(`🔄 Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);
        
        setTimeout(() => {
            if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                this.connect();
            } else {
                console.log('❌ Превышено максимальное количество попыток переподключения');
                if (window.Utils) {
                    window.Utils.showNotification(
                        'Не удалось восстановить соединение с сервером', 
                        'error'
                    );
                }
            }
        }, delay);
    }

    /**
     * Обработка ошибки соединения
     */
    handleConnectionError() {
        this.isConnecting = false;
        
        if (window.StatusManager) {
            window.StatusManager.updateWebSocketStatus(false);
        }

        if (this.reconnectAttempts === 0) {
            // Первая ошибка - показываем уведомление
            if (window.Utils) {
                window.Utils.showNotification(
                    'Потеряно соединение с сервером. Попытка переподключения...', 
                    'warning'
                );
            }
        }

        this.scheduleReconnect();
    }

    /**
     * Закрытие соединения
     */
    disconnect() {
        if (this.ws) {
            this.reconnectAttempts = this.maxReconnectAttempts; // Предотвращаем переподключение
            this.ws.close(1000, 'Отключение по запросу пользователя');
            this.ws = null;
        }
    }

    /**
     * Проверка статуса соединения
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Регистрация обработчика события
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Удаление обработчика события
     */
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Генерация события
     */
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${event}:`, error);
                }
            });
        }
    }

    // Специализированные методы для AI Box функций

    /**
     * Отправка чат сообщения через WebSocket
     */
    sendChatMessage(message, serviceType = 'general') {
        return this.send({
            type: 'chat_message',
            message,
            service_type: serviceType
        });
    }

    /**
     * Запрос статуса агента
     */
    requestAgentStatus(agentId) {
        return this.send({
            type: 'agent_status_request',
            agent_id: agentId
        });
    }

    /**
     * Подписка на обновления поиска RAG
     */
    subscribeToRAGUpdates(searchId) {
        return this.send({
            type: 'rag_subscribe',
            search_id: searchId
        });
    }

    /**
     * Получение системных уведомлений
     */
    requestSystemNotifications() {
        return this.send({
            type: 'system_notifications_request'
        });
    }
}