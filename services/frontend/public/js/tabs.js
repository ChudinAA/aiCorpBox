/**
 * Менеджер вкладок для AI Box Frontend
 * Управление переключением между различными секциями интерфейса
 */

class TabsManager {
    constructor() {
        this.currentTab = 'overview';
        this.tabButtons = [];
        this.tabPanels = [];
        this.initialized = false;
    }

    /**
     * Инициализация менеджера вкладок
     */
    init() {
        if (this.initialized) return;

        // Получение элементов вкладок
        this.tabButtons = Array.from(document.querySelectorAll('.tab-button'));
        this.tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

        if (this.tabButtons.length === 0 || this.tabPanels.length === 0) {
            console.error('❌ Не найдены элементы вкладок');
            return;
        }

        // Привязка обработчиков событий
        this.tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.target.getAttribute('data-tab');
                if (tabId) {
                    this.switchTab(tabId);
                }
            });
        });

        // Обработка истории браузера (назад/вперед)
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.tab) {
                this.switchTab(e.state.tab, false); // false = не добавлять в историю
            }
        });

        // Получение активной вкладки из URL или установка по умолчанию
        const urlTab = this.getTabFromURL();
        if (urlTab && this.isValidTab(urlTab)) {
            this.switchTab(urlTab, false);
        } else {
            this.switchTab(this.currentTab, false);
        }

        this.initialized = true;
        console.log('✅ TabsManager инициализирован');
    }

    /**
     * Переключение на указанную вкладку
     */
    switchTab(tabId, addToHistory = true) {
        if (!this.isValidTab(tabId) || tabId === this.currentTab) {
            return;
        }

        console.log(`🔄 Переключение на вкладку: ${tabId}`);

        // Деактивация текущей вкладки
        this.deactivateCurrentTab();

        // Активация новой вкладки
        this.activateTab(tabId);

        // Обновление текущей вкладки
        this.currentTab = tabId;

        // Добавление в историю браузера
        if (addToHistory) {
            const url = new URL(window.location);
            url.searchParams.set('tab', tabId);
            window.history.pushState({ tab: tabId }, `AI Box - ${this.getTabTitle(tabId)}`, url);
        }

        // Обновление заголовка страницы
        document.title = `AI Box - ${this.getTabTitle(tabId)}`;

        // Инициализация компонентов вкладки при первом открытии
        this.initializeTabComponents(tabId);

        // Генерация события переключения вкладки
        this.emit('tabChanged', { from: this.currentTab, to: tabId });
    }

    /**
     * Деактивация текущей вкладки
     */
    deactivateCurrentTab() {
        // Деактивация кнопки
        const currentButton = this.tabButtons.find(btn => 
            btn.getAttribute('data-tab') === this.currentTab
        );
        if (currentButton) {
            currentButton.classList.remove('active');
        }

        // Деактивация панели
        const currentPanel = this.tabPanels.find(panel => 
            panel.id === `${this.currentTab}-panel`
        );
        if (currentPanel) {
            currentPanel.classList.remove('active');
        }
    }

    /**
     * Активация указанной вкладки
     */
    activateTab(tabId) {
        // Активация кнопки
        const newButton = this.tabButtons.find(btn => 
            btn.getAttribute('data-tab') === tabId
        );
        if (newButton) {
            newButton.classList.add('active');
        }

        // Активация панели
        const newPanel = this.tabPanels.find(panel => 
            panel.id === `${tabId}-panel`
        );
        if (newPanel) {
            newPanel.classList.add('active');
        }
    }

    /**
     * Проверка валидности вкладки
     */
    isValidTab(tabId) {
        return this.tabButtons.some(btn => btn.getAttribute('data-tab') === tabId);
    }

    /**
     * Получение ID вкладки из URL
     */
    getTabFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('tab');
    }

    /**
     * Получение заголовка вкладки
     */
    getTabTitle(tabId) {
        const tabTitles = {
            'overview': 'Обзор',
            'chat': 'Чат с AI',
            'rag': 'Документы (RAG)',
            'agents': 'AI Агенты',
            'database': 'База данных',
            'monitoring': 'Мониторинг'
        };
        return tabTitles[tabId] || 'Неизвестная вкладка';
    }

    /**
     * Инициализация компонентов вкладки при первом открытии
     */
    initializeTabComponents(tabId) {
        // Инициализация компонентов только при первом открытии вкладки
        const panel = document.getElementById(`${tabId}-panel`);
        if (panel && !panel.hasAttribute('data-initialized')) {
            
            switch (tabId) {
                case 'overview':
                    this.initOverviewTab();
                    break;
                case 'chat':
                    if (AIBox.modules.chat) {
                        AIBox.modules.chat.init();
                    }
                    break;
                case 'rag':
                    if (AIBox.modules.rag) {
                        AIBox.modules.rag.init();
                    }
                    break;
                case 'agents':
                    if (AIBox.modules.agents) {
                        AIBox.modules.agents.init();
                    }
                    break;
                case 'database':
                    if (AIBox.modules.database) {
                        AIBox.modules.database.init();
                    }
                    break;
                case 'monitoring':
                    if (AIBox.modules.monitoring) {
                        AIBox.modules.monitoring.init();
                    }
                    break;
            }

            panel.setAttribute('data-initialized', 'true');
        }
    }

    /**
     * Инициализация вкладки обзора
     */
    initOverviewTab() {
        console.log('🔄 Инициализация вкладки обзора');
        
        // Здесь можно добавить специфичную логику для вкладки обзора
        // Например, автоматическое обновление статуса сервисов
        if (window.StatusManager) {
            window.StatusManager.checkAllServices();
        }
    }

    /**
     * Получение текущей активной вкладки
     */
    getCurrentTab() {
        return this.currentTab;
    }

    /**
     * Получение списка всех доступных вкладок
     */
    getAvailableTabs() {
        return this.tabButtons.map(btn => btn.getAttribute('data-tab'));
    }

    /**
     * Проверка, инициализирована ли вкладка
     */
    isTabInitialized(tabId) {
        const panel = document.getElementById(`${tabId}-panel`);
        return panel && panel.hasAttribute('data-initialized');
    }

    /**
     * Принудительная повторная инициализация вкладки
     */
    reinitializeTab(tabId) {
        const panel = document.getElementById(`${tabId}-panel`);
        if (panel) {
            panel.removeAttribute('data-initialized');
            if (tabId === this.currentTab) {
                this.initializeTabComponents(tabId);
            }
        }
    }

    /**
     * Добавление обработчика события
     */
    on(event, handler) {
        if (!this.eventHandlers) {
            this.eventHandlers = new Map();
        }
        
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Генерация события
     */
    emit(event, data) {
        if (this.eventHandlers && this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${event}:`, error);
                }
            });
        }
    }

    /**
     * Получение статистики по вкладкам
     */
    getTabsStats() {
        return {
            total: this.tabButtons.length,
            current: this.currentTab,
            initialized: this.tabPanels.filter(panel => 
                panel.hasAttribute('data-initialized')
            ).length,
            available: this.getAvailableTabs()
        };
    }
}