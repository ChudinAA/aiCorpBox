#!/bin/bash
# AI Box - Скрипт резервного копирования
# Создает полный бэкап всех данных системы

set -e

# Настройки
BACKUP_DIR="/opt/aibox/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="aibox_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Создание директории для бэкапов
mkdir -p "${BACKUP_DIR}"

echo "🔄 Начинаю создание бэкапа AI Box..."
echo "📅 Время: $(date)"
echo "📁 Путь: ${BACKUP_PATH}"

# Создание временной директории
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

# 1. Бэкап базы данных PostgreSQL
echo "💾 Создание бэкапа PostgreSQL..."
if docker ps | grep -q aibox-postgres; then
    docker exec aibox-postgres pg_dump -U postgres aibox > "${TEMP_DIR}/postgres_dump.sql"
    echo "✅ PostgreSQL бэкап создан"
else
    echo "⚠️  PostgreSQL контейнер не найден, пропускаю"
fi

# 2. Бэкап Qdrant данных
echo "🔍 Создание бэкапа Qdrant..."
if docker ps | grep -q aibox-qdrant; then
    docker exec aibox-qdrant tar -czf /tmp/qdrant_backup.tar.gz -C /qdrant/storage .
    docker cp aibox-qdrant:/tmp/qdrant_backup.tar.gz "${TEMP_DIR}/qdrant_backup.tar.gz"
    echo "✅ Qdrant бэкап создан"
else
    echo "⚠️  Qdrant контейнер не найден, пропускаю"
fi

# 3. Бэкап Ollama моделей
echo "🤖 Создание бэкапа Ollama моделей..."
if docker ps | grep -q aibox-ollama; then
    docker exec aibox-ollama tar -czf /tmp/ollama_backup.tar.gz -C /root/.ollama .
    docker cp aibox-ollama:/tmp/ollama_backup.tar.gz "${TEMP_DIR}/ollama_backup.tar.gz"
    echo "✅ Ollama бэкап создан"
else
    echo "⚠️  Ollama контейнер не найден, пропускаю"
fi

# 4. Бэкап конфигурационных файлов
echo "⚙️ Создание бэкапа конфигурации..."
CONFIG_BACKUP="${TEMP_DIR}/config_backup"
mkdir -p "${CONFIG_BACKUP}"

# Копирование важных файлов конфигурации
if [ -f "config/aibox-config.yaml" ]; then
    cp config/aibox-config.yaml "${CONFIG_BACKUP}/"
fi
if [ -f "docker-compose.yml" ]; then
    cp docker-compose.yml "${CONFIG_BACKUP}/"
fi
if [ -f "docker-compose.local.yml" ]; then
    cp docker-compose.local.yml "${CONFIG_BACKUP}/"
fi
if [ -f ".env" ]; then
    cp .env "${CONFIG_BACKUP}/"
fi
if [ -d "ansible" ]; then
    cp -r ansible "${CONFIG_BACKUP}/"
fi
if [ -d "config" ]; then
    cp -r config "${CONFIG_BACKUP}/app_config"
fi

echo "✅ Конфигурация скопирована"

# 5. Бэкап логов
echo "📝 Создание бэкапа логов..."
LOGS_BACKUP="${TEMP_DIR}/logs_backup"
mkdir -p "${LOGS_BACKUP}"

# Копирование логов Docker контейнеров
for container in aibox-gateway aibox-ollama aibox-postgres aibox-qdrant aibox-prometheus aibox-grafana; do
    if docker ps -a --format "table {{.Names}}" | grep -q "$container"; then
        docker logs "$container" > "${LOGS_BACKUP}/${container}.log" 2>&1 || true
    fi
done

echo "✅ Логи сохранены"

# 6. Создание метаданных бэкапа
echo "📋 Создание метаданных..."
cat > "${TEMP_DIR}/backup_info.txt" << EOF
AI Box Backup Information
========================
Timestamp: $(date)
Backup Name: ${BACKUP_NAME}
Created by: $(whoami)
Host: $(hostname)

Services Status:
$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep aibox || echo "No AI Box containers running")

System Info:
OS: $(lsb_release -d -s 2>/dev/null || uname -s)
Kernel: $(uname -r)
Memory: $(free -h | grep Mem: | awk '{print $2}')
Disk Space: $(df -h / | tail -1 | awk '{print $4}' 2>/dev/null || echo "Unknown")

Backup Contents:
- PostgreSQL database dump
- Qdrant vector database
- Ollama models and data
- Configuration files
- Application logs
- System metadata
EOF

# 7. Создание финального архива
echo "📦 Создание финального архива..."
cd "${TEMP_DIR}"
tar -czf "${BACKUP_PATH}.tar.gz" .

# 8. Вычисление контрольной суммы
echo "🔐 Вычисление контрольной суммы..."
cd "${BACKUP_DIR}"
sha256sum "${BACKUP_NAME}.tar.gz" > "${BACKUP_NAME}.sha256"

# 9. Очистка старых бэкапов (оставляем последние 7)
echo "🧹 Очистка старых бэкапов..."
ls -t aibox_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -t aibox_backup_*.sha256 2>/dev/null | tail -n +8 | xargs -r rm -f

# 10. Статистика
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo ""
echo "✅ Бэкап успешно создан!"
echo "📁 Файл: ${BACKUP_PATH}.tar.gz"
echo "📊 Размер: ${BACKUP_SIZE}"
echo "🔐 Контрольная сумма: ${BACKUP_NAME}.sha256"
echo ""
echo "📋 Список бэкапов:"
ls -lh aibox_backup_*.tar.gz 2>/dev/null || echo "Нет доступных бэкапов"
echo ""
echo "🔄 Для восстановления используйте:"
echo "   ./scripts/restore.sh ${BACKUP_NAME}.tar.gz"