#!/bin/bash
# AI Box - Скрипт быстрого развертывания
# Простое развертывание одним нажатием для любой инфраструктуры

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Логирование
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка аргументов
if [ $# -eq 0 ]; then
    echo "AI Box - Инструмент быстрого развертывания"
    echo ""
    echo "Использование:"
    echo "  $0 local     - Развертывание на локальной машине"
    echo "  $0 server    - Развертывание на удаленном сервере"
    echo "  $0 cluster   - Развертывание на кластере"
    echo ""
    echo "Примеры:"
    echo "  $0 local                    # Быстрое локальное развертывание"
    echo "  $0 server                   # Развертывание на сервере через Ansible"
    echo "  $0 cluster                  # Развертывание на кластере K8s+Helm"
    echo ""
    exit 1
fi

DEPLOYMENT_TYPE=$1
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/aibox-config.yaml"

# Проверка конфигурационного файла
if [ ! -f "$CONFIG_FILE" ]; then
    log_info "Создаю конфигурационный файл по умолчанию..."
    python3 deploy.py --create-config
fi

log_info "🚀 Начинаю развертывание AI Box: $DEPLOYMENT_TYPE"
echo "=================================================="

case $DEPLOYMENT_TYPE in
    "local")
        log_info "📋 Локальное развертывание на этой машине"
        
        # Проверка Docker
        if ! command -v docker &> /dev/null; then
            log_warning "Docker не установлен. Устанавливаю..."
            if [[ "$OSTYPE" == "linux-gnu"* ]]; then
                curl -fsSL https://get.docker.com -o get-docker.sh
                sh get-docker.sh
                sudo systemctl enable docker
                sudo systemctl start docker
                sudo usermod -aG docker $USER
                log_success "Docker установлен. Возможно потребуется перелогиниться."
            else
                log_error "Автоматическая установка Docker поддерживается только на Linux"
                log_info "Установите Docker вручную: https://docs.docker.com/get-docker/"
                exit 1
            fi
        fi
        
        # Проверка Docker Compose
        if ! command -v docker-compose &> /dev/null; then
            log_info "Устанавливаю Docker Compose..."
            sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
        fi
        
        # Создание docker-compose файла
        log_info "⚙️ Создаю конфигурацию Docker Compose..."
        cat > docker-compose.local.yml << 'EOF'
version: '3.8'

services:
  # AI Box Gateway - основной вход в систему
  gateway:
    image: python:3.11-slim
    ports:
      - "5000:5000"
    volumes:
      - .:/app
    working_dir: /app
    command: >
      bash -c "
        pip install --no-cache-dir -r requirements.txt &&
        python demo_gateway.py
      "
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/aibox
      - QDRANT_URL=http://qdrant:6333
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - postgres
      - qdrant
      - ollama
    networks:
      - aibox-network
    restart: unless-stopped

  # Ollama - локальные языковые модели
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - aibox-network
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # PostgreSQL - основная база данных
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: aibox
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - aibox-network
    restart: unless-stopped

  # Qdrant - векторная база данных
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant-data:/qdrant/storage
    networks:
      - aibox-network
    restart: unless-stopped

  # Prometheus - сбор метрик
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    networks:
      - aibox-network
    restart: unless-stopped

  # Grafana - дашборды мониторинга
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
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

        # Создание requirements.txt если его нет
        if [ ! -f "requirements.txt" ]; then
            log_info "📦 Создаю requirements.txt..."
            cat > requirements.txt << 'EOF'
fastapi==0.104.1
uvicorn==0.24.0
sqlalchemy==2.0.23
psycopg2-binary==2.9.9
pydantic==2.5.0
structlog==23.2.0
prometheus-client==0.19.0
aiohttp==3.9.1
PyYAML==6.0.1
EOF
        fi
        
        # Создание конфигурации Prometheus
        mkdir -p config
        cat > config/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'aibox-gateway'
    static_configs:
      - targets: ['gateway:5000']
    metrics_path: '/metrics'
    scrape_interval: 5s
EOF
        
        log_info "🔄 Запускаю контейнеры..."
        docker-compose -f docker-compose.local.yml up -d
        
        log_info "⏱️ Ждем готовности сервисов..."
        sleep 30
        
        # Проверка здоровья
        if curl -s http://localhost:5000/health > /dev/null; then
            log_success "✅ AI Box успешно развернут локально!"
            echo ""
            echo "🌐 Веб-интерфейс: http://localhost:5000"
            echo "📚 API документация: http://localhost:5000/docs"
            echo "📊 Grafana: http://localhost:3000 (admin/admin)"
            echo "🔍 Prometheus: http://localhost:9090"
            echo "❤️  Статус: http://localhost:5000/health"
            echo ""
            echo "Для загрузки AI моделей:"
            echo "curl -X POST http://localhost:11434/api/pull -d '{\"name\":\"llama3.1\"}'"
        else
            log_error "❌ Сервисы не запустились корректно"
            log_info "Проверьте логи: docker-compose -f docker-compose.local.yml logs"
        fi
        ;;
        
    "server")
        log_info "🌐 Развертывание на удаленном сервере"
        
        # Проверка Ansible
        if ! command -v ansible-playbook &> /dev/null; then
            log_info "📦 Устанавливаю Ansible..."
            if command -v pip3 &> /dev/null; then
                pip3 install ansible
            elif command -v apt &> /dev/null; then
                sudo apt update
                sudo apt install -y ansible
            elif command -v yum &> /dev/null; then
                sudo yum install -y ansible
            else
                log_error "Не удалось установить Ansible автоматически"
                exit 1
            fi
        fi
        
        log_info "🔧 Запускаю развертывание через Ansible..."
        ansible-playbook -i ansible/inventory.yml ansible/deploy-server.yml
        ;;
        
    "cluster")
        log_info "☸️ Развертывание на кластере Kubernetes"
        
        # Проверка необходимых инструментов
        missing_tools=()
        for tool in kubectl helm ansible-playbook; do
            if ! command -v $tool &> /dev/null; then
                missing_tools+=($tool)
            fi
        done
        
        if [ ${#missing_tools[@]} -ne 0 ]; then
            log_error "Отсутствуют необходимые инструменты: ${missing_tools[*]}"
            log_info "Установите их перед развертыванием кластера"
            exit 1
        fi
        
        log_info "🔧 Подготовка кластера через Ansible..."
        ansible-playbook -i ansible/cluster-inventory.yml ansible/prepare-cluster.yml
        
        log_info "📦 Развертывание через Helm..."
        helm install aibox ./helm/aibox -f config/cluster-values.yaml --create-namespace --namespace aibox
        
        log_success "✅ AI Box развернут на кластере!"
        log_info "Проверьте статус: kubectl get pods -n aibox"
        ;;
        
    *)
        log_error "Неизвестный тип развертывания: $DEPLOYMENT_TYPE"
        log_info "Доступные типы: local, server, cluster"
        exit 1
        ;;
esac

log_success "🎉 Развертывание завершено!"
echo "📖 Документация: ./docs/"
echo "⚙️ Конфигурация: ./config/aibox-config.yaml"