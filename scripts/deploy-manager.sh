#!/bin/bash

# AI Box - Менеджер развертывания
# Управляет развертыванием через Docker Compose, Ansible или Helm
# с поддержкой локальной сборки или использования Docker Hub

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Настройки по умолчанию
DEPLOYMENT_TYPE="${1:-local}"
IMAGE_SOURCE="${2:-build}"  # build или hub
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
VERSION="${AIBOX_VERSION:-1.0.0}"
CONFIG_FILE="config/aibox-config.yaml"

# Функции логирования
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Функция проверки зависимостей
check_dependencies() {
    local deps_missing=false
    
    case "$DEPLOYMENT_TYPE" in
        local)
            if ! command -v docker &> /dev/null; then
                log_error "Docker не установлен"
                deps_missing=true
            fi
            if ! command -v docker-compose &> /dev/null; then
                log_warn "docker-compose не установлен, пробуем docker compose..."
                if ! docker compose version &> /dev/null; then
                    log_error "docker-compose не найден"
                    deps_missing=true
                fi
            fi
            ;;
        server)
            if ! command -v ansible &> /dev/null; then
                log_error "Ansible не установлен"
                deps_missing=true
            fi
            if [ ! -f "ansible/inventory.yml" ]; then
                log_error "Файл ansible/inventory.yml не найден"
                deps_missing=true
            fi
            ;;
        cluster)
            if ! command -v kubectl &> /dev/null; then
                log_error "kubectl не установлен"
                deps_missing=true
            fi
            if ! command -v helm &> /dev/null; then
                log_error "Helm не установлен"
                deps_missing=true
            fi
            ;;
        *)
            log_error "Неизвестный тип развертывания: $DEPLOYMENT_TYPE"
            exit 1
            ;;
    esac
    
    if [ "$deps_missing" = true ]; then
        exit 1
    fi
}

# Функция подготовки образов
prepare_images() {
    log_step "Подготовка Docker образов (${IMAGE_SOURCE})"
    
    if [ "$IMAGE_SOURCE" = "build" ]; then
        log_info "Сборка образов из исходного кода..."
        ./scripts/build-and-push-images.sh local
    elif [ "$IMAGE_SOURCE" = "hub" ]; then
        if [ -z "$DOCKER_REGISTRY" ]; then
            log_error "DOCKER_REGISTRY не установлен для использования Docker Hub"
            echo "Установите: export DOCKER_REGISTRY=your-dockerhub-username"
            exit 1
        fi
        log_info "Использование образов из Docker Hub: ${DOCKER_REGISTRY}"
        
        # Обновляем конфигурацию для использования registry
        update_config_for_hub
    else
        log_error "Неизвестный источник образов: $IMAGE_SOURCE"
        exit 1
    fi
}

# Функция обновления конфигурации для Docker Hub
update_config_for_hub() {
    log_info "Обновление конфигурации для использования Docker Hub..."
    
    case "$DEPLOYMENT_TYPE" in
        local|server)
            # Создаем временный docker-compose с образами из hub
            create_hub_compose
            ;;
        cluster)
            # Обновляем values для Helm
            update_helm_values
            ;;
    esac
}

# Создание docker-compose файла для hub образов
create_hub_compose() {
    cat > docker-compose.hub.yml <<EOF
# AI Box - Docker Compose с образами из Docker Hub
# Автоматически сгенерированный файл

services:
  # Frontend
  frontend:
    image: ${DOCKER_REGISTRY}/aibox/frontend:${VERSION}
    container_name: aibox-frontend
    ports:
      - "\${FRONTEND_PORT:-5000}:5000"
    env_file:
      - .env
    environment:
      - GATEWAY_URL=http://gateway:\${GATEWAY_PORT:-8000}
      - GATEWAY_WS_URL=ws://gateway:\${GATEWAY_PORT:-8000}/ws
      - NODE_ENV=production
    depends_on:
      gateway:
        condition: service_healthy
    networks:
      - aibox-network
    restart: unless-stopped

  # Gateway
  gateway:
    image: ${DOCKER_REGISTRY}/aibox/gateway:${VERSION}
    container_name: aibox-gateway
    ports:
      - "\${GATEWAY_PORT:-8000}:\${GATEWAY_PORT:-8000}"
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_healthy
    networks:
      - aibox-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:\${GATEWAY_PORT:-8000}/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # RAG Service
  rag:
    image: ${DOCKER_REGISTRY}/aibox/rag:${VERSION}
    container_name: aibox-rag
    ports:
      - "\${RAG_PORT:-8001}:\${RAG_PORT:-8001}"
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_healthy
    networks:
      - aibox-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:\${RAG_PORT:-8001}/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Agents Service
  agents:
    image: ${DOCKER_REGISTRY}/aibox/agents:${VERSION}
    container_name: aibox-agents
    ports:
      - "\${AGENTS_PORT:-8002}:\${AGENTS_PORT:-8002}"
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - aibox-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:\${AGENTS_PORT:-8002}/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Ollama
  ollama:
    image: ${DOCKER_REGISTRY}/aibox/ollama:${VERSION}
    container_name: aibox-ollama
    ports:
      - "\${OLLAMA_PORT:-11434}:\${OLLAMA_PORT:-11434}"
    volumes:
      - ollama-data:/root/.ollama
    environment:
      - OLLAMA_ORIGINS=*
    networks:
      - aibox-network
    restart: unless-stopped

  # PostgreSQL
  postgres:
    image: postgres:15
    container_name: aibox-postgres
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-aibox}
      POSTGRES_USER: \${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-password}
    ports:
      - "\${POSTGRES_PORT:-5432}:\${POSTGRES_PORT:-5432}"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./scripts/postgres-init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-postgres}"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - aibox-network
    restart: unless-stopped

  # Qdrant
  qdrant:
    image: qdrant/qdrant:latest
    container_name: aibox-qdrant
    ports:
      - "\${VECTOR_DB_PORT:-6333}:\${VECTOR_DB_PORT:-6333}"
    volumes:
      - qdrant-data:/qdrant/storage
    environment:
      QDRANT__SERVICE__HTTP_PORT: \${VECTOR_DB_PORT:-6333}
      QDRANT__SERVICE__ENABLE_CORS: true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:\${VECTOR_DB_PORT:-6333}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - aibox-network
    restart: unless-stopped

  # Prometheus
  prometheus:
    image: ${DOCKER_REGISTRY}/aibox/monitoring:${VERSION}
    container_name: aibox-prometheus
    ports:
      - "\${PROMETHEUS_PORT:-9090}:\${PROMETHEUS_PORT:-9090}"
    volumes:
      - prometheus-data:/prometheus
    networks:
      - aibox-network
    restart: unless-stopped

  # Grafana
  grafana:
    image: grafana/grafana:latest
    container_name: aibox-grafana
    ports:
      - "\${GRAFANA_PORT:-3000}:\${GRAFANA_PORT:-3000}"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_ADMIN_PASSWORD:-admin}
    volumes:
      - grafana-data:/var/lib/grafana
    networks:
      - aibox-network
    restart: unless-stopped

volumes:
  postgres-data:
  qdrant-data:
  ollama-data:
  prometheus-data:
  grafana-data:

networks:
  aibox-network:
    driver: bridge
EOF
    
    log_info "✓ Создан docker-compose.hub.yml для образов из Docker Hub"
}

# Обновление Helm values для hub
update_helm_values() {
    log_info "Обновление Helm values для Docker Hub..."
    
    cat > config/cluster-values-hub.yaml <<EOF
# AI Box - Helm Values с образами из Docker Hub
# Автоматически сгенерированный файл

global:
  namespace: aibox
  environment: production
  storageClass: fast-ssd
  imageRegistry: "${DOCKER_REGISTRY}"
  imagePullSecrets: []
  imageTag: "${VERSION}"

gateway:
  enabled: true
  image:
    repository: ${DOCKER_REGISTRY}/aibox/gateway
    tag: "${VERSION}"
    pullPolicy: IfNotPresent
  replicas: 3
  service:
    type: ClusterIP
    port: 5000

rag:
  enabled: true
  image:
    repository: ${DOCKER_REGISTRY}/aibox/rag
    tag: "${VERSION}"
    pullPolicy: IfNotPresent
  replicas: 2
  service:
    type: ClusterIP
    port: 8001

agents:
  enabled: true
  image:
    repository: ${DOCKER_REGISTRY}/aibox/agents
    tag: "${VERSION}"
    pullPolicy: IfNotPresent
  replicas: 2
  service:
    type: ClusterIP
    port: 8002

ollama:
  enabled: true
  image:
    repository: ${DOCKER_REGISTRY}/aibox/ollama
    tag: "${VERSION}"
    pullPolicy: IfNotPresent
  replicas: 1
  service:
    type: ClusterIP
    port: 11434

frontend:
  enabled: true
  image:
    repository: ${DOCKER_REGISTRY}/aibox/frontend
    tag: "${VERSION}"
    pullPolicy: IfNotPresent
  replicas: 2
  service:
    type: ClusterIP
    port: 5000

monitoring:
  enabled: true
  image:
    repository: ${DOCKER_REGISTRY}/aibox/monitoring
    tag: "${VERSION}"
    pullPolicy: IfNotPresent
EOF
    
    log_info "✓ Создан config/cluster-values-hub.yaml для Helm"
}

# Развертывание локально
deploy_local() {
    log_step "Локальное развертывание через Docker Compose"
    
    # Проверка .env файла
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            log_info "Создан .env файл из .env.example"
        else
            log_warn ".env файл не найден"
        fi
    fi
    
    # Выбор compose файла
    if [ "$IMAGE_SOURCE" = "hub" ] && [ -f "docker-compose.hub.yml" ]; then
        COMPOSE_FILE="docker-compose.hub.yml"
    else
        COMPOSE_FILE="docker-compose.local.yml"
    fi
    
    log_info "Использование: ${COMPOSE_FILE}"
    
    # Остановка существующих контейнеров
    docker-compose -f "${COMPOSE_FILE}" down 2>/dev/null || true
    
    # Запуск сервисов
    docker-compose -f "${COMPOSE_FILE}" up -d
    
    if [ $? -eq 0 ]; then
        log_info "✓ Сервисы запущены успешно"
        log_info ""
        log_info "Доступ к сервисам:"
        log_info "  Frontend: http://localhost:5000"
        log_info "  Gateway API: http://localhost:8000/docs"
        log_info "  Grafana: http://localhost:3000"
        log_info "  Prometheus: http://localhost:9090"
    else
        log_error "Ошибка при запуске сервисов"
        exit 1
    fi
}

# Развертывание на сервере
deploy_server() {
    log_step "Серверное развертывание через Ansible"
    
    # Подготовка переменных для Ansible
    export AIBOX_IMAGE_SOURCE="${IMAGE_SOURCE}"
    export AIBOX_DOCKER_REGISTRY="${DOCKER_REGISTRY}"
    export AIBOX_VERSION="${VERSION}"
    
    # Создание временного vars файла
    cat > ansible/vars/deployment.yml <<EOF
---
# Автоматически сгенерированные переменные развертывания
aibox_image_source: "${IMAGE_SOURCE}"
aibox_docker_registry: "${DOCKER_REGISTRY}"
aibox_version: "${VERSION}"
aibox_compose_file: "$([ "$IMAGE_SOURCE" = "hub" ] && echo "docker-compose.hub.yml" || echo "docker-compose.prod.yml")"
EOF
    
    # Запуск Ansible playbook
    ansible-playbook -i ansible/inventory.yml ansible/deploy-server.yml \
        -e "@ansible/vars/deployment.yml"
    
    if [ $? -eq 0 ]; then
        log_info "✓ Серверное развертывание выполнено успешно"
    else
        log_error "Ошибка при серверном развертывании"
        exit 1
    fi
}

# Развертывание в кластере
deploy_cluster() {
    log_step "Кластерное развертывание через Helm"
    
    # Подготовка кластера
    if [ -f "ansible/cluster-inventory.yml" ]; then
        log_info "Подготовка кластера через Ansible..."
        ansible-playbook -i ansible/cluster-inventory.yml ansible/prepare-cluster.yml
    fi
    
    # Выбор values файла
    if [ "$IMAGE_SOURCE" = "hub" ] && [ -f "config/cluster-values-hub.yaml" ]; then
        VALUES_FILE="config/cluster-values-hub.yaml"
    else
        VALUES_FILE="config/cluster-values.yaml"
    fi
    
    log_info "Использование values: ${VALUES_FILE}"
    
    # Создание namespace
    kubectl create namespace aibox 2>/dev/null || true
    
    # Установка через Helm
    helm upgrade --install aibox ./helm/aibox \
        -f "${VALUES_FILE}" \
        --namespace aibox \
        --wait \
        --timeout 10m
    
    if [ $? -eq 0 ]; then
        log_info "✓ Кластерное развертывание выполнено успешно"
        log_info ""
        log_info "Проверка статуса:"
        kubectl get pods -n aibox
    else
        log_error "Ошибка при кластерном развертывании"
        exit 1
    fi
}

# Главная функция
main() {
    echo ""
    log_info "============================================="
    log_info "   AI Box - Менеджер развертывания v${VERSION}"
    log_info "============================================="
    log_info "Тип развертывания: ${DEPLOYMENT_TYPE}"
    log_info "Источник образов: ${IMAGE_SOURCE}"
    
    if [ "$IMAGE_SOURCE" = "hub" ]; then
        log_info "Docker Registry: ${DOCKER_REGISTRY:-не установлен}"
    fi
    
    echo ""
    
    # Проверка зависимостей
    check_dependencies
    
    # Подготовка образов
    prepare_images
    
    # Развертывание в зависимости от типа
    case "$DEPLOYMENT_TYPE" in
        local)
            deploy_local
            ;;
        server)
            deploy_server
            ;;
        cluster)
            deploy_cluster
            ;;
        *)
            log_error "Неизвестный тип развертывания: $DEPLOYMENT_TYPE"
            echo "Использование: $0 [local|server|cluster] [build|hub]"
            exit 1
            ;;
    esac
    
    echo ""
    log_info "============================================="
    log_info "✓ Развертывание завершено успешно!"
    log_info "============================================="
}

# Запуск
main