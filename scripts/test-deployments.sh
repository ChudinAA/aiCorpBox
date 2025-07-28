#!/bin/bash

# ========================================
# AI Box Deployment Test Suite
# ========================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Переменные
TEST_RESULTS=()
FAILED_TESTS=0

# Функции
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    TEST_RESULTS+=("✓ $1")
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    TEST_RESULTS+=("✗ $1")
    FAILED_TESTS=$((FAILED_TESTS + 1))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Проверка наличия необходимых инструментов
check_requirements() {
    log_info "Проверка необходимых инструментов..."
    
    # Проверка Docker
    if command -v docker &> /dev/null; then
        log_success "docker установлен"
    else
        log_error "docker не найден"
        return 1
    fi
    
    # Проверка docker-compose с fallback на docker compose
    if command -v docker-compose &> /dev/null; then
        log_success "docker-compose установлен"
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null; then
        log_success "docker compose (plugin) установлен"
        COMPOSE_CMD="docker compose"
    else
        log_error "docker-compose не найден"
        return 1
    fi
    
    # Опциональные инструменты
    for tool in "ansible" "helm" "kubectl"; do
        if command -v $tool &> /dev/null; then
            log_success "$tool установлен (опционально)"
        else
            log_warning "$tool не найден (опционально)"
        fi
    done
}

# Тест структуры проекта
test_project_structure() {
    log_info "Проверка структуры проекта..."
    
    local required_dirs=(
        "services/frontend"
        "services/gateway"
        "services/rag"
        "services/agents"
        "ansible"
        "helm/aibox"
        "scripts"
        "config"
        "docs"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [ -d "$dir" ]; then
            log_success "Директория $dir существует"
        else
            log_error "Директория $dir не найдена"
        fi
    done
    
    local required_files=(
        "docker-compose.yml"
        "scripts/build-and-push-images.sh"
        "scripts/deploy-manager.sh"
        "config/aibox-config.yaml"
        "helm/aibox/Chart.yaml"
        "helm/aibox/values.yaml"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            log_success "Файл $file существует"
        else
            log_error "Файл $file не найден"
        fi
    done
}

# Тест сборки Docker образов
test_docker_build() {
    log_info "Тестирование сборки Docker образов..."
    
    # Проверка наличия Dockerfile в каждом сервисе
    local services=("frontend" "gateway" "rag" "agents")
    for service in "${services[@]}"; do
        if [ -f "services/$service/Dockerfile" ]; then
            log_success "Dockerfile для $service найден"
            
            # Пытаемся собрать образ
            log_info "Сборка образа aibox/$service..."
            if docker build -t "aibox/$service:test" "services/$service" > /dev/null 2>&1; then
                log_success "Образ aibox/$service успешно собран"
                # Удаляем тестовый образ
                docker rmi "aibox/$service:test" > /dev/null 2>&1
            else
                log_error "Ошибка сборки образа aibox/$service"
            fi
        else
            log_error "Dockerfile для $service не найден"
        fi
    done
}

# Тест Docker Compose конфигурации
test_docker_compose() {
    log_info "Проверка конфигурации Docker Compose..."
    
    # Валидация docker-compose.yml
    if $COMPOSE_CMD config > /dev/null 2>&1; then
        log_success "docker-compose.yml валиден"
        
        # Проверка определения сервисов
        local services=$($COMPOSE_CMD config --services 2>/dev/null)
        local expected=("frontend" "gateway" "rag" "agents" "postgres" "qdrant" "ollama")
        
        for service in "${expected[@]}"; do
            if echo "$services" | grep -q "^$service$"; then
                log_success "Сервис $service определен в docker-compose.yml"
            else
                log_error "Сервис $service не найден в docker-compose.yml"
            fi
        done
    else
        log_error "docker-compose.yml содержит ошибки"
    fi
}

# Тест скриптов развертывания
test_deployment_scripts() {
    log_info "Проверка скриптов развертывания..."
    
    # Проверка прав выполнения
    local scripts=(
        "scripts/build-and-push-images.sh"
        "scripts/deploy-manager.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [ -x "$script" ]; then
            log_success "$script имеет права на выполнение"
        else
            log_warning "$script не имеет прав на выполнение"
            chmod +x "$script"
            log_success "Права на выполнение добавлены для $script"
        fi
        
        # Проверка синтаксиса bash
        if bash -n "$script" 2>/dev/null; then
            log_success "$script - синтаксис корректен"
        else
            log_error "$script содержит синтаксические ошибки"
        fi
    done
}

# Тест Ansible конфигурации
test_ansible() {
    log_info "Проверка Ansible конфигурации..."
    
    if ! command -v ansible &> /dev/null; then
        log_warning "Ansible не установлен, пропуск теста"
        return
    fi
    
    # Проверка playbooks
    local playbooks=(
        "ansible/deploy-server.yml"
        "ansible/prepare-cluster.yml"
    )
    
    for playbook in "${playbooks[@]}"; do
        if [ -f "$playbook" ]; then
            log_success "Playbook $playbook существует"
            
            # Проверка синтаксиса YAML
            if python3 -c "import yaml; yaml.safe_load(open('$playbook'))" 2>/dev/null; then
                log_success "$playbook - валидный YAML"
            else
                log_error "$playbook содержит ошибки YAML"
            fi
        else
            log_error "Playbook $playbook не найден"
        fi
    done
}

# Тест Helm charts
test_helm() {
    log_info "Проверка Helm charts..."
    
    if ! command -v helm &> /dev/null; then
        log_warning "Helm не установлен, пропуск теста"
        return
    fi
    
    # Проверка Chart.yaml
    if [ -f "helm/aibox/Chart.yaml" ]; then
        log_success "Chart.yaml существует"
        
        # Валидация chart
        if helm lint helm/aibox > /dev/null 2>&1; then
            log_success "Helm chart валиден"
        else
            log_error "Helm chart содержит ошибки"
            helm lint helm/aibox 2>&1 | grep -E "ERROR|WARNING"
        fi
        
        # Проверка шаблонов
        if helm template test helm/aibox > /dev/null 2>&1; then
            log_success "Helm шаблоны корректно рендерятся"
        else
            log_error "Ошибка рендеринга Helm шаблонов"
        fi
    else
        log_error "Chart.yaml не найден"
    fi
}

# Тест конфигурации
test_configuration() {
    log_info "Проверка конфигурации..."
    
    # Проверка aibox-config.yaml
    if [ -f "config/aibox-config.yaml" ]; then
        log_success "aibox-config.yaml существует"
        
        # Валидация YAML
        if python3 -c "import yaml; yaml.safe_load(open('config/aibox-config.yaml'))" 2>/dev/null; then
            log_success "aibox-config.yaml - валидный YAML"
            
            # Проверка основных секций
            local config=$(python3 -c "import yaml; c=yaml.safe_load(open('config/aibox-config.yaml')); print('services' in c, 'deployment' in c)")
            if [ "$config" == "True True" ]; then
                log_success "Основные секции конфигурации присутствуют"
            else
                log_error "Отсутствуют необходимые секции в конфигурации"
            fi
        else
            log_error "aibox-config.yaml содержит ошибки YAML"
        fi
    else
        log_error "aibox-config.yaml не найден"
    fi
    
    # Проверка .env.example
    if [ -f ".env.example" ]; then
        log_success ".env.example существует"
    else
        log_warning ".env.example не найден"
    fi
}

# Тест портов и сетевого взаимодействия
test_network_configuration() {
    log_info "Проверка сетевой конфигурации..."
    
    # Проверка определения портов в docker-compose
    local expected_ports=(
        "5000:5000"  # frontend
        "8000:8000"  # gateway
        "8001:8001"  # rag
        "8002:8002"  # agents
    )
    
    for port_mapping in "${expected_ports[@]}"; do
        if grep -q "$port_mapping" docker-compose.yml; then
            log_success "Порт $port_mapping определен в docker-compose.yml"
        else
            log_warning "Порт $port_mapping не найден в docker-compose.yml"
        fi
    done
}

# Smoke test для Docker Compose
smoke_test_compose() {
    log_info "Запуск smoke test для Docker Compose..."
    
    # Создаем временный docker-compose для тестирования
    cat > docker-compose.test.yml <<EOF
version: '3.8'
services:
  test-frontend:
    image: nginx:alpine
    ports:
      - "5001:80"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80"]
      interval: 5s
      timeout: 3s
      retries: 3
EOF
    
    # Запускаем тестовый контейнер
    if $COMPOSE_CMD -f docker-compose.test.yml up -d > /dev/null 2>&1; then
        log_success "Тестовый контейнер запущен"
        
        # Ждем готовности
        sleep 5
        
        # Проверяем health
        if $COMPOSE_CMD -f docker-compose.test.yml ps | grep -q "healthy"; then
            log_success "Тестовый контейнер работает корректно"
        else
            log_error "Тестовый контейнер не прошел health check"
        fi
        
        # Останавливаем
        $COMPOSE_CMD -f docker-compose.test.yml down > /dev/null 2>&1
        rm -f docker-compose.test.yml
    else
        log_error "Не удалось запустить тестовый контейнер"
        rm -f docker-compose.test.yml
    fi
}

# Генерация отчета
generate_report() {
    echo ""
    echo "========================================"
    echo "        ОТЧЕТ О ТЕСТИРОВАНИИ"
    echo "========================================"
    echo ""
    
    for result in "${TEST_RESULTS[@]}"; do
        echo "$result"
    done
    
    echo ""
    echo "----------------------------------------"
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}Все тесты пройдены успешно!${NC}"
        echo "AI Box готов к развертыванию"
    else
        echo -e "${RED}Обнаружено $FAILED_TESTS ошибок${NC}"
        echo "Необходимо исправить ошибки перед развертыванием"
    fi
    echo "----------------------------------------"
}

# Основная функция
main() {
    echo "========================================"
    echo "   AI Box Deployment Test Suite v1.0"
    echo "========================================"
    echo ""
    
    # Переход в корневую директорию проекта
    cd "$(dirname "$0")/.."
    
    # Запуск тестов
    check_requirements
    test_project_structure
    test_docker_build
    test_docker_compose
    test_deployment_scripts
    test_ansible
    test_helm
    test_configuration
    test_network_configuration
    
    # Опциональные smoke tests
    read -p "Запустить smoke test для Docker Compose? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        smoke_test_compose
    fi
    
    # Генерация отчета
    generate_report
    
    # Возврат кода ошибки
    exit $FAILED_TESTS
}

# Запуск
main "$@"