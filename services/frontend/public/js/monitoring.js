/**
 * Monitoring Manager для AI Box Frontend
 * Управление мониторингом и системными метриками
 */

class MonitoringManager {
    constructor() {
        this.metrics = null;
        this.refreshInterval = null;
        this.elements = {};
        this.initialized = false;
        this.autoRefresh = false;
        this.refreshIntervalMs = 30000; // 30 секунд
    }

    /**
     * Инициализация Monitoring менеджера
     */
    init() {
        if (this.initialized) return;

        // Получение элементов DOM
        this.elements = {
            refreshButton: document.getElementById('refresh-metrics'),
            metricsDisplay: document.getElementById('metrics-display')
        };

        // Проверка наличия элементов
        if (!this.elements.metricsDisplay) {
            console.error('❌ Не найдены обязательные элементы Monitoring');
            return;
        }

        // Привязка обработчиков событий
        this.bindEventHandlers();

        // Загрузка метрик при инициализации
        this.loadSystemMetrics();

        this.initialized = true;
        console.log('✅ MonitoringManager инициализирован');
    }

    /**
     * Привязка обработчиков событий
     */
    bindEventHandlers() {
        // Кнопка обновления метрик
        if (this.elements.refreshButton) {
            this.elements.refreshButton.addEventListener('click', () => {
                this.loadSystemMetrics();
            });
        }
    }

    /**
     * Загрузка системных метрик
     */
    async loadSystemMetrics() {
        this.showLoadingState();

        try {
            const response = await AIBox.modules.api.getSystemMetrics();

            if (response.success) {
                this.metrics = response.data;
                this.displaySystemMetrics();
                Utils.showNotification('Метрики обновлены', 'success');
            } else {
                this.displayMetricsError(response.error);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки метрик:', error);
            this.displayMetricsError(error);
        }
    }

    /**
     * Показ состояния загрузки
     */
    showLoadingState() {
        this.elements.metricsDisplay.innerHTML = `
            <div class="metrics-loading">
                <div class="spinner"></div>
                <p>Загрузка системных метрик...</p>
            </div>
        `;
    }

    /**
     * Отображение системных метрик
     */
    displaySystemMetrics() {
        if (!this.metrics) {
            this.elements.metricsDisplay.innerHTML = `
                <div class="no-metrics">
                    <p>Метрики недоступны</p>
                    <p><small>Нажмите "Обновить метрики" для повторной загрузки</small></p>
                </div>
            `;
            return;
        }

        // Парсинг Prometheus метрик если они в текстовом формате
        const parsedMetrics = this.parsePrometheusMetrics(this.metrics);

        const metricsHtml = `
            <div class="metrics-container">
                ${this.renderMetricsOverview(parsedMetrics)}
                ${this.renderServiceMetrics(parsedMetrics)}
                ${this.renderPerformanceMetrics(parsedMetrics)}
                ${this.renderResourceMetrics(parsedMetrics)}
                ${this.renderAutoRefreshControls()}
            </div>
        `;

        this.elements.metricsDisplay.innerHTML = metricsHtml;

        // Добавление стилей для метрик
        this.addMetricsStyles();

        // Запуск автообновления если включено
        if (this.autoRefresh) {
            this.startAutoRefresh();
        }
    }

    /**
     * Отображение обзора метрик
     */
    renderMetricsOverview(metrics) {
        const lastUpdate = new Date().toLocaleString('ru-RU');
        
        return `
            <div class="metrics-section">
                <h3>📊 Обзор системы</h3>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-value">${metrics.gateway?.requests_total || 'N/A'}</div>
                        <div class="metric-label">Всего запросов</div>
                        <div class="metric-trend">↗️ За все время</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${this.formatDuration(metrics.gateway?.uptime || 0)}</div>
                        <div class="metric-label">Время работы</div>
                        <div class="metric-trend">🚀 Gateway</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.websocket?.active_connections || 0}</div>
                        <div class="metric-label">WebSocket соединений</div>
                        <div class="metric-trend">🔌 Активных</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${this.formatResponseTime(metrics.gateway?.avg_response_time || 0)}</div>
                        <div class="metric-label">Среднее время ответа</div>
                        <div class="metric-trend">⚡ Производительность</div>
                    </div>
                </div>
                <div class="last-update">
                    Последнее обновление: ${lastUpdate}
                </div>
            </div>
        `;
    }

    /**
     * Отображение метрик сервисов
     */
    renderServiceMetrics(metrics) {
        const services = [
            { name: 'Gateway', key: 'gateway', icon: '🌐', port: '5000' },
            { name: 'RAG Service', key: 'rag', icon: '📚', port: '8001' },
            { name: 'Agents Service', key: 'agents', icon: '🤖', port: '8002' },
            { name: 'Ollama', key: 'ollama', icon: '🧠', port: '11434' },
            { name: 'PostgreSQL', key: 'postgres', icon: '💾', port: '5432' },
            { name: 'Qdrant', key: 'qdrant', icon: '🔍', port: '6333' }
        ];

        return `
            <div class="metrics-section">
                <h3>🏗️ Статус сервисов</h3>
                <div class="services-grid">
                    ${services.map(service => {
                        const serviceMetrics = metrics[service.key] || {};
                        const isHealthy = serviceMetrics.status === 'healthy' || serviceMetrics.up === '1';
                        
                        return `
                            <div class="service-metric-card ${isHealthy ? 'healthy' : 'unhealthy'}">
                                <div class="service-header">
                                    <span class="service-icon">${service.icon}</span>
                                    <span class="service-name">${service.name}</span>
                                    <span class="service-status ${isHealthy ? 'online' : 'offline'}">
                                        ${isHealthy ? '🟢' : '🔴'}
                                    </span>
                                </div>
                                <div class="service-details">
                                    <div class="service-port">Порт: ${service.port}</div>
                                    <div class="service-requests">
                                        Запросов: ${serviceMetrics.requests_total || 0}
                                    </div>
                                    <div class="service-response-time">
                                        Ответ: ${this.formatResponseTime(serviceMetrics.avg_response_time || 0)}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Отображение метрик производительности
     */
    renderPerformanceMetrics(metrics) {
        return `
            <div class="metrics-section">
                <h3>⚡ Производительность</h3>
                <div class="performance-grid">
                    <div class="performance-chart">
                        <h4>Время ответа по сервисам</h4>
                        <div class="chart-placeholder">
                            ${this.renderResponseTimeChart(metrics)}
                        </div>
                    </div>
                    <div class="performance-stats">
                        <h4>Статистика запросов</h4>
                        <div class="stats-list">
                            <div class="stat-item">
                                <span class="stat-label">Успешных (2xx):</span>
                                <span class="stat-value success">${metrics.http?.responses_2xx || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Ошибок клиента (4xx):</span>
                                <span class="stat-value warning">${metrics.http?.responses_4xx || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Ошибок сервера (5xx):</span>
                                <span class="stat-value error">${metrics.http?.responses_5xx || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Всего запросов:</span>
                                <span class="stat-value">${metrics.http?.requests_total || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Отображение метрик ресурсов
     */
    renderResourceMetrics(metrics) {
        return `
            <div class="metrics-section">
                <h3>💻 Ресурсы системы</h3>
                <div class="resources-grid">
                    <div class="resource-item">
                        <h4>🖥️ CPU</h4>
                        <div class="resource-bar">
                            <div class="resource-fill" style="width: ${metrics.system?.cpu_usage || 0}%"></div>
                        </div>
                        <div class="resource-value">${metrics.system?.cpu_usage || 0}%</div>
                    </div>
                    <div class="resource-item">
                        <h4>🧠 RAM</h4>
                        <div class="resource-bar">
                            <div class="resource-fill" style="width: ${metrics.system?.memory_usage || 0}%"></div>
                        </div>
                        <div class="resource-value">
                            ${this.formatBytes(metrics.system?.memory_used || 0)} / 
                            ${this.formatBytes(metrics.system?.memory_total || 0)}
                        </div>
                    </div>
                    <div class="resource-item">
                        <h4>💾 Диск</h4>
                        <div class="resource-bar">
                            <div class="resource-fill" style="width: ${metrics.system?.disk_usage || 0}%"></div>
                        </div>
                        <div class="resource-value">
                            ${this.formatBytes(metrics.system?.disk_used || 0)} / 
                            ${this.formatBytes(metrics.system?.disk_total || 0)}
                        </div>
                    </div>
                    <div class="resource-item">
                        <h4>🌐 Сеть</h4>
                        <div class="network-stats">
                            <div>Входящий: ${this.formatBytes(metrics.network?.bytes_in || 0)}/с</div>
                            <div>Исходящий: ${this.formatBytes(metrics.network?.bytes_out || 0)}/с</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Отображение элементов управления автообновлением
     */
    renderAutoRefreshControls() {
        return `
            <div class="metrics-section">
                <h3>🔄 Автообновление</h3>
                <div class="auto-refresh-controls">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="auto-refresh-toggle" ${this.autoRefresh ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        Автоматическое обновление каждые ${this.refreshIntervalMs / 1000} секунд
                    </label>
                    <div class="refresh-interval-controls">
                        <label for="refresh-interval">Интервал (секунды):</label>
                        <select id="refresh-interval">
                            <option value="10" ${this.refreshIntervalMs === 10000 ? 'selected' : ''}>10</option>
                            <option value="30" ${this.refreshIntervalMs === 30000 ? 'selected' : ''}>30</option>
                            <option value="60" ${this.refreshIntervalMs === 60000 ? 'selected' : ''}>60</option>
                            <option value="300" ${this.refreshIntervalMs === 300000 ? 'selected' : ''}>300</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Отображение графика времени ответа
     */
    renderResponseTimeChart(metrics) {
        // Простая визуализация времени ответа в виде горизонтальных полос
        const services = ['gateway', 'rag', 'agents', 'ollama'];
        const maxResponseTime = Math.max(...services.map(s => metrics[s]?.avg_response_time || 0));
        
        return `
            <div class="response-time-chart">
                ${services.map(service => {
                    const responseTime = metrics[service]?.avg_response_time || 0;
                    const percentage = maxResponseTime > 0 ? (responseTime / maxResponseTime) * 100 : 0;
                    
                    return `
                        <div class="chart-bar">
                            <div class="bar-label">${service}</div>
                            <div class="bar-container">
                                <div class="bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <div class="bar-value">${this.formatResponseTime(responseTime)}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * Парсинг Prometheus метрик
     */
    parsePrometheusMetrics(rawMetrics) {
        if (typeof rawMetrics === 'object') {
            return rawMetrics; // Уже распарсено
        }

        // Парсинг текстового формата Prometheus
        const parsed = {};
        const lines = rawMetrics.split('\n');
        
        lines.forEach(line => {
            if (line.startsWith('#') || !line.trim()) return;
            
            const [metricPart, value] = line.split(' ');
            if (!metricPart || !value) return;
            
            // Извлечение имени метрики и лейблов
            const metricMatch = metricPart.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\{.*\})?$/);
            if (!metricMatch) return;
            
            const metricName = metricMatch[1];
            const labels = metricMatch[2] || '';
            
            // Группировка метрик по префиксам
            const serviceName = this.extractServiceFromMetric(metricName);
            if (!parsed[serviceName]) {
                parsed[serviceName] = {};
            }
            
            parsed[serviceName][metricName] = parseFloat(value) || value;
        });

        return parsed;
    }

    /**
     * Извлечение имени сервиса из метрики
     */
    extractServiceFromMetric(metricName) {
        if (metricName.startsWith('aibox_gateway_')) return 'gateway';
        if (metricName.startsWith('aibox_rag_')) return 'rag';
        if (metricName.startsWith('aibox_agents_')) return 'agents';
        if (metricName.startsWith('ollama_')) return 'ollama';
        if (metricName.startsWith('postgres_')) return 'postgres';
        if (metricName.startsWith('qdrant_')) return 'qdrant';
        if (metricName.startsWith('http_')) return 'http';
        if (metricName.startsWith('system_')) return 'system';
        if (metricName.startsWith('network_')) return 'network';
        return 'other';
    }

    /**
     * Запуск автообновления
     */
    startAutoRefresh() {
        this.stopAutoRefresh(); // Остановка предыдущего интервала если есть
        
        this.refreshInterval = setInterval(() => {
            this.loadSystemMetrics();
        }, this.refreshIntervalMs);
        
        console.log(`🔄 Автообновление метрик запущено (${this.refreshIntervalMs / 1000}с)`);
    }

    /**
     * Остановка автообновления
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('⏹️ Автообновление метрик остановлено');
        }
    }

    /**
     * Переключение автообновления
     */
    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        
        if (this.autoRefresh) {
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }
    }

    /**
     * Изменение интервала обновления
     */
    setRefreshInterval(seconds) {
        this.refreshIntervalMs = seconds * 1000;
        
        if (this.autoRefresh) {
            this.startAutoRefresh(); // Перезапуск с новым интервалом
        }
    }

    /**
     * Отображение ошибки метрик
     */
    displayMetricsError(error) {
        this.elements.metricsDisplay.innerHTML = `
            <div class="metrics-error">
                <h4>❌ Ошибка загрузки метрик</h4>
                <p>${error.message || 'Не удалось загрузить системные метрики'}</p>
                <div class="error-details">
                    <p><strong>Возможные причины:</strong></p>
                    <ul>
                        <li>Сервис мониторинга недоступен</li>
                        <li>Prometheus не собирает метрики</li>
                        <li>Проблемы с сетевым подключением</li>
                    </ul>
                </div>
                <button onclick="AIBox.modules.monitoring.loadSystemMetrics()" class="btn-secondary">
                    Повторить загрузку
                </button>
            </div>
        `;
    }

    /**
     * Форматирование времени ответа
     */
    formatResponseTime(milliseconds) {
        if (milliseconds < 1) {
            return `${(milliseconds * 1000).toFixed(0)}μs`;
        } else if (milliseconds < 1000) {
            return `${milliseconds.toFixed(0)}ms`;
        } else {
            return `${(milliseconds / 1000).toFixed(2)}s`;
        }
    }

    /**
     * Форматирование длительности
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}ч ${minutes}м`;
        } else if (minutes > 0) {
            return `${minutes}м ${secs}с`;
        } else {
            return `${secs}с`;
        }
    }

    /**
     * Форматирование байтов
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Добавление стилей для метрик
     */
    addMetricsStyles() {
        if (document.querySelector('#metrics-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'metrics-styles';
        styles.textContent = `
            .metrics-section {
                background: var(--white);
                border: 1px solid var(--gray-200);
                border-radius: var(--radius-lg);
                padding: var(--spacing-6);
                margin-bottom: var(--spacing-6);
            }
            .metrics-section h3 {
                margin-bottom: var(--spacing-4);
                color: var(--gray-900);
            }
            .metrics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: var(--spacing-4);
            }
            .metric-card {
                background: var(--gray-50);
                padding: var(--spacing-4);
                border-radius: var(--radius-md);
                text-align: center;
                border: 1px solid var(--gray-200);
            }
            .metric-value {
                font-size: var(--font-size-2xl);
                font-weight: 700;
                color: var(--primary-color);
                margin-bottom: var(--spacing-2);
            }
            .metric-label {
                font-weight: 500;
                color: var(--gray-700);
                margin-bottom: var(--spacing-1);
            }
            .metric-trend {
                font-size: var(--font-size-sm);
                color: var(--gray-500);
            }
            .services-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: var(--spacing-4);
            }
            .service-metric-card {
                padding: var(--spacing-4);
                border-radius: var(--radius-md);
                border: 1px solid var(--gray-200);
            }
            .service-metric-card.healthy {
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                border-color: var(--success-color);
            }
            .service-metric-card.unhealthy {
                background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                border-color: var(--error-color);
            }
            .service-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-3);
            }
            .service-icon {
                font-size: var(--font-size-lg);
                margin-right: var(--spacing-2);
            }
            .service-name {
                font-weight: 600;
                color: var(--gray-900);
            }
            .service-details {
                font-size: var(--font-size-sm);
                color: var(--gray-600);
            }
            .service-details > div {
                margin-bottom: var(--spacing-1);
            }
            .performance-grid {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: var(--spacing-6);
            }
            .chart-placeholder, .response-time-chart {
                background: var(--gray-50);
                padding: var(--spacing-4);
                border-radius: var(--radius-md);
                min-height: 200px;
            }
            .chart-bar {
                display: flex;
                align-items: center;
                margin-bottom: var(--spacing-2);
                gap: var(--spacing-3);
            }
            .bar-label {
                width: 80px;
                font-size: var(--font-size-sm);
                font-weight: 500;
            }
            .bar-container {
                flex: 1;
                height: 20px;
                background: var(--gray-200);
                border-radius: 10px;
                overflow: hidden;
            }
            .bar-fill {
                height: 100%;
                background: linear-gradient(90deg, var(--success-color), var(--primary-color));
                transition: width 0.5s ease;
            }
            .bar-value {
                width: 60px;
                text-align: right;
                font-size: var(--font-size-sm);
                font-weight: 500;
            }
            .stats-list {
                background: var(--gray-50);
                padding: var(--spacing-4);
                border-radius: var(--radius-md);
            }
            .stat-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: var(--spacing-2);
                padding: var(--spacing-2) 0;
                border-bottom: 1px solid var(--gray-200);
            }
            .stat-item:last-child {
                border-bottom: none;
            }
            .stat-value.success { color: var(--success-color); font-weight: 600; }
            .stat-value.warning { color: var(--warning-color); font-weight: 600; }
            .stat-value.error { color: var(--error-color); font-weight: 600; }
            .resources-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: var(--spacing-4);
            }
            .resource-item {
                background: var(--gray-50);
                padding: var(--spacing-4);
                border-radius: var(--radius-md);
                border: 1px solid var(--gray-200);
            }
            .resource-bar {
                height: 20px;
                background: var(--gray-200);
                border-radius: 10px;
                overflow: hidden;
                margin: var(--spacing-2) 0;
            }
            .resource-fill {
                height: 100%;
                background: linear-gradient(90deg, var(--success-color), var(--warning-color));
                transition: width 0.5s ease;
            }
            .resource-value {
                font-size: var(--font-size-sm);
                color: var(--gray-600);
            }
            .network-stats {
                font-size: var(--font-size-sm);
                color: var(--gray-600);
            }
            .network-stats > div {
                margin-bottom: var(--spacing-1);
            }
            .auto-refresh-controls {
                display: flex;
                gap: var(--spacing-6);
                align-items: center;
                background: var(--gray-50);
                padding: var(--spacing-4);
                border-radius: var(--radius-md);
            }
            .refresh-interval-controls {
                display: flex;
                gap: var(--spacing-2);
                align-items: center;
            }
            .refresh-interval-controls select {
                padding: var(--spacing-1) var(--spacing-2);
                border: 1px solid var(--gray-300);
                border-radius: var(--radius-sm);
            }
            .last-update {
                text-align: center;
                font-size: var(--font-size-sm);
                color: var(--gray-500);
                margin-top: var(--spacing-4);
                padding-top: var(--spacing-3);
                border-top: 1px solid var(--gray-200);
            }
        `;
        document.head.appendChild(styles);

        // Привязка событий для элементов управления
        setTimeout(() => {
            const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
            const refreshInterval = document.getElementById('refresh-interval');

            if (autoRefreshToggle) {
                autoRefreshToggle.addEventListener('change', (e) => {
                    this.autoRefresh = e.target.checked;
                    if (this.autoRefresh) {
                        this.startAutoRefresh();
                    } else {
                        this.stopAutoRefresh();
                    }
                });
            }

            if (refreshInterval) {
                refreshInterval.addEventListener('change', (e) => {
                    this.setRefreshInterval(parseInt(e.target.value));
                });
            }
        }, 100);
    }

    /**
     * Получение статистики мониторинга
     */
    getMonitoringStats() {
        return {
            metricsLoaded: !!this.metrics,
            autoRefresh: this.autoRefresh,
            refreshInterval: this.refreshIntervalMs / 1000,
            lastUpdate: this.metrics ? new Date().toISOString() : null
        };
    }

    /**
     * Очистка ресурсов при уничтожении
     */
    destroy() {
        this.stopAutoRefresh();
        this.initialized = false;
    }
}