#!/bin/bash
# AI Box - Развертывание по кнопке
# Максимально простой скрипт для любой инфраструктуры

set -e

DEPLOYMENT_TYPE=${1:-local}
GREEN='\033[0;32m'
BLUE='\033[0;34m' 
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Справка
if [[ "$DEPLOYMENT_TYPE" = "help" || ! "$DEPLOYMENT_TYPE" =~ ^(local|server|cluster)$ ]]; then
    echo "🚀 AI Box - Развертывание по кнопке"
    echo ""
    echo "Использование: $0 [local|server|cluster]"
    echo ""
    echo "📱 local   - Локально (Docker Compose)"
    echo "🖥️  server  - На сервере (Ansible + Docker)"  
    echo "☸️  cluster - В кластере (Kubernetes + Helm)"
    echo ""
    exit 0
fi

log_info "🚀 Запускаю AI Box: $DEPLOYMENT_TYPE"

# Локальное развертывание
if [ "$DEPLOYMENT_TYPE" = "local" ]; then
    # Проверка Docker
    if ! command -v docker >/dev/null 2>&1; then
        log_info "📦 Устанавливаю Docker..."
        curl -fsSL https://get.docker.com | sh
        sudo systemctl start docker
        sudo usermod -aG docker $USER
    fi

    # Проверка .env файла
    if [ ! -f .env ]; then
        log_info "⚙️ Копирую .env.example в .env..."
        cp .env.example .env
        log_warning "Отредактируйте .env файл при необходимости"
    fi

    # Остановка и запуск
    log_info "🔄 Запускаю сервисы..."
    docker-compose -f docker-compose.local.yml down 2>/dev/null || true
    docker-compose -f docker-compose.local.yml up -d

    # Ожидание готовности
    log_info "⏳ Ожидание готовности..."
    sleep 10

    log_success "🎉 AI Box запущен локально! AI модель загружается при первом использовании"
    echo ""
    echo "🌐 Доступ: http://localhost:5000"
    echo "📖 API: http://localhost:5000/docs"
    echo "📊 Мониторинг: http://localhost:3000"
fi

# Серверное развертывание
if [ "$DEPLOYMENT_TYPE" = "server" ]; then
    # Проверка Ansible
    if ! command -v ansible >/dev/null 2>&1; then
        log_info "📦 Устанавливаю Ansible..."
        pip3 install --user ansible || sudo apt install -y ansible
    fi

    # Проверка inventory
    if [ ! -f "ansible/inventory.yml" ]; then
        log_error "Создайте файл ansible/inventory.yml с настройками сервера"
        exit 1
    fi

    log_info "🔄 Развертывание на сервере..."
    ansible-playbook -i ansible/inventory.yml ansible/deploy-server.yml

    log_success "🎉 AI Box развернут на сервере!"
fi

# Кластерное развертывание  
if [ "$DEPLOYMENT_TYPE" = "cluster" ]; then
    # Проверка инструментов
    for tool in kubectl helm ansible; do
        if ! command -v $tool >/dev/null 2>&1; then
            log_error "Установите $tool для кластерного развертывания"
            exit 1
        fi
    done

    # Проверка inventory
    if [ ! -f "ansible/cluster-inventory.yml" ]; then
        log_error "Создайте файл ansible/cluster-inventory.yml с настройками кластера"
        exit 1
    fi

    log_info "🔧 Подготовка кластера..."
    ansible-playbook -i ansible/cluster-inventory.yml ansible/prepare-cluster.yml

    log_info "📦 Установка через Helm..."
    helm install aibox ./helm/aibox -f config/cluster-values.yaml --create-namespace --namespace aibox

    log_success "🎉 AI Box развернут в кластере!"
    echo "🔍 Статус: kubectl get pods -n aibox"
fi

log_info "📚 Команды:"
echo "  🔍 Статус: docker-compose ps"
echo "  📝 Логи: docker-compose logs -f"  
echo "  💾 Бэкап: ./scripts/backup.sh"
echo "  🔄 Восстановление: ./scripts/restore.sh"