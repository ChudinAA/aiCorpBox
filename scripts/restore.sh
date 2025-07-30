#!/bin/bash
# AI Box - Скрипт восстановления из бэкапа
# Восстанавливает систему из архива бэкапа

set -e

# Проверка аргументов
if [ $# -ne 1 ]; then
    echo "❌ Использование: $0 <путь_к_бэкапу.tar.gz>"
    echo ""
    echo "📋 Доступные бэкапы:"
    ls -lh /opt/aibox/backups/aibox_backup_*.tar.gz 2>/dev/null || echo "Нет доступных бэкапов"
    exit 1
fi

BACKUP_FILE="$1"
RESTORE_DIR="/tmp/aibox_restore_$$"
BACKUP_DIR="/opt/aibox/backups"

# Проверка существования файла бэкапа
if [ ! -f "$BACKUP_FILE" ]; then
    if [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
        BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    else
        echo "❌ Файл бэкапа не найден: $BACKUP_FILE"
        exit 1
    fi
fi

echo "🔄 Начинаю восстановление AI Box из бэкапа..."
echo "📅 Время: $(date)"
echo "📁 Бэкап: $(basename "$BACKUP_FILE")"

# Проверка контрольной суммы
BACKUP_NAME=$(basename "$BACKUP_FILE" .tar.gz)
CHECKSUM_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sha256"

if [ -f "$CHECKSUM_FILE" ]; then
    echo "🔐 Проверка контрольной суммы..."
    cd "$(dirname "$BACKUP_FILE")"
    if sha256sum -c "$CHECKSUM_FILE" >/dev/null 2>&1; then
        echo "✅ Контрольная сумма верна"
    else
        echo "❌ Ошибка контрольной суммы! Файл может быть поврежден."
        read -p "Продолжить восстановление? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Создание временной директории
mkdir -p "$RESTORE_DIR"
trap "rm -rf $RESTORE_DIR" EXIT

# Распаковка бэкапа
echo "📦 Распаковка бэкапа..."
tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR"

# Проверка содержимого
if [ ! -f "$RESTORE_DIR/backup_info.txt" ]; then
    echo "❌ Неверный формат бэкапа - отсутствует backup_info.txt"
    exit 1
fi

echo "📋 Информация о бэкапе:"
cat "$RESTORE_DIR/backup_info.txt"
echo ""

# Подтверждение восстановления
echo "⚠️  ВНИМАНИЕ: Восстановление перезапишет текущие данные!"
read -p "Продолжить восстановление? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Восстановление отменено пользователем"
    exit 1
fi

# Остановка существующих контейнеров
echo "⏹️  Остановка текущих контейнеров..."
docker-compose down 2>/dev/null || true
docker-compose -f docker-compose.local.yml down 2>/dev/null || true

# Удаление старых volume
echo "🗑️  Очистка старых данных..."
docker volume rm aibox_postgres-data 2>/dev/null || true
docker volume rm aibox_qdrant-data 2>/dev/null || true
docker volume rm aibox_ollama-data 2>/dev/null || true
docker volume rm aibox_prometheus-data 2>/dev/null || true
docker volume rm aibox_grafana-data 2>/dev/null || true

# Восстановление конфигурационных файлов
echo "⚙️ Восстановление конфигурации..."
if [ -d "$RESTORE_DIR/config_backup" ]; then
    # Создание резервной копии текущей конфигурации
    if [ -d "config" ]; then
        mv config config.backup.$(date +%s) 2>/dev/null || true
    fi
    
    # Восстановление файлов конфигурации
    [ -f "$RESTORE_DIR/config_backup/aibox-config.yaml" ] && cp "$RESTORE_DIR/config_backup/aibox-config.yaml" config/ 2>/dev/null || true
    [ -f "$RESTORE_DIR/config_backup/docker-compose.yml" ] && cp "$RESTORE_DIR/config_backup/docker-compose.yml" . 2>/dev/null || true
    [ -f "$RESTORE_DIR/config_backup/docker-compose.local.yml" ] && cp "$RESTORE_DIR/config_backup/docker-compose.local.yml" . 2>/dev/null || true
    [ -f "$RESTORE_DIR/config_backup/.env" ] && cp "$RESTORE_DIR/config_backup/.env" . 2>/dev/null || true
    [ -d "$RESTORE_DIR/config_backup/ansible" ] && cp -r "$RESTORE_DIR/config_backup/ansible" . 2>/dev/null || true
    [ -d "$RESTORE_DIR/config_backup/app_config" ] && cp -r "$RESTORE_DIR/config_backup/app_config" config/ 2>/dev/null || true
    
    echo "✅ Конфигурация восстановлена"
fi

# Запуск новых контейнеров
echo "🚀 Запуск контейнеров..."
if [ -f "docker-compose.local.yml" ]; then
    docker-compose -f docker-compose.local.yml up -d postgres qdrant ollama
else
    docker-compose up -d postgres qdrant ollama
fi

# Ожидание готовности служб
echo "⏳ Ожидание готовности служб..."
sleep 30

# Восстановление базы данных PostgreSQL
if [ -f "$RESTORE_DIR/postgres_dump.sql" ]; then
    echo "💾 Восстановление PostgreSQL..."
    docker exec -i aibox-postgres psql -U postgres -d aibox < "$RESTORE_DIR/postgres_dump.sql"
    echo "✅ PostgreSQL восстановлена"
fi

# Восстановление Qdrant данных
if [ -f "$RESTORE_DIR/qdrant_backup.tar.gz" ]; then
    echo "🔍 Восстановление Qdrant..."
    docker cp "$RESTORE_DIR/qdrant_backup.tar.gz" aibox-qdrant:/tmp/
    docker exec aibox-qdrant bash -c "cd /qdrant/storage && tar -xzf /tmp/qdrant_backup.tar.gz"
    docker restart aibox-qdrant
    echo "✅ Qdrant восстановлена"
fi

# Восстановление Ollama моделей
if [ -f "$RESTORE_DIR/ollama_backup.tar.gz" ]; then
    echo "🤖 Восстановление Ollama моделей..."
    docker cp "$RESTORE_DIR/ollama_backup.tar.gz" aibox-ollama:/tmp/
    docker exec aibox-ollama bash -c "cd /root/.ollama && tar -xzf /tmp/ollama_backup.tar.gz"
    docker restart aibox-ollama
    echo "✅ Ollama модели восстановлены"
fi

# Запуск остальных сервисов
echo "🔄 Запуск всех сервисов..."
if [ -f "docker-compose.local.yml" ]; then
    docker-compose -f docker-compose.local.yml up -d
else
    docker-compose up -d
fi

# Проверка статуса
echo "🔍 Проверка статуса сервисов..."
sleep 10
docker-compose ps

# Проверка подключения к базе данных
echo "🔌 Проверка подключения к PostgreSQL..."
if docker exec aibox-postgres psql -U postgres -d aibox -c "SELECT COUNT(*) FROM information_schema.tables;" >/dev/null 2>&1; then
    echo "✅ PostgreSQL работает корректно"
else
    echo "⚠️ Проблемы с подключением к PostgreSQL"
fi

# Проверка Qdrant
echo "🔌 Проверка подключения к Qdrant..."
if curl -s http://localhost:6333/health >/dev/null 2>&1; then
    echo "✅ Qdrant работает корректно"
else
    echo "⚠️ Проблемы с подключением к Qdrant"
fi

# Восстановление логов (опционально)
if [ -d "$RESTORE_DIR/logs_backup" ]; then
    echo "📝 Архивирование логов из бэкапа..."
    LOGS_ARCHIVE_DIR="/opt/aibox/logs/restored_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$LOGS_ARCHIVE_DIR"
    cp -r "$RESTORE_DIR/logs_backup"/* "$LOGS_ARCHIVE_DIR/" 2>/dev/null || true
    echo "✅ Логи архивированы в $LOGS_ARCHIVE_DIR"
fi

echo ""
echo "✅ Восстановление завершено успешно!"
echo "🌐 Веб-интерфейс: http://localhost:5000"
echo "📊 Мониторинг: http://localhost:3000"
echo "📖 API документация: http://localhost:5000/docs"
echo ""
echo "🔍 Проверьте работу системы:"
echo "   docker-compose ps"
echo "   curl http://localhost:5000/health"
echo ""
echo "📋 Для создания нового бэкапа используйте:"
echo "   ./scripts/backup.sh"