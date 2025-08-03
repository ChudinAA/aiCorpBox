/**
 * Chat Manager для AI Box Frontend
 * Управление чатом с AI сервисами
 */

class ChatManager {
    constructor() {
        this.messages = [];
        this.currentSessionId = null;
        this.currentService = 'general';
        this.isWaitingForResponse = false;
        this.elements = {};
        this.initialized = false;
    }

    /**
     * Инициализация чат менеджера
     */
    init() {
        if (this.initialized) return;

        // Получение элементов DOM
        this.elements = {
            messagesContainer: document.getElementById('chat-messages'),
            chatInput: document.getElementById('chat-input'),
            sendButton: document.getElementById('send-button'),
            serviceSelector: document.getElementById('service-selector'),
            clearButton: document.getElementById('clear-chat')
        };

        // Проверка наличия элементов
        if (!this.elements.messagesContainer || !this.elements.chatInput) {
            console.error('❌ Не найдены обязательные элементы чата');
            return;
        }

        // Генерация ID сессии
        this.currentSessionId = this.generateSessionId();

        // Привязка обработчиков событий
        this.bindEventHandlers();

        // Подписка на WebSocket события
        this.subscribeToWebSocketEvents();

        // Загрузка истории чата из localStorage
        this.loadChatHistory();

        // Отображение приветственного сообщения
        this.showWelcomeMessage();

        this.initialized = true;
        console.log('✅ ChatManager инициализирован');
    }

    /**
     * Привязка обработчиков событий
     */
    bindEventHandlers() {
        // Отправка сообщения по кнопке
        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        // Отправка сообщения по Enter (Shift+Enter для новой строки)
        this.elements.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Изменение сервиса
        if (this.elements.serviceSelector) {
            this.elements.serviceSelector.addEventListener('change', (e) => {
                this.currentService = e.target.value;
                this.addSystemMessage(`Переключен на сервис: ${this.getServiceName(this.currentService)}`);
            });
        }

        // Очистка чата
        if (this.elements.clearButton) {
            this.elements.clearButton.addEventListener('click', () => {
                this.clearChat();
            });
        }

        // Автоматическое изменение размера textarea
        this.elements.chatInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });
    }

    /**
     * Подписка на WebSocket события
     */
    subscribeToWebSocketEvents() {
        if (AIBox.modules.websocket) {
            AIBox.modules.websocket.on('chatResponse', (data) => {
                this.handleChatResponse(data);
            });

            AIBox.modules.websocket.on('error', (data) => {
                this.handleChatError(data);
            });
        }
    }

    /**
     * Отправка сообщения
     */
    async sendMessage() {
        const message = this.elements.chatInput.value.trim();
        if (!message || this.isWaitingForResponse) {
            return;
        }

        // Добавление сообщения пользователя в чат
        this.addMessage('user', message);

        // Очистка поля ввода
        this.elements.chatInput.value = '';
        this.autoResizeTextarea();

        // Установка состояния ожидания
        this.setWaitingState(true);

        try {
            // Попытка отправки через WebSocket (приоритет)
            if (AIBox.modules.websocket && AIBox.modules.websocket.isConnected()) {
                AIBox.modules.websocket.sendChatMessage(message, this.currentService);
            } else {
                // Fallback на HTTP API
                const response = await AIBox.modules.api.sendChatMessage(
                    message, 
                    this.currentService, 
                    this.currentSessionId
                );

                if (response.success) {
                    this.handleChatResponse(response.data);
                } else {
                    this.handleChatError(response.error);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка отправки сообщения:', error);
            this.handleChatError(error);
        }
    }

    /**
     * Обработка ответа от AI
     */
    handleChatResponse(data) {
        this.setWaitingState(false);

        const response = data.response || data.message || 'Получен пустой ответ';
        this.addMessage('assistant', response, {
            service: data.service_used || this.currentService,
            timestamp: data.timestamp,
            metadata: data.metadata
        });

        // Сохранение в историю
        this.saveChatHistory();
    }

    /**
     * Обработка ошибки чата
     */
    handleChatError(error) {
        this.setWaitingState(false);
        
        const errorMessage = error.message || 'Произошла ошибка при обработке сообщения';
        this.addMessage('system', `❌ Ошибка: ${errorMessage}`, { isError: true });
    }

    /**
     * Добавление сообщения в чат
     */
    addMessage(type, content, metadata = {}) {
        const message = {
            id: Date.now(),
            type,
            content,
            timestamp: new Date().toISOString(),
            metadata
        };

        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
    }

    /**
     * Добавление системного сообщения
     */
    addSystemMessage(content) {
        this.addMessage('system', content, { isSystem: true });
    }

    /**
     * Отрисовка сообщения
     */
    renderMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.type}`;
        messageElement.setAttribute('data-message-id', message.id);

        let contentHtml = this.formatMessageContent(message.content);
        
        // Добавление метаданных для сообщений ассистента
        if (message.type === 'assistant' && message.metadata) {
            const metaInfo = [];
            if (message.metadata.service) {
                metaInfo.push(`Сервис: ${this.getServiceName(message.metadata.service)}`);
            }
            if (message.metadata.timestamp) {
                metaInfo.push(`Время: ${Utils.formatDateTime(message.metadata.timestamp)}`);
            }
            
            if (metaInfo.length > 0) {
                contentHtml += `<div class="message-meta">${metaInfo.join(' • ')}</div>`;
            }
        }

        // Добавление времени для всех сообщений
        const timeString = Utils.formatDateTime(message.timestamp);
        contentHtml += `<div class="message-time">${timeString}</div>`;

        messageElement.innerHTML = contentHtml;
        this.elements.messagesContainer.appendChild(messageElement);
    }

    /**
     * Форматирование содержимого сообщения
     */
    formatMessageContent(content) {
        // Замена переводов строк на <br>
        let formatted = content.replace(/\n/g, '<br>');
        
        // Простое форматирование кода (обернуто в `` или ```)
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="code-block">$1</pre>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Форматирование ссылок
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        return formatted;
    }

    /**
     * Установка состояния ожидания
     */
    setWaitingState(waiting) {
        this.isWaitingForResponse = waiting;
        
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = waiting;
            this.elements.sendButton.textContent = waiting ? 'Отправка...' : 'Отправить';
        }

        this.elements.chatInput.disabled = waiting;

        if (waiting) {
            this.addTypingIndicator();
        } else {
            this.removeTypingIndicator();
        }
    }

    /**
     * Добавление индикатора печати
     */
    addTypingIndicator() {
        const typingElement = document.createElement('div');
        typingElement.className = 'chat-message assistant typing-indicator';
        typingElement.id = 'typing-indicator';
        typingElement.innerHTML = `
            <div class="typing-animation">
                <span></span>
                <span></span>  
                <span></span>
            </div>
            <div class="typing-text">AI печатает...</div>
        `;

        // Добавление стилей для анимации
        if (!document.querySelector('#typing-styles')) {
            const styles = document.createElement('style');
            styles.id = 'typing-styles';
            styles.textContent = `
                .typing-indicator { opacity: 0.7; }
                .typing-animation { display: flex; gap: 4px; margin-bottom: 4px; }
                .typing-animation span {
                    width: 8px; height: 8px; border-radius: 50%;
                    background: #94a3b8; animation: typing 1.4s infinite;
                }
                .typing-animation span:nth-child(2) { animation-delay: 0.2s; }
                .typing-animation span:nth-child(3) { animation-delay: 0.4s; }
                .typing-text { font-size: 0.8em; color: #64748b; }
                @keyframes typing {
                    0%, 60%, 100% { transform: translateY(0); }
                    30% { transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(styles);
        }

        this.elements.messagesContainer.appendChild(typingElement);
        this.scrollToBottom();
    }

    /**
     * Удаление индикатора печати
     */
    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    /**
     * Прокрутка к концу чата
     */
    scrollToBottom() {
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 100);
    }

    /**
     * Автоматическое изменение размера textarea
     */
    autoResizeTextarea() {
        const textarea = this.elements.chatInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    /**
     * Очистка чата
     */
    clearChat() {
        if (confirm('Вы действительно хотите очистить историю чата?')) {
            this.messages = [];
            this.elements.messagesContainer.innerHTML = '';
            this.clearChatHistory();
            this.showWelcomeMessage();
            Utils.showNotification('История чата очищена', 'info');
        }
    }

    /**
     * Показ приветственного сообщения
     */
    showWelcomeMessage() {
        this.addMessage('system', `
            Добро пожаловать в AI Box! 🤖
            
            Выберите сервис и начните общение:
            • Общий чат - для обычных вопросов
            • Вопросы по документам - для поиска в загруженных файлах  
            • AI Агенты - для выполнения сложных задач
            • Запросы к базе данных - для работы с данными
        `, { isWelcome: true });
    }

    /**
     * Получение читаемого имени сервиса
     */
    getServiceName(serviceType) {
        const serviceNames = {
            'general': 'Общий чат',
            'rag': 'Вопросы по документам',
            'agents': 'AI Агенты',
            'database': 'Запросы к базе данных'
        };
        return serviceNames[serviceType] || serviceType;
    }

    /**
     * Генерация ID сессии
     */
    generateSessionId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Сохранение истории чата
     */
    saveChatHistory() {
        try {
            localStorage.setItem('aibox_chat_history', JSON.stringify(this.messages));
        } catch (error) {
            console.error('❌ Ошибка сохранения истории чата:', error);
        }
    }

    /**
     * Загрузка истории чата
     */
    loadChatHistory() {
        try {
            const history = localStorage.getItem('aibox_chat_history');
            if (history) {
                const messages = JSON.parse(history);
                // Загружаем только последние 50 сообщений
                this.messages = messages.slice(-50);
                this.messages.forEach(message => this.renderMessage(message));
                this.scrollToBottom();
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки истории чата:', error);
        }
    }

    /**
     * Очистка истории чата
     */
    clearChatHistory() {
        try {
            localStorage.removeItem('aibox_chat_history');
        } catch (error) {
            console.error('❌ Ошибка очистки истории чата:', error);
        }
    }

    /**
     * Экспорт истории чата
     */
    exportChatHistory() {
        const chatText = this.messages.map(msg => {
            const time = Utils.formatDateTime(msg.timestamp);
            const sender = msg.type === 'user' ? 'Пользователь' : 
                          msg.type === 'assistant' ? 'AI' : 'Система';
            return `[${time}] ${sender}: ${msg.content}`;
        }).join('\n\n');

        const blob = new Blob([chatText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aibox_chat_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Получение статистики чата
     */
    getChatStats() {
        const userMessages = this.messages.filter(m => m.type === 'user').length;
        const aiMessages = this.messages.filter(m => m.type === 'assistant').length;
        const systemMessages = this.messages.filter(m => m.type === 'system').length;

        return {
            total: this.messages.length,
            user: userMessages,
            ai: aiMessages,
            system: systemMessages,
            sessionId: this.currentSessionId,
            currentService: this.currentService
        };
    }
}