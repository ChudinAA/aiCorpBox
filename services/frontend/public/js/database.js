/**
 * Database Manager для AI Box Frontend
 * Управление базой данных и выполнение SQL запросов
 */

class DatabaseManager {
    constructor() {
        this.databaseSchema = null;
        this.queryHistory = [];
        this.elements = {};
        this.initialized = false;
        this.maxHistorySize = 50;
    }

    /**
     * Инициализация Database менеджера
     */
    init() {
        if (this.initialized) return;

        // Получение элементов DOM
        this.elements = {
            loadSchemaButton: document.getElementById('load-schema'),
            schemaDisplay: document.getElementById('schema-display'),
            sqlQuery: document.getElementById('sql-query'),
            safeMode: document.getElementById('safe-mode'),
            executeButton: document.getElementById('execute-query'),
            queryResult: document.getElementById('query-result')
        };

        // Проверка наличия элементов
        if (!this.elements.schemaDisplay || !this.elements.queryResult) {
            console.error('❌ Не найдены обязательные элементы Database');
            return;
        }

        // Привязка обработчиков событий
        this.bindEventHandlers();

        // Загрузка истории запросов из localStorage
        this.loadQueryHistory();

        // Показ приветственного сообщения
        this.showWelcomeMessage();

        this.initialized = true;
        console.log('✅ DatabaseManager инициализирован');
    }

    /**
     * Привязка обработчиков событий
     */
    bindEventHandlers() {
        // Загрузка схемы базы данных
        if (this.elements.loadSchemaButton) {
            this.elements.loadSchemaButton.addEventListener('click', () => {
                this.loadDatabaseSchema();
            });
        }

        // Выполнение SQL запроса
        if (this.elements.executeButton) {
            this.elements.executeButton.addEventListener('click', () => {
                this.executeQuery();
            });
        }

        // Выполнение запроса по Ctrl+Enter
        if (this.elements.sqlQuery) {
            this.elements.sqlQuery.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.executeQuery();
                }
            });

            // Автодополнение SQL
            this.elements.sqlQuery.addEventListener('input', () => {
                this.handleSQLAutocompletion();
            });
        }

        // Изменение безопасного режима
        if (this.elements.safeMode) {
            this.elements.safeMode.addEventListener('change', (e) => {
                this.updateSafeModeUI(e.target.checked);
            });
        }
    }

    /**
     * Загрузка схемы базы данных
     */
    async loadDatabaseSchema() {
        Utils.showLoading('Загрузка схемы базы данных...');

        try {
            const response = await AIBox.modules.api.getDatabaseSchema();

            if (response.success) {
                this.databaseSchema = response.data;
                this.displayDatabaseSchema();
                Utils.showNotification('Схема базы данных загружена', 'success');
            } else {
                this.displaySchemaError(response.error);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки схемы:', error);
            this.displaySchemaError(error);
        } finally {
            Utils.hideLoading();
        }
    }

    /**
     * Отображение схемы базы данных
     */
    displayDatabaseSchema() {
        if (!this.databaseSchema) {
            this.elements.schemaDisplay.innerHTML = `
                <div class="no-schema">
                    <p>Схема базы данных не загружена</p>
                    <p><small>Нажмите "Загрузить схему" для получения информации о таблицах</small></p>
                </div>
            `;
            return;
        }

        const tables = this.databaseSchema.tables || [];
        
        if (tables.length === 0) {
            this.elements.schemaDisplay.innerHTML = `
                <div class="empty-schema">
                    <p>База данных пуста или недоступна</p>
                </div>
            `;
            return;
        }

        const schemaHtml = `
            <div class="schema-info">
                <h4>📊 Схема базы данных</h4>
                <div class="schema-stats">
                    <span>Таблиц: ${tables.length}</span>
                    <span>Всего записей: ${tables.reduce((sum, table) => sum + (table.row_count || 0), 0)}</span>
                </div>
            </div>
            <div class="tables-list">
                ${tables.map(table => `
                    <div class="table-item" data-table="${table.name}">
                        <div class="table-header" onclick="AIBox.modules.database.toggleTable('${table.name}')">
                            <h5>📋 ${table.name}</h5>
                            <div class="table-info">
                                <span>${table.columns?.length || 0} колонок</span>
                                <span>${table.row_count || 0} записей</span>
                                <span class="toggle-icon">▼</span>
                            </div>
                        </div>
                        <div class="table-details" id="table-${table.name}">
                            ${table.columns ? `
                                <div class="columns-list">
                                    <h6>Колонки:</h6>
                                    <table class="columns-table">
                                        <thead>
                                            <tr><th>Название</th><th>Тип</th><th>Ограничения</th></tr>
                                        </thead>
                                        <tbody>
                                            ${table.columns.map(col => `
                                                <tr>
                                                    <td><code>${col.name}</code></td>
                                                    <td><span class="type-badge">${col.type}</span></td>
                                                    <td>
                                                        ${col.primary_key ? '<span class="constraint-badge pk">PK</span>' : ''}
                                                        ${col.foreign_key ? '<span class="constraint-badge fk">FK</span>' : ''}
                                                        ${col.not_null ? '<span class="constraint-badge nn">NOT NULL</span>' : ''}
                                                        ${col.unique ? '<span class="constraint-badge un">UNIQUE</span>' : ''}
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : ''}
                            <div class="table-actions">
                                <button onclick="AIBox.modules.database.insertSampleQuery('${table.name}')" 
                                        class="btn-secondary btn-sm">
                                    SELECT *
                                </button>
                                <button onclick="AIBox.modules.database.insertCountQuery('${table.name}')" 
                                        class="btn-secondary btn-sm">
                                    COUNT
                                </button>
                                <button onclick="AIBox.modules.database.insertDescribeQuery('${table.name}')" 
                                        class="btn-secondary btn-sm">
                                    DESCRIBE
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.elements.schemaDisplay.innerHTML = schemaHtml;

        // Добавление стилей для схемы
        this.addSchemaStyles();
    }

    /**
     * Переключение отображения таблицы
     */
    toggleTable(tableName) {
        const tableDetails = document.getElementById(`table-${tableName}`);
        const toggleIcon = document.querySelector(`[data-table="${tableName}"] .toggle-icon`);
        
        if (tableDetails && toggleIcon) {
            const isVisible = tableDetails.style.display !== 'none';
            tableDetails.style.display = isVisible ? 'none' : 'block';
            toggleIcon.textContent = isVisible ? '▶' : '▼';
        }
    }

    /**
     * Выполнение SQL запроса
     */
    async executeQuery() {
        const query = this.elements.sqlQuery?.value?.trim();
        
        if (!query) {
            Utils.showNotification('Введите SQL запрос', 'warning');
            return;
        }

        const safeMode = this.elements.safeMode?.checked ?? true;
        const queryId = this.generateQueryId();

        // Добавление в историю
        const queryRecord = {
            id: queryId,
            query: query,
            timestamp: new Date(),
            safeMode: safeMode,
            status: 'executing'
        };
        
        this.queryHistory.unshift(queryRecord);
        this.saveQueryHistory();

        // Отображение процесса выполнения
        this.displayQueryExecution(queryRecord);

        try {
            const response = await AIBox.modules.api.executeDatabaseQuery(query, safeMode);

            if (response.success) {
                queryRecord.status = 'success';
                queryRecord.result = response.data;
                queryRecord.executionTime = response.data.execution_time;
                this.displayQueryResult(queryRecord);
            } else {
                queryRecord.status = 'error';
                queryRecord.error = response.error;
                this.displayQueryError(queryRecord);
            }
        } catch (error) {
            console.error('❌ Ошибка выполнения запроса:', error);
            queryRecord.status = 'error';
            queryRecord.error = error;
            this.displayQueryError(queryRecord);
        }

        // Обновление истории
        this.saveQueryHistory();
    }

    /**
     * Отображение выполнения запроса
     */
    displayQueryExecution(queryRecord) {
        this.elements.queryResult.innerHTML = `
            <div class="query-execution" data-query-id="${queryRecord.id}">
                <div class="query-header">
                    <h4>⏳ Выполнение запроса</h4>
                    <div class="query-meta">
                        <span>Режим: ${queryRecord.safeMode ? 'Безопасный' : 'Полный'}</span>
                        <span>Запущено: ${Utils.formatDateTime(queryRecord.timestamp)}</span>
                    </div>
                </div>
                <div class="query-text">
                    <pre><code>${queryRecord.query}</code></pre>
                </div>
                <div class="execution-progress">
                    <div class="spinner"></div>
                    <span>Выполнение запроса...</span>
                </div>
            </div>
        `;
    }

    /**
     * Отображение результата запроса
     */
    displayQueryResult(queryRecord) {
        const result = queryRecord.result;
        const hasData = result.rows && result.rows.length > 0;

        let resultHtml = `
            <div class="query-result success" data-query-id="${queryRecord.id}">
                <div class="result-header">
                    <h4>✅ Запрос выполнен успешно</h4>
                    <div class="query-meta">
                        <span>Время выполнения: ${queryRecord.executionTime || 'N/A'}</span>
                        <span>Записей: ${result.row_count || result.rows?.length || 0}</span>
                    </div>
                </div>
                <div class="query-text">
                    <pre><code>${queryRecord.query}</code></pre>
                </div>
        `;

        if (hasData) {
            // Отображение данных в виде таблицы
            const columns = result.columns || Object.keys(result.rows[0] || {});
            resultHtml += `
                <div class="result-data">
                    <div class="data-controls">
                        <span>Показано записей: ${Math.min(result.rows.length, 100)}</span>
                        ${result.rows.length > 100 ? '<span class="warning">⚠️ Показаны первые 100 записей</span>' : ''}
                        <button onclick="AIBox.modules.database.exportQueryResult('${queryRecord.id}')" 
                                class="btn-secondary btn-sm">Экспорт CSV</button>
                    </div>
                    <div class="result-table-container">
                        <table class="result-table">
                            <thead>
                                <tr>
                                    ${columns.map(col => `<th>${col}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${result.rows.slice(0, 100).map(row => `
                                    <tr>
                                        ${columns.map(col => `
                                            <td>${this.formatCellValue(row[col])}</td>
                                        `).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else if (result.message) {
            // Для запросов типа INSERT, UPDATE, DELETE
            resultHtml += `
                <div class="result-message">
                    <p>${result.message}</p>
                    ${result.affected_rows ? `<p>Затронуто записей: ${result.affected_rows}</p>` : ''}
                </div>
            `;
        }

        resultHtml += '</div>';
        this.elements.queryResult.innerHTML = resultHtml;

        // Добавление стилей для результатов
        this.addResultStyles();
    }

    /**
     * Отображение ошибки запроса
     */
    displayQueryError(queryRecord) {
        this.elements.queryResult.innerHTML = `
            <div class="query-result error" data-query-id="${queryRecord.id}">
                <div class="result-header">
                    <h4>❌ Ошибка выполнения запроса</h4>
                </div>
                <div class="query-text">
                    <pre><code>${queryRecord.query}</code></pre>
                </div>
                <div class="error-content">
                    <h5>Ошибка:</h5>
                    <div class="error-message">
                        ${queryRecord.error.message || 'Неизвестная ошибка'}
                    </div>
                    ${queryRecord.error.details ? `
                        <div class="error-details">
                            <strong>Детали:</strong>
                            <pre>${queryRecord.error.details}</pre>
                        </div>
                    ` : ''}
                    <div class="error-help">
                        <h6>Возможные причины:</h6>
                        <ul>
                            <li>Синтаксическая ошибка в SQL запросе</li>
                            <li>Несуществующая таблица или колонка</li>
                            <li>Недостаточно прав доступа</li>
                            <li>Нарушение ограничений базы данных</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Вставка образца запроса для таблицы
     */
    insertSampleQuery(tableName) {
        const query = `SELECT * FROM ${tableName} LIMIT 10;`;
        if (this.elements.sqlQuery) {
            this.elements.sqlQuery.value = query;
            this.elements.sqlQuery.focus();
        }
    }

    /**
     * Вставка запроса подсчета записей
     */
    insertCountQuery(tableName) {
        const query = `SELECT COUNT(*) AS total_records FROM ${tableName};`;
        if (this.elements.sqlQuery) {
            this.elements.sqlQuery.value = query;
            this.elements.sqlQuery.focus();
        }
    }

    /**
     * Вставка запроса описания таблицы
     */
    insertDescribeQuery(tableName) {
        const query = `DESCRIBE ${tableName};`;
        if (this.elements.sqlQuery) {
            this.elements.sqlQuery.value = query;
            this.elements.sqlQuery.focus();
        }
    }

    /**
     * Экспорт результата запроса в CSV
     */
    exportQueryResult(queryId) {
        const queryRecord = this.queryHistory.find(q => q.id === queryId);
        if (!queryRecord || !queryRecord.result || !queryRecord.result.rows) {
            Utils.showNotification('Нет данных для экспорта', 'warning');
            return;
        }

        const result = queryRecord.result;
        const columns = result.columns || Object.keys(result.rows[0] || {});
        
        // Создание CSV содержимого
        let csvContent = columns.join(',') + '\n';
        
        result.rows.forEach(row => {
            const values = columns.map(col => {
                const value = row[col];
                // Экранирование значений, содержащих запятые или кавычки
                if (value && (value.toString().includes(',') || value.toString().includes('"'))) {
                    return `"${value.toString().replace(/"/g, '""')}"`;
                }
                return value || '';
            });
            csvContent += values.join(',') + '\n';
        });

        // Скачивание файла
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `query_result_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        Utils.showNotification('Результат экспортирован в CSV', 'success');
    }

    /**
     * Форматирование значения ячейки
     */
    formatCellValue(value) {
        if (value === null || value === undefined) {
            return '<span class="null-value">NULL</span>';
        }
        
        if (typeof value === 'boolean') {
            return `<span class="boolean-value">${value}</span>`;
        }
        
        if (typeof value === 'number') {
            return `<span class="number-value">${value}</span>`;
        }
        
        if (typeof value === 'string' && value.length > 100) {
            return `<span class="long-text" title="${value}">${value.substring(0, 100)}...</span>`;
        }
        
        return value.toString();
    }

    /**
     * Обработка автодополнения SQL
     */
    handleSQLAutocompletion() {
        // Базовое автодополнение SQL ключевых слов
        // Можно расширить для более сложной логики
        const query = this.elements.sqlQuery.value.toLowerCase();
        
        // Подсказки по ключевым словам SQL
        const sqlKeywords = [
            'SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING',
            'INSERT INTO', 'UPDATE', 'DELETE FROM', 'JOIN', 'INNER JOIN',
            'LEFT JOIN', 'RIGHT JOIN', 'UNION', 'DISTINCT', 'COUNT', 'SUM',
            'AVG', 'MIN', 'MAX', 'LIMIT', 'OFFSET'
        ];
        
        // Здесь можно добавить логику автодополнения
        // Например, показ выпадающего списка с предложениями
    }

    /**
     * Обновление UI безопасного режима
     */
    updateSafeModeUI(safeMode) {
        const executeButton = this.elements.executeButton;
        if (executeButton) {
            if (safeMode) {
                executeButton.textContent = 'Выполнить запрос (безопасно)';
                executeButton.className = 'btn-primary';
            } else {
                executeButton.textContent = 'Выполнить запрос (ОСТОРОЖНО!)';
                executeButton.className = 'btn-primary danger';
            }
        }
    }

    /**
     * Показ приветственного сообщения
     */
    showWelcomeMessage() {
        this.elements.queryResult.innerHTML = `
            <div class="database-welcome">
                <h4>🗄️ Добро пожаловать в Database Manager</h4>
                <p>Здесь вы можете выполнять SQL запросы к базе данных AI Box.</p>
                <div class="welcome-actions">
                    <ol>
                        <li>Сначала загрузите схему базы данных для просмотра доступных таблиц</li>
                        <li>Введите SQL запрос в поле выше</li>
                        <li>Выберите режим выполнения (безопасный или полный)</li>
                        <li>Нажмите "Выполнить запрос" или Ctrl+Enter</li>
                    </ol>
                </div>
                <div class="safety-notice">
                    <h5>⚠️ Режимы выполнения:</h5>
                    <ul>
                        <li><strong>Безопасный режим:</strong> Только SELECT запросы</li>
                        <li><strong>Полный режим:</strong> Все типы запросов (INSERT, UPDATE, DELETE)</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Отображение ошибки схемы
     */
    displaySchemaError(error) {
        this.elements.schemaDisplay.innerHTML = `
            <div class="schema-error">
                <h4>❌ Ошибка загрузки схемы</h4>
                <p>${error.message || 'Не удалось загрузить схему базы данных'}</p>
                <button onclick="AIBox.modules.database.loadDatabaseSchema()" class="btn-secondary">
                    Повторить загрузку
                </button>
            </div>
        `;
    }

    /**
     * Генерация ID запроса
     */
    generateQueryId() {
        return 'query_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Сохранение истории запросов
     */
    saveQueryHistory() {
        try {
            // Ограничение размера истории
            const historyToSave = this.queryHistory.slice(0, this.maxHistorySize);
            localStorage.setItem('aibox_query_history', JSON.stringify(historyToSave));
        } catch (error) {
            console.error('❌ Ошибка сохранения истории запросов:', error);
        }
    }

    /**
     * Загрузка истории запросов
     */
    loadQueryHistory() {
        try {
            const history = localStorage.getItem('aibox_query_history');
            if (history) {
                this.queryHistory = JSON.parse(history);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки истории запросов:', error);
        }
    }

    /**
     * Добавление стилей для схемы
     */
    addSchemaStyles() {
        if (document.querySelector('#schema-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'schema-styles';
        styles.textContent = `
            .schema-info {
                background: var(--gray-50);
                padding: var(--spacing-3);
                border-radius: var(--radius-md);
                margin-bottom: var(--spacing-4);
            }
            .schema-stats {
                display: flex;
                gap: var(--spacing-4);
                font-size: var(--font-size-sm);
                color: var(--gray-600);
                margin-top: var(--spacing-2);
            }
            .table-item {
                border: 1px solid var(--gray-200);
                border-radius: var(--radius-md);
                margin-bottom: var(--spacing-3);
                overflow: hidden;
            }
            .table-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: var(--spacing-3);
                background: var(--gray-50);
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .table-header:hover {
                background: var(--gray-100);
            }
            .table-info {
                display: flex;
                gap: var(--spacing-3);
                align-items: center;
                font-size: var(--font-size-sm);
                color: var(--gray-600);
            }
            .toggle-icon {
                font-weight: bold;
                margin-left: var(--spacing-2);
            }
            .table-details {
                padding: var(--spacing-3);
                border-top: 1px solid var(--gray-200);
            }
            .columns-table {
                width: 100%;
                border-collapse: collapse;
                margin: var(--spacing-2) 0;
            }
            .columns-table th,
            .columns-table td {
                border: 1px solid var(--gray-200);
                padding: var(--spacing-2);
                text-align: left;
            }
            .columns-table th {
                background: var(--gray-50);
                font-weight: 500;
            }
            .type-badge {
                background: var(--info-color);
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: var(--font-size-xs);
                font-weight: 500;
            }
            .constraint-badge {
                padding: 2px 4px;
                border-radius: 2px;
                font-size: var(--font-size-xs);
                font-weight: 500;
                margin-right: 4px;
            }
            .constraint-badge.pk { background: var(--warning-color); color: white; }
            .constraint-badge.fk { background: var(--info-color); color: white; }
            .constraint-badge.nn { background: var(--error-color); color: white; }
            .constraint-badge.un { background: var(--success-color); color: white; }
            .table-actions {
                display: flex;
                gap: var(--spacing-2);
                margin-top: var(--spacing-3);
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Добавление стилей для результатов
     */
    addResultStyles() {
        if (document.querySelector('#result-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'result-styles';
        styles.textContent = `
            .query-result {
                background: var(--white);
                border: 1px solid var(--gray-200);
                border-radius: var(--radius-md);
                padding: var(--spacing-4);
            }
            .query-result.success { border-left: 4px solid var(--success-color); }
            .query-result.error { border-left: 4px solid var(--error-color); }
            .result-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-3);
                padding-bottom: var(--spacing-2);
                border-bottom: 1px solid var(--gray-200);
            }
            .result-table-container {
                max-height: 400px;
                overflow: auto;
                border: 1px solid var(--gray-200);
                border-radius: var(--radius-sm);
            }
            .result-table {
                width: 100%;
                border-collapse: collapse;
            }
            .result-table th,
            .result-table td {
                border: 1px solid var(--gray-200);
                padding: var(--spacing-2);
                text-align: left;
                font-size: var(--font-size-sm);
            }
            .result-table th {
                background: var(--gray-50);
                font-weight: 500;
                position: sticky;
                top: 0;
            }
            .null-value { color: var(--gray-400); font-style: italic; }
            .boolean-value { color: var(--info-color); font-weight: 500; }
            .number-value { color: var(--success-color); font-weight: 500; }
            .long-text { cursor: help; }
            .data-controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-3);
                padding: var(--spacing-2);
                background: var(--gray-50);
                border-radius: var(--radius-sm);
            }
            .warning { color: var(--warning-color); font-weight: 500; }
            .btn-sm { padding: 6px 12px; font-size: var(--font-size-sm); }
            .danger { background: var(--error-color) !important; }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Получение статистики по базе данных
     */
    getDatabaseStats() {
        return {
            schemaLoaded: !!this.databaseSchema,
            tablesCount: this.databaseSchema?.tables?.length || 0,
            totalQueries: this.queryHistory.length,
            successfulQueries: this.queryHistory.filter(q => q.status === 'success').length,
            failedQueries: this.queryHistory.filter(q => q.status === 'error').length
        };
    }
}