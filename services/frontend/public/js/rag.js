/**
 * RAG Manager для AI Box Frontend
 * Управление документами и поиском через RAG сервис
 */

class RAGManager {
    constructor() {
        this.uploadedFiles = [];
        this.searchResults = [];
        this.elements = {};
        this.initialized = false;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        this.allowedTypes = ['.pdf', '.docx', '.txt', '.html', '.htm'];
    }

    /**
     * Инициализация RAG менеджера
     */
    init() {
        if (this.initialized) return;

        // Получение элементов DOM
        this.elements = {
            uploadArea: document.getElementById('upload-area'),
            fileInput: document.getElementById('file-input'),
            uploadButton: document.getElementById('upload-button'),
            documentSearch: document.getElementById('document-search'),
            searchButton: document.getElementById('search-button'),
            searchResults: document.getElementById('search-results')
        };

        // Проверка наличия элементов
        if (!this.elements.uploadArea || !this.elements.searchResults) {
            console.error('❌ Не найдены обязательные элементы RAG');
            return;
        }

        // Привязка обработчиков событий
        this.bindEventHandlers();

        // Загрузка списка загруженных документов
        this.loadUploadedDocuments();

        this.initialized = true;
        console.log('✅ RAGManager инициализирован');
    }

    /**
     * Привязка обработчиков событий
     */
    bindEventHandlers() {
        // Drag & Drop для загрузки файлов
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.add('dragover');
        });

        this.elements.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.remove('dragover');
        });

        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files);
            this.handleFileSelection(files);
        });

        // Клик по области загрузки
        this.elements.uploadArea.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        // Выбор файлов через input
        this.elements.fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFileSelection(files);
        });

        // Кнопка загрузки
        if (this.elements.uploadButton) {
            this.elements.uploadButton.addEventListener('click', () => {
                this.uploadSelectedFiles();
            });
        }

        // Поиск по документам
        if (this.elements.searchButton) {
            this.elements.searchButton.addEventListener('click', () => {
                this.searchDocuments();
            });
        }

        // Поиск по Enter
        if (this.elements.documentSearch) {
            this.elements.documentSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.searchDocuments();
                }
            });
        }
    }

    /**
     * Обработка выбора файлов
     */
    handleFileSelection(files) {
        console.log(`📁 Выбрано файлов: ${files.length}`);

        const validFiles = [];
        const errors = [];

        files.forEach(file => {
            // Проверка типа файла
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            if (!this.allowedTypes.includes(fileExtension)) {
                errors.push(`${file.name}: неподдерживаемый тип файла`);
                return;
            }

            // Проверка размера файла
            if (file.size > this.maxFileSize) {
                errors.push(`${file.name}: файл слишком большой (максимум 50MB)`);
                return;
            }

            validFiles.push(file);
        });

        // Показ ошибок
        if (errors.length > 0) {
            Utils.showNotification(
                `Некоторые файлы не могут быть загружены:\n${errors.join('\n')}`,
                'warning'
            );
        }

        // Добавление валидных файлов
        if (validFiles.length > 0) {
            this.addFilesToQueue(validFiles);
            Utils.showNotification(
                `Добавлено ${validFiles.length} файл(ов) в очередь загрузки`,
                'success'
            );
        }
    }

    /**
     * Добавление файлов в очередь загрузки
     */
    addFilesToQueue(files) {
        files.forEach(file => {
            const fileInfo = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                file: file,
                name: file.name,
                size: file.size,
                type: file.type,
                status: 'pending', // pending, uploading, uploaded, error
                progress: 0,
                uploadTime: null,
                error: null
            };

            this.uploadedFiles.push(fileInfo);
        });

        this.updateUploadAreaDisplay();
    }

    /**
     * Обновление отображения области загрузки
     */
    updateUploadAreaDisplay() {
        const pendingFiles = this.uploadedFiles.filter(f => f.status === 'pending');
        
        if (pendingFiles.length > 0) {
            const fileList = pendingFiles.map(f => 
                `• ${f.name} (${this.formatFileSize(f.size)})`
            ).join('\n');

            this.elements.uploadArea.innerHTML = `
                <div class="upload-content">
                    <div class="upload-icon">📄</div>
                    <p><strong>Файлы готовы к загрузке:</strong></p>
                    <pre class="file-list">${fileList}</pre>
                    <p class="upload-hint">Нажмите "Загрузить документы" для начала загрузки</p>
                </div>
            `;
        } else {
            this.elements.uploadArea.innerHTML = `
                <div class="upload-content">
                    <div class="upload-icon">📁</div>
                    <p>Перетащите файлы сюда или нажмите для выбора</p>
                    <p class="upload-hint">Поддерживается: PDF, DOCX, TXT, HTML</p>
                </div>
            `;
        }
    }

    /**
     * Загрузка выбранных файлов
     */
    async uploadSelectedFiles() {
        const pendingFiles = this.uploadedFiles.filter(f => f.status === 'pending');
        
        if (pendingFiles.length === 0) {
            Utils.showNotification('Нет файлов для загрузки', 'warning');
            return;
        }

        Utils.showLoading(`Загрузка файлов: 0/${pendingFiles.length}`);

        let uploaded = 0;
        let errors = 0;

        for (const fileInfo of pendingFiles) {
            try {
                fileInfo.status = 'uploading';
                
                // Создание метаданных
                const metadata = {
                    upload_time: new Date().toISOString(),
                    file_size: fileInfo.size,
                    file_type: fileInfo.type
                };

                // Загрузка файла
                const response = await AIBox.modules.api.uploadDocument(fileInfo.file, metadata);

                if (response.success) {
                    fileInfo.status = 'uploaded';
                    fileInfo.uploadTime = new Date().toISOString();
                    fileInfo.documentId = response.data.document_id;
                    uploaded++;
                } else {
                    fileInfo.status = 'error';
                    fileInfo.error = response.error?.message || 'Ошибка загрузки';  
                    errors++;
                }
            } catch (error) {
                fileInfo.status = 'error';
                fileInfo.error = error.message || 'Неизвестная ошибка';
                errors++;
            }

            // Обновление прогресса
            Utils.showLoading(`Загрузка файлов: ${uploaded + errors}/${pendingFiles.length}`);
        }

        Utils.hideLoading();

        // Показ результатов
        if (uploaded > 0) {
            Utils.showNotification(
                `Успешно загружено ${uploaded} файл(ов)`,
                'success'
            );
        }

        if (errors > 0) {
            Utils.showNotification(
                `Ошибка загрузки ${errors} файл(ов)`,
                'error'
            );
        }

        // Обновление интерфейса
        this.updateUploadAreaDisplay();
        this.displayUploadedFiles();
    }

    /**
     * Отображение загруженных файлов
     */
    displayUploadedFiles() {
        const uploadedFiles = this.uploadedFiles.filter(f => f.status === 'uploaded');
        
        if (uploadedFiles.length === 0) {
            return;
        }

        // Добавление секции с загруженными файлами если её нет
        let fileListSection = document.getElementById('uploaded-files-section');
        if (!fileListSection) {
            fileListSection = document.createElement('div');
            fileListSection.id = 'uploaded-files-section';
            fileListSection.className = 'section';
            fileListSection.innerHTML = `
                <h3>📚 Загруженные документы</h3>
                <div id="uploaded-files-list" class="uploaded-files-list"></div>
            `;
            
            // Вставка после секции загрузки
            const uploadSection = this.elements.uploadArea.closest('.section');
            uploadSection.parentNode.insertBefore(fileListSection, uploadSection.nextSibling);
        }

        const filesList = document.getElementById('uploaded-files-list');
        filesList.innerHTML = uploadedFiles.map(file => `
            <div class="uploaded-file-item" data-file-id="${file.id}">
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-details">
                        ${this.formatFileSize(file.size)} • 
                        ${Utils.formatDateTime(file.uploadTime)}
                    </div>
                </div>
                <div class="file-actions">
                    <button onclick="AIBox.modules.rag.deleteDocument('${file.id}')" 
                            class="btn-secondary btn-sm">Удалить</button>
                </div>
            </div>
        `).join('');

        // Добавление стилей если нужно
        if (!document.querySelector('#uploaded-files-styles')) {
            const styles = document.createElement('style');
            styles.id = 'uploaded-files-styles';
            styles.textContent = `
                .uploaded-files-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .uploaded-file-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    background: var(--gray-50);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--gray-200);
                }
                .file-info .file-name {
                    font-weight: 500;
                    color: var(--gray-900);
                }
                .file-info .file-details {
                    font-size: var(--font-size-sm);
                    color: var(--gray-600);
                    margin-top: 4px;
                }
                .btn-sm {
                    padding: 6px 12px;
                    font-size: var(--font-size-sm);
                }
            `;
            document.head.appendChild(styles);
        }
    }

    /**
     * Поиск в документах
     */
    async searchDocuments() {
        const query = this.elements.documentSearch.value.trim();
        
        if (!query) {
            Utils.showNotification('Введите запрос для поиска', 'warning');
            return;
        }

        Utils.showLoading('Поиск в документах...');

        try {
            const response = await AIBox.modules.api.searchDocuments(query);

            if (response.success) {
                this.displaySearchResults(response.data, query);
                Utils.showNotification('Поиск завершен', 'success');
            } else {
                this.displaySearchError(response.error);
            }
        } catch (error) {
            console.error('❌ Ошибка поиска:', error);
            this.displaySearchError(error);
        } finally {
            Utils.hideLoading();
        }
    }

    /**
     * Отображение результатов поиска
     */
    displaySearchResults(data, query) {
        const results = data.results || data.matches || [];
        
        if (results.length === 0) {
            this.elements.searchResults.innerHTML = `
                <div class="no-results">
                    <p>По запросу "<strong>${query}</strong>" ничего не найдено.</p>
                    <p>Попробуйте:</p>
                    <ul>
                        <li>Использовать другие ключевые слова</li>
                        <li>Проверить правильность написания</li>
                        <li>Загрузить больше документов</li>
                    </ul>
                </div>
            `;
            return;
        }

        const resultsHtml = `
            <div class="search-header">
                <h4>Результаты поиска по запросу: "${query}"</h4>
                <p>Найдено: ${results.length} совпадений</p>
            </div>
            <div class="search-results-list">
                ${results.map((result, index) => `
                    <div class="search-result-item">
                        <div class="result-header">
                            <span class="result-number">#${index + 1}</span>
                            <span class="result-score">Релевантность: ${Math.round((result.score || 0) * 100)}%</span>
                        </div>
                        <div class="result-content">
                            ${this.highlightSearchTerm(result.content || result.text || '', query)}
                        </div>
                        ${result.metadata ? `
                            <div class="result-metadata">
                                ${result.metadata.source ? `📄 ${result.metadata.source}` : ''}
                                ${result.metadata.page ? ` • Страница ${result.metadata.page}` : ''}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        this.elements.searchResults.innerHTML = resultsHtml;

        // Добавление стилей для результатов поиска
        if (!document.querySelector('#search-results-styles')) {
            const styles = document.createElement('style');
            styles.id = 'search-results-styles';
            styles.textContent = `
                .search-header {
                    margin-bottom: 20px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid var(--gray-200);
                }
                .search-header h4 {
                    color: var(--gray-900);
                    margin-bottom: 8px;
                }
                .search-header p {
                    color: var(--gray-600);
                    font-size: var(--font-size-sm);
                }
                .search-results-list {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .search-result-item {
                    padding: 16px;
                    background: var(--white);
                    border: 1px solid var(--gray-200);
                    border-radius: var(--radius-md);
                    border-left: 4px solid var(--primary-color);
                }
                .result-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .result-number {
                    font-weight: 600;
                    color: var(--primary-color);
                }
                .result-score {
                    font-size: var(--font-size-sm);
                    color: var(--gray-600);
                }
                .result-content {
                    line-height: 1.6;
                    margin-bottom: 8px;
                }
                .result-metadata {
                    font-size: var(--font-size-sm);
                    color: var(--gray-600);
                    font-style: italic;
                }
                .highlight {
                    background: #fef3c7;
                    padding: 2px 4px;
                    border-radius: 2px;
                    font-weight: 500;
                }
                .no-results {
                    text-align: center;
                    padding: 40px 20px;
                    color: var(--gray-600);
                }
                .no-results ul {
                    text-align: left;
                    display: inline-block;
                    margin-top: 16px;
                }
            `;
            document.head.appendChild(styles);
        }
    }

    /**
     * Отображение ошибки поиска
     */
    displaySearchError(error) {
        this.elements.searchResults.innerHTML = `
            <div class="search-error">
                <h4>❌ Ошибка поиска</h4>
                <p>${error.message || 'Произошла ошибка при поиске в документах'}</p>
                <p><small>Попробуйте повторить запрос позже</small></p>
            </div>
        `;
    }

    /**
     * Подсветка поискового термина
     */
    highlightSearchTerm(text, term) {
        if (!term) return text;
        
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    }

    /**
     * Удаление документа
     */
    async deleteDocument(fileId) {
        if (!confirm('Вы действительно хотите удалить этот документ?')) {
            return;
        }

        const fileIndex = this.uploadedFiles.findIndex(f => f.id === fileId);
        if (fileIndex === -1) {
            Utils.showNotification('Файл не найден', 'error');
            return;
        }

        const fileInfo = this.uploadedFiles[fileIndex];
        
        try {
            // Здесь должен быть вызов API для удаления документа
            // const response = await AIBox.modules.api.deleteDocument(fileInfo.documentId);
            
            // Пока просто удаляем локально
            this.uploadedFiles.splice(fileIndex, 1);
            this.displayUploadedFiles();
            
            Utils.showNotification(`Документ "${fileInfo.name}" удален`, 'success');
        } catch (error) {
            console.error('❌ Ошибка удаления документа:', error);
            Utils.showNotification('Ошибка удаления документа', 'error');
        }
    }

    /**
     * Форматирование размера файла
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Загрузка списка загруженных документов с сервера
     */
    async loadUploadedDocuments() {
        try {
            // Здесь должен быть вызов API для получения списка документов
            // const response = await AIBox.modules.api.getUploadedDocuments();
            // if (response.success) {
            //     this.uploadedFiles = response.data.map(doc => ({...}));
            //     this.displayUploadedFiles();
            // }
        } catch (error) {
            console.error('❌ Ошибка загрузки списка документов:', error);
        }
    }

    /**
     * Получение статистики RAG
     */
    getRAGStats() {
        const uploadedCount = this.uploadedFiles.filter(f => f.status === 'uploaded').length;
        const pendingCount = this.uploadedFiles.filter(f => f.status === 'pending').length;
        const errorCount = this.uploadedFiles.filter(f => f.status === 'error').length;
        
        return {
            totalFiles: this.uploadedFiles.length,
            uploaded: uploadedCount,
            pending: pendingCount,
            errors: errorCount,
            searchResults: this.searchResults.length
        };
    }
}