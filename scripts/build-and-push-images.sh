#!/bin/bash

# AI Box - Скрипт сборки и публикации Docker образов
# Использование:
#   ./build-and-push-images.sh [local|hub]
#   local - только локальная сборка
#   hub - сборка и публикация в Docker Hub

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Настройки
REGISTRY="${DOCKER_REGISTRY:-}"
VERSION="${AIBOX_VERSION:-1.0.0}"
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
MODE="${1:-local}"

# Функция логирования
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка зависимостей
check_dependencies() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker не установлен"
        exit 1
    fi

    if [ "$MODE" = "hub" ]; then
        if [ -z "$DOCKER_HUB_USERNAME" ]; then
            log_error "Переменная DOCKER_HUB_USERNAME не установлена"
            echo "Установите: export DOCKER_HUB_USERNAME=your-username"
            exit 1
        fi
        if [ -z "$DOCKER_HUB_PASSWORD" ] && [ -z "$DOCKER_HUB_TOKEN" ]; then
            log_error "Переменная DOCKER_HUB_PASSWORD или DOCKER_HUB_TOKEN не установлена"
            echo "Установите: export DOCKER_HUB_TOKEN=your-token"
            exit 1
        fi
        REGISTRY="${DOCKER_HUB_USERNAME}"
    fi
}

# Функция сборки образа
build_image() {
    local service=$1
    local dockerfile=$2
    local context=$3
    local tag_base="${REGISTRY:+${REGISTRY}/}aibox/${service}"
    
    log_info "Сборка образа: ${service}"
    
    # Добавляем лейблы с метаданными
    docker build \
        --label "org.opencontainers.image.created=${BUILD_DATE}" \
        --label "org.opencontainers.image.version=${VERSION}" \
        --label "org.opencontainers.image.revision=${GIT_COMMIT}" \
        --label "org.opencontainers.image.source=https://github.com/aibox/aibox" \
        --label "org.opencontainers.image.vendor=AI Box Team" \
        --label "org.opencontainers.image.title=AI Box ${service}" \
        --label "org.opencontainers.image.description=AI Box ${service} service" \
        -f "${dockerfile}" \
        -t "${tag_base}:${VERSION}" \
        -t "${tag_base}:latest" \
        "${context}"
    
    if [ $? -eq 0 ]; then
        log_info "✓ Образ ${service} собран успешно: ${tag_base}:${VERSION}"
    else
        log_error "✗ Ошибка при сборке образа ${service}"
        exit 1
    fi
}

# Функция публикации образа
push_image() {
    local service=$1
    local tag_base="${REGISTRY}/aibox/${service}"
    
    if [ "$MODE" = "hub" ]; then
        log_info "Публикация образа ${service} в Docker Hub..."
        
        docker push "${tag_base}:${VERSION}"
        docker push "${tag_base}:latest"
        
        if [ $? -eq 0 ]; then
            log_info "✓ Образ ${service} опубликован: ${tag_base}:${VERSION}"
        else
            log_error "✗ Ошибка при публикации образа ${service}"
            exit 1
        fi
    fi
}

# Вход в Docker Hub
docker_login() {
    if [ "$MODE" = "hub" ]; then
        log_info "Вход в Docker Hub..."
        
        if [ -n "$DOCKER_HUB_TOKEN" ]; then
            echo "${DOCKER_HUB_TOKEN}" | docker login -u "${DOCKER_HUB_USERNAME}" --password-stdin
        else
            echo "${DOCKER_HUB_PASSWORD}" | docker login -u "${DOCKER_HUB_USERNAME}" --password-stdin
        fi
        
        if [ $? -eq 0 ]; then
            log_info "✓ Успешный вход в Docker Hub"
        else
            log_error "✗ Ошибка входа в Docker Hub"
            exit 1
        fi
    fi
}

# Основной процесс сборки
main() {
    log_info "==========================================="
    log_info "AI Box - Сборка Docker образов"
    log_info "==========================================="
    log_info "Режим: ${MODE}"
    log_info "Версия: ${VERSION}"
    log_info "Git commit: ${GIT_COMMIT}"
    
    check_dependencies
    
    # Переходим в корневую директорию проекта
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    cd "${SCRIPT_DIR}/.."
    
    # Вход в Docker Hub если нужно
    docker_login
    
    # Список сервисов для сборки
    declare -A services=(
        ["gateway"]="services/gateway/Dockerfile services/gateway"
        ["rag"]="services/rag/Dockerfile services/rag"
        ["agents"]="services/agents/Dockerfile services/agents"
        ["ollama"]="services/ollama/Dockerfile services/ollama"
        ["monitoring"]="services/monitoring/Dockerfile services/monitoring"
        ["frontend"]="services/frontend/Dockerfile services/frontend"
    )
    
    # Счетчики
    total=${#services[@]}
    current=0
    
    # Сборка всех образов
    for service in "${!services[@]}"; do
        current=$((current + 1))
        log_info "[${current}/${total}] Обработка сервиса: ${service}"
        
        # Разбираем параметры сборки
        params=(${services[$service]})
        dockerfile="${params[0]}"
        context="${params[1]}"
        
        # Проверяем существование Dockerfile
        if [ ! -f "${dockerfile}" ]; then
            log_warn "Dockerfile не найден для ${service}: ${dockerfile}, пропускаем..."
            continue
        fi
        
        # Сборка образа
        build_image "${service}" "${dockerfile}" "${context}"
        
        # Публикация если указан режим hub
        push_image "${service}"
    done
    
    log_info "==========================================="
    
    if [ "$MODE" = "hub" ]; then
        log_info "✓ Все образы собраны и опубликованы в Docker Hub"
        log_info ""
        log_info "Образы доступны по адресам:"
        for service in "${!services[@]}"; do
            echo "  - ${REGISTRY}/aibox/${service}:${VERSION}"
        done
    else
        log_info "✓ Все образы собраны локально"
        log_info ""
        log_info "Локальные образы:"
        for service in "${!services[@]}"; do
            echo "  - aibox/${service}:${VERSION}"
        done
    fi
    
    log_info ""
    log_info "Для использования в Helm установите:"
    log_info "  export DOCKER_REGISTRY=${REGISTRY}"
    log_info "  helm install aibox ./helm/aibox --set global.imageRegistry=${REGISTRY}"
}

# Запуск
main