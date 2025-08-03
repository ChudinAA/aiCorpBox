/**
 * Agents Manager для AI Box Frontend
 * Управление AI агентами и выполнением задач
 */

class AgentsManager {
    constructor() {
        this.availableAgents = [];
        this.runningTasks = new Map();
        this.taskHistory = [];
        this.elements = {};
        this.initialized = false;
    }

    /**
     * Инициализация Agents менеджера
     */
    init() {
        if (this.initialized) return;

        // Получение элементов DOM
        this.elements = {
            agentsList: document.getElementById('agents-list'),
            agentSelector: document.getElementById('agent-selector'),
            agentTask: document.getElementById('agent-task'),
            executeButton: document.getElementById('execute-agent'),
            agentResult: document.getElementById('agent-result')
        };

        // Проверка наличия элементов
        if (!this.elements.agentsList || !this.elements.agentResult) {
            console.error('❌ Не найдены обязательные элементы Agents');
            return;
        }

        // Привязка обработчиков событий
        this.bindEventHandlers();

        // Загрузка доступных агентов
        this.loadAvailableAgents();

        // Подписка на WebSocket события прогресса агентов
        this.subscribeToAgentEvents();

        this.initialized = true;
        console.log('✅ AgentsManager инициализирован');
    }

    /**
     * Привязка обработчиков событий
     */
    bindEventHandlers() {
        // Выполнение задачи агентом
        if (this.elements.executeButton) {
            this.elements.executeButton.addEventListener('click', () => {
                this.executeAgentTask();
            });
        }

        // Выполнение по Enter в поле задачи
        if (this.elements.agentTask) {
            this.elements.agentTask.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.executeAgentTask();
                }
            });
        }
    }

    /**
     * Подписка на WebSocket события агентов
     */
    subscribeToAgentEvents() {
        if (AIBox.modules.websocket) {
            AIBox.modules.websocket.on('agentProgress', (data) => {
                this.handleAgentProgress(data);
            });

            AIBox.modules.websocket.on('agentComplete', (data) => {
                this.handleAgentComplete(data);
            });

            AIBox.modules.websocket.on('agentError', (data) => {
                this.handleAgentError(data);
            });
        }
    }

    /**
     * Загрузка доступных агентов
     */
    async loadAvailableAgents() {
        try {
            const response = await AIBox.modules.api.getAvailableAgents();

            if (response.success) {
                this.availableAgents = response.data.agents || [];
                this.displayAvailableAgents();
                this.populateAgentSelector();
            } else {
                this.displayAgentsError(response.error);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки агентов:', error);
            this.displayAgentsError(error);
        }
    }

    /**
     * Отображение доступных агентов
     */
    displayAvailableAgents() {
        if (this.availableAgents.length === 0) {
            this.elements.agentsList.innerHTML = `
                <div class="no-agents">
                    <p>Агенты недоступны</p>
                    <p><small>Проверьте подключение к сервису агентов</small></p>
                </div>
            `;
            return;
        }

        const agentsHtml = this.availableAgents.map(agent => `
            <div class="agent-card" data-agent-id="${agent.id}">
                <div class="agent-header">
                    <h4>${agent.name || agent.id}</h4>
                    <span class="agent-status ${agent.status || 'unknown'}">${this.getAgentStatusText(agent.status)}</span>
                </div>
                <p class="agent-description">${agent.description || 'Описание недоступно'}</p>
                <div class="agent-capabilities">
                    <strong>Возможности:</strong>
                    <div class="capabilities-list">
                        ${(agent.capabilities || []).map(cap => `
                            <span class="capability-tag">${cap}</span>
                        `).join('')}
                    </div>
                </div>
                ${agent.tools && agent.tools.length > 0 ? `
                    <div class="agent-tools">
                        <strong>Инструменты:</strong>
                        <div class="tools-list">
                            ${agent.tools.map(tool => `
                                <span class="tool-tag">${tool.name || tool}</span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');

        this.elements.agentsList.innerHTML = agentsHtml;

        // Добавление стилей для агентов
        this.addAgentStyles();
    }

    /**
     * Заполнение селектора агентов
     */
    populateAgentSelector() {
        if (!this.elements.agentSelector) return;

        const options = this.availableAgents.map(agent => 
            `<option value="${agent.id}">${agent.name || agent.id}</option>`
        ).join('');

        this.elements.agentSelector.innerHTML = `
            <option value="">Выберите агента...</option>
            ${options}
        `;
    }

    /**
     * Выполнение задачи агентом
     */
    async executeAgentTask() {
        const agentId = this.elements.agentSelector?.value;
        const task = this.elements.agentTask?.value?.trim();

        if (!agentId) {
            Utils.showNotification('Выберите агента для выполнения задачи', 'warning');
            return;
        }

        if (!task) {
            Utils.showNotification('Введите описание задачи', 'warning');
            return;
        }

        const taskId = this.generateTaskId();
        
        // Добавление задачи в список выполняющихся
        this.runningTasks.set(taskId, {
            id: taskId,
            agentId: agentId,
            task: task,
            startTime: new Date(),
            status: 'running',
            progress: 0,
            steps: []
        });

        // Отображение начала выполнения
        this.displayTaskExecution(taskId);

        try {
            // Получение контекста для задачи
            const context = this.buildTaskContext();

            // Запуск задачи
            const response = await AIBox.modules.api.executeAgentTask(agentId, task, context);

            if (response.success) {
                this.handleTaskSuccess(taskId, response.data);
            } else {
                this.handleTaskError(taskId, response.error);
            }
        } catch (error) {
            console.error('❌ Ошибка выполнения задачи агентом:', error);
            this.handleTaskError(taskId, error);
        }
    }

    /**
     * Отображение выполнения задачи
     */
    displayTaskExecution(taskId) {
        const task = this.runningTasks.get(taskId);
        if (!task) return;

        const agent = this.availableAgents.find(a => a.id === task.agentId);
        const agentName = agent?.name || task.agentId;

        this.elements.agentResult.innerHTML = `
            <div class="task-execution" data-task-id="${taskId}">
                <div class="task-header">
                    <h4>🤖 Выполнение задачи</h4>
                    <div class="task-meta">
                        <span>Агент: ${agentName}</span>
                        <span>Запущено: ${Utils.formatDateTime(task.startTime)}</span>
                    </div>
                </div>
                <div class="task-description">
                    <strong>Задача:</strong> ${task.task}
                </div>
                <div class="task-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${task.progress}%"></div>
                    </div>
                    <span class="progress-text">${task.progress}%</span>
                </div>
                <div class="task-steps" id="task-steps-${taskId}">
                    <div class="step running">
                        <span class="step-icon">⏳</span>
                        <span class="step-text">Инициализация агента...</span>
                    </div>
                </div>
                <div class="task-actions">
                    <button onclick="AIBox.modules.agents.cancelTask('${taskId}')" class="btn-secondary">
                        Отменить задачу
                    </button>
                </div>
            </div>
        `;

        // Добавление стилей для выполнения задач
        this.addTaskExecutionStyles();
    }

    /**
     * Обработка прогресса агента
     */
    handleAgentProgress(data) {
        const taskId = data.task_id;
        const task = this.runningTasks.get(taskId);
        
        if (!task) return;

        // Обновление прогресса
        task.progress = data.progress || 0;
        task.currentStep = data.step;

        // Добавление шага если есть
        if (data.step) {
            task.steps.push({
                timestamp: new Date(),
                step: data.step,
                status: data.step_status || 'running'
            });
        }

        // Обновление UI
        this.updateTaskProgress(taskId, task);
    }

    /**
     * Обновление прогресса задачи в UI
     */
    updateTaskProgress(taskId, task) {
        const progressBar = document.querySelector(`[data-task-id="${taskId}"] .progress-fill`);
        const progressText = document.querySelector(`[data-task-id="${taskId}"] .progress-text`);
        const stepsContainer = document.getElementById(`task-steps-${taskId}`);

        if (progressBar) {
            progressBar.style.width = `${task.progress}%`;
        }

        if (progressText) {
            progressText.textContent = `${task.progress}%`;
        }

        if (stepsContainer && task.steps.length > 0) {
            const latestSteps = task.steps.slice(-5); // Показываем последние 5 шагов
            stepsContainer.innerHTML = latestSteps.map(step => `
                <div class="step ${step.status}">
                    <span class="step-icon">${this.getStepIcon(step.status)}</span>
                    <span class="step-text">${step.step}</span>
                    <span class="step-time">${Utils.formatDateTime(step.timestamp)}</span>
                </div>
            `).join('');
        }
    }

    /**
     * Обработка успешного завершения задачи
     */
    handleTaskSuccess(taskId, data) {
        const task = this.runningTasks.get(taskId);
        if (!task) return;

        task.status = 'completed';
        task.endTime = new Date();
        task.result = data;
        task.progress = 100;

        // Перемещение в историю
        this.taskHistory.push(task);
        this.runningTasks.delete(taskId);

        // Отображение результата
        this.displayTaskResult(task);

        Utils.showNotification('Задача успешно выполнена', 'success');
    }

    /**
     * Обработка ошибки задачи
     */
    handleTaskError(taskId, error) {
        const task = this.runningTasks.get(taskId);
        if (!task) return;

        task.status = 'error';
        task.endTime = new Date();
        task.error = error;

        // Перемещение в историю
        this.taskHistory.push(task);
        this.runningTasks.delete(taskId);

        // Отображение ошибки
        this.displayTaskError(task);

        Utils.showNotification('Ошибка выполнения задачи', 'error');
    }

    /**
     * Отображение результата задачи
     */
    displayTaskResult(task) {
        const agent = this.availableAgents.find(a => a.id === task.agentId);
        const agentName = agent?.name || task.agentId;
        const duration = task.endTime - task.startTime;

        this.elements.agentResult.innerHTML = `
            <div class="task-result success">
                <div class="result-header">
                    <h4>✅ Задача выполнена успешно</h4>
                    <div class="task-meta">
                        <span>Агент: ${agentName}</span>
                        <span>Время выполнения: ${this.formatDuration(duration)}</span>
                    </div>
                </div>
                <div class="task-description">
                    <strong>Задача:</strong> ${task.task}
                </div>
                <div class="task-result-content">
                    <h5>Результат:</h5>
                    <div class="result-data">
                        ${this.formatAgentResult(task.result)}
                    </div>
                </div>
                ${task.result.files && task.result.files.length > 0 ? `
                    <div class="result-files">
                        <h5>Созданные файлы:</h5>
                        <div class="files-list">
                            ${task.result.files.map(file => `
                                <div class="file-item">
                                    <span class="file-name">${file.name}</span>
                                    <a href="${file.url}" target="_blank" class="btn-secondary btn-sm">Скачать</a>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Отображение ошибки задачи
     */
    displayTaskError(task) {
        const agent = this.availableAgents.find(a => a.id === task.agentId);
        const agentName = agent?.name || task.agentId;

        this.elements.agentResult.innerHTML = `
            <div class="task-result error">
                <div class="result-header">
                    <h4>❌ Ошибка выполнения задачи</h4>
                    <div class="task-meta">
                        <span>Агент: ${agentName}</span>
                    </div>
                </div>
                <div class="task-description">
                    <strong>Задача:</strong> ${task.task}
                </div>
                <div class="error-content">
                    <h5>Ошибка:</h5>
                    <div class="error-message">
                        ${task.error.message || 'Неизвестная ошибка'}
                    </div>
                    ${task.error.details ? `
                        <div class="error-details">
                            <strong>Детали:</strong>
                            <pre>${JSON.stringify(task.error.details, null, 2)}</pre>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Форматирование результата агента
     */
    formatAgentResult(result) {
        if (typeof result === 'string') {
            return `<div class="text-result">${result}</div>`;
        }

        if (result.response || result.answer) {
            return `<div class="text-result">${result.response || result.answer}</div>`;
        }

        if (result.data && Array.isArray(result.data)) {
            return `
                <div class="data-result">
                    <table class="result-table">
                        <thead>
                            <tr>
                                ${Object.keys(result.data[0] || {}).map(key => 
                                    `<th>${key}</th>`
                                ).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${result.data.map(row => `
                                <tr>
                                    ${Object.values(row).map(value => 
                                        `<td>${value}</td>`
                                    ).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        return `<pre class="json-result">${JSON.stringify(result, null, 2)}</pre>`;
    }

    /**
     * Отмена выполнения задачи
     */
    async cancelTask(taskId) {
        const task = this.runningTasks.get(taskId);
        if (!task) return;

        if (confirm('Вы действительно хотите отменить выполнение задачи?')) {
            try {
                // Здесь должен быть вызов API для отмены задачи
                // await AIBox.modules.api.cancelAgentTask(taskId);

                task.status = 'cancelled';
                task.endTime = new Date();
                
                this.taskHistory.push(task);
                this.runningTasks.delete(taskId);

                this.elements.agentResult.innerHTML = `
                    <div class="task-result cancelled">
                        <h4>🚫 Задача отменена</h4>
                        <p>Выполнение задачи было прервано пользователем</p>
                    </div>
                `;

                Utils.showNotification('Задача отменена', 'info');
            } catch (error) {
                console.error('❌ Ошибка отмены задачи:', error);
                Utils.showNotification('Ошибка отмены задачи', 'error');
            }
        }
    }

    /**
     * Построение контекста для задачи
     */
    buildTaskContext() {
        return {
            session_id: AIBox.modules.websocket?.sessionId,
            timestamp: new Date().toISOString(),
            user_preferences: {
                language: 'ru',
                output_format: 'detailed'
            }
        };
    }

    /**
     * Получение текста статуса агента
     */
    getAgentStatusText(status) {
        const statusTexts = {
            'active': 'Активен',
            'idle': 'Свободен', 
            'busy': 'Занят',
            'error': 'Ошибка',
            'offline': 'Отключен'
        };
        return statusTexts[status] || 'Неизвестно';
    }

    /**
     * Получение иконки для шага
     */
    getStepIcon(status) {
        const icons = {
            'running': '⏳',
            'completed': '✅',
            'error': '❌',
            'skipped': '⏭️'
        };
        return icons[status] || '📋';
    }

    /**
     * Форматирование длительности
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}ч ${minutes % 60}м ${seconds % 60}с`;
        } else if (minutes > 0) {
            return `${minutes}м ${seconds % 60}с`;
        } else {
            return `${seconds}с`;
        }
    }

    /**
     * Генерация ID задачи
     */
    generateTaskId() {
        return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Отображение ошибки загрузки агентов
     */
    displayAgentsError(error) {
        this.elements.agentsList.innerHTML = `
            <div class="agents-error">
                <h4>❌ Ошибка загрузки агентов</h4>
                <p>${error.message || 'Не удалось загрузить список доступных агентов'}</p>
                <button onclick="AIBox.modules.agents.loadAvailableAgents()" class="btn-secondary">
                    Повторить загрузку
                </button>
            </div>
        `;
    }

    /**
     * Добавление стилей для агентов
     */
    addAgentStyles() {
        if (document.querySelector('#agents-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'agents-styles';
        styles.textContent = `
            .agent-card {
                background: var(--white);
                border: 1px solid var(--gray-200);
                border-radius: var(--radius-md);
                padding: var(--spacing-4);
                margin-bottom: var(--spacing-4);
            }
            .agent-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-2);
            }
            .agent-header h4 {
                color: var(--gray-900);
                margin: 0;
            }
            .agent-status {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: var(--font-size-xs);
                font-weight: 500;
                text-transform: uppercase;
            }
            .agent-status.active { background: var(--success-color); color: white; }
            .agent-status.idle { background: var(--info-color); color: white; }
            .agent-status.busy { background: var(--warning-color); color: white; }
            .agent-status.error { background: var(--error-color); color: white; }
            .agent-status.offline { background: var(--gray-400); color: white; }
            .agent-description {
                color: var(--gray-600);
                margin-bottom: var(--spacing-3);
                line-height: 1.5;
            }
            .capabilities-list, .tools-list {
                display: flex;
                flex-wrap: wrap;
                gap: var(--spacing-1);
                margin-top: var(--spacing-2);
            }
            .capability-tag, .tool-tag {
                background: var(--gray-100);
                color: var(--gray-700);
                padding: 2px 8px;
                border-radius: var(--radius-sm);
                font-size: var(--font-size-xs);
            }
            .tool-tag {
                background: var(--primary-color);
                color: white;
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Добавление стилей для выполнения задач
     */
    addTaskExecutionStyles() {
        if (document.querySelector('#task-execution-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'task-execution-styles';
        styles.textContent = `
            .task-execution, .task-result {
                background: var(--white);
                border: 1px solid var(--gray-200);
                border-radius: var(--radius-md);
                padding: var(--spacing-4);
            }
            .task-header, .result-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-3);
                padding-bottom: var(--spacing-2);
                border-bottom: 1px solid var(--gray-200);
            }
            .task-meta {
                display: flex;
                gap: var(--spacing-4);
                font-size: var(--font-size-sm);
                color: var(--gray-600);
            }
            .task-progress {
                display: flex;
                align-items: center;
                gap: var(--spacing-3);
                margin: var(--spacing-3) 0;
            }
            .progress-bar {
                flex: 1;
                height: 8px;
                background: var(--gray-200);
                border-radius: 4px;
                overflow: hidden;
            }
            .progress-fill {
                height: 100%;
                background: var(--primary-color);
                transition: width 0.3s ease;
            }
            .task-steps {
                margin: var(--spacing-3) 0;
            }
            .step {
                display: flex;
                align-items: center;
                gap: var(--spacing-2);
                padding: var(--spacing-2);
                margin-bottom: var(--spacing-1);
                border-radius: var(--radius-sm);
                font-size: var(--font-size-sm);
            }
            .step.running { background: var(--gray-50); }
            .step.completed { background: var(--success-color)20; }
            .step.error { background: var(--error-color)20; }
            .step-time {
                margin-left: auto;
                color: var(--gray-500);
                font-size: var(--font-size-xs);
            }
            .task-result.success { border-left: 4px solid var(--success-color); }
            .task-result.error { border-left: 4px solid var(--error-color); }
            .task-result.cancelled { border-left: 4px solid var(--warning-color); }
            .result-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: var(--spacing-2);
            }
            .result-table th, .result-table td {
                border: 1px solid var(--gray-200);
                padding: var(--spacing-2);
                text-align: left;
            }
            .result-table th {
                background: var(--gray-50);
                font-weight: 500;
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Получение статистики по агентам
     */
    getAgentsStats() {
        return {
            availableAgents: this.availableAgents.length,
            runningTasks: this.runningTasks.size,
            completedTasks: this.taskHistory.filter(t => t.status === 'completed').length,
            failedTasks: this.taskHistory.filter(t => t.status === 'error').length,
            totalTasks: this.taskHistory.length
        };
    }
}