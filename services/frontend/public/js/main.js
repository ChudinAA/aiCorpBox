/**
 * AI Box Frontend - Main JavaScript
 * Основной файл инициализации и управления приложением
 */

// Глобальное состояние приложения
window.AIBox = {
    config: {
        apiUrl: '/api',
        wsUrl: `ws://${window.location.host}/ws`,
        version: '1.0.0'
    },
    state: {
        gatewayOnline: false,
        wsConnected: false,
        currentTab: 'overview',
        loading: false
    },
    modules: {}
};

// Утилиты
const Utils = {
    /**
     * Показать загрузку
     */
    showLoading(text = 'Обработка запроса...') {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = overlay.querySelector('.loading-text');
        loadingText.textContent = text;
        overlay.classList.add('active');
        AIBox.state.loading = true;
    },

    /**
     * Скрыть загрузку
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.remove('active');
        AIBox.state.loading = false;
    },

    /**
     * Показать уведомление
     */
    showNotification(message, type = 'info') {
        // Создание элемента уведомления
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        // Добавление стилей если не существуют
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    max-width: 400px;
                    padding: 16px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    z-index: 1001;
                    animation: slideInRight 0.3s ease-out;
                }
                .notification-info { background: #dbeafe; border-left: 4px solid #3b82f6; color: #1e40af; }
                .notification-success { background: #dcfce7; border-left: 4px solid #22c55e; color: #166534; }
                .notification-warning { background: #fef3c7; border-left: 4px solid #f59e0b; color: #92400e; }
                .notification-error { background: #fee2e2; border-left: 4px solid #ef4444; color: #dc2626; }
                .notification-content { display: flex; justify-content: space-between; align-items: center; }
                .notification-close { 
                    background: none; border: none; font-size: 20px; cursor: pointer; 
                    color: inherit; padding: 0; margin-left: 12px; 
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }

        // Добавление в DOM
        document.body.appendChild(notification);

        // Обработчик закрытия
        const closeBtn = notification.querySelector('.notification-close');
        const closeNotification = () => {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        };

        closeBtn.addEventListener('click', closeNotification);

        // Автоматическое закрытие через 5 секунд
        setTimeout(closeNotification, 5000);
    },

    /**
     * Форматирование даты и времени
     */
    formatDateTime(date) {
        return new Date(date).toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    /**
     * Форматирование JSON для отображения
     */
    formatJSON(obj) {
        return JSON.stringify(obj, null, 2);
    },

    /**
     * Дебаунс функция
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Проверка на мобильное устройство
     */
    isMobile() {
        return window.innerWidth <= 768;
    }
};

// Менеджер статуса подключений
const StatusManager = {
    /**
     * Обновление статуса Gateway
     */
    updateGatewayStatus(isOnline) {
        AIBox.state.gatewayOnline = isOnline;
        const statusElement = document.getElementById('gateway-status');
        const dot = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('.status-text');

        if (isOnline) {
            dot.className = 'status-dot online';
            text.textContent = 'Gateway подключен';
        } else {
            dot.className = 'status-dot offline';
            text.textContent = 'Gateway недоступен';
        }
    },

    /**
     * Обновление статуса WebSocket
     */
    updateWebSocketStatus(isConnected) {
        AIBox.state.wsConnected = isConnected;
        const statusElement = document.getElementById('websocket-status');
        const dot = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('.status-text');

        if (isConnected) {
            dot.className = 'status-dot online';
            text.textContent = 'WebSocket подключен';
        } else {
            dot.className = 'status-dot offline';
            text.textContent = 'WebSocket отключен';
        }
    },

    /**
     * Обновление статуса сервиса
     */
    updateServiceStatus(serviceId, status) {
        const statusElement = document.getElementById(`${serviceId}-service-status`);
        if (statusElement) {
            statusElement.className = `service-status ${status}`;
            switch (status) {
                case 'online':
                    statusElement.textContent = 'Онлайн';
                    break;
                case 'offline':
                    statusElement.textContent = 'Офлайн';
                    break;
                case 'loading':
                    statusElement.textContent = 'Проверка...';
                    break;
                default:
                    statusElement.textContent = 'Неизвестно';
            }
        }
    },

    /**
     * Проверка всех сервисов
     */
    async checkAllServices() {
        const services = ['gateway', 'ollama', 'rag', 'agents', 'postgres', 'monitoring'];
        
        for (const service of services) {
            this.updateServiceStatus(service, 'loading');
        }

        try {
            const response = await AIBox.modules.api.get('/gateway/health');
            if (response.success) {
                this.updateGatewayStatus(true);
                
                // Обновление статусов на основе ответа Gateway
                const servicesData = response.data.services || {};
                services.forEach(service => {
                    const isOnline = servicesData[service] === 'connected' || 
                                   servicesData[service] === 'running' ||
                                   servicesData[service] === 'healthy';
                    this.updateServiceStatus(service, isOnline ? 'online' : 'offline');
                });
            } else {
                this.updateGatewayStatus(false);
                services.forEach(service => {
                    this.updateServiceStatus(service, 'offline');
                });
            }
        } catch (error) {
            console.error('Ошибка проверки сервисов:', error);
            this.updateGatewayStatus(false);
            services.forEach(service => {
                this.updateServiceStatus(service, 'offline');
            });
        }
    }
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Инициализация AI Box Frontend...');

    try {
        // Инициализация модулей
        AIBox.modules.api = new APIClient();
        AIBox.modules.websocket = new WebSocketManager();
        AIBox.modules.tabs = new TabsManager();
        AIBox.modules.chat = new ChatManager();
        AIBox.modules.rag = new RAGManager();
        AIBox.modules.agents = new AgentsManager();
        AIBox.modules.database = new DatabaseManager();
        AIBox.modules.monitoring = new MonitoringManager();

        // Инициализация вкладок
        AIBox.modules.tabs.init();

        // Проверка состояния сервисов
        await StatusManager.checkAllServices();

        // Инициализация WebSocket соединения
        AIBox.modules.websocket.connect();

        // Периодическая проверка статуса (каждые 30 секунд)
        setInterval(() => {
            StatusManager.checkAllServices();
        }, 30000);

        console.log('✅ AI Box Frontend успешно инициализирован');
        Utils.showNotification('AI Box Frontend успешно загружен', 'success');

    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        Utils.showNotification('Ошибка инициализации приложения', 'error');
    }
});

// Обработка ошибок
window.addEventListener('error', (event) => {
    console.error('Глобальная ошибка:', event.error);
    Utils.showNotification('Произошла ошибка в приложении', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Необработанное отклонение промиса:', event.reason);
    Utils.showNotification('Ошибка обработки запроса', 'error');
});

// Экспорт утилит в глобальную область
window.Utils = Utils;
window.StatusManager = StatusManager;