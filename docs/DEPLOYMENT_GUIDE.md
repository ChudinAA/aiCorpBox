# AI Box - Руководство по развертыванию

Простое и быстрое развертывание AI Box в любой корпоративной инфраструктуре одним нажатием.

## Быстрый старт

### 1. Локальное развертывание (1 команда)

```bash
./quick-deploy.sh local
```

**Что происходит автоматически:**
- Проверка и установка Docker
- Создание конфигурационных файлов
- Загрузка всех необходимых образов
- Запуск всех сервисов AI Box
- Настройка мониторинга

**Результат:** AI Box работает на http://localhost:5000

### 2. Развертывание на сервере (1 команда)

```bash
./quick-deploy.sh server
```

**Что происходит автоматически:**
- Установка Docker на удаленном сервере
- Настройка брандмауэра и безопасности
- Копирование всех файлов проекта
- Сборка и запуск контейнеров
- Настройка автозапуска и мониторинга

**Результат:** AI Box работает на вашем сервере

### 3. Кластерное развертывание (1 команда)

```bash
./quick-deploy.sh cluster
```

**Что происходит автоматически:**
- Подготовка кластера Kubernetes
- Установка Helm charts
- Настройка масштабирования
- Настройка балансировки нагрузки

**Результат:** AI Box работает в кластере

## Детальная документация

### Архитектура системы

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Пользователи  │───▶│ Load Balancer   │───▶│  API Gateway    │
│   и Приложения  │    │   (Nginx)       │    │   (Port 5000)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌────────────────────────────────┼────────────────────────────────┐
                       │                                │                                │
                       ▼                                ▼                                ▼
            ┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
            │  Ollama LLM     │            │   RAG Service   │            │  AI Agents      │
            │  (Port 11434)   │            │  (Port 8001)    │            │  (Port 8002)    │
            └─────────────────┘            └─────────────────┘            └─────────────────┘
                       │                                │                                │
                       │                                ▼                                ▼
                       │                    ┌─────────────────┐            ┌─────────────────┐
                       │                    │  Qdrant Vector  │            │   PostgreSQL    │
                       │                    │   Database      │            │   Database      │
                       │                    │  (Port 6333)    │            │  (Port 5432)    │
                       │                    └─────────────────┘            └─────────────────┘
                       │
                       ▼
            ┌─────────────────┐            ┌─────────────────┐
            │   Prometheus    │            │     Grafana     │
            │  (Port 9090)    │───────────▶│  (Port 3000)    │
            └─────────────────┘            └─────────────────┘
```

### Системные требования

#### Минимальные (для тестирования)
- **CPU:** 2 ядра
- **RAM:** 4 GB
- **Диск:** 20 GB
- **ОС:** Linux (Ubuntu 20.04+, CentOS 8+)

#### Рекомендуемые (для production)
- **CPU:** 8 ядер
- **RAM:** 16 GB
- **Диск:** 100 GB SSD
- **GPU:** Опционально для ускорения LLM
- **ОС:** Linux (Ubuntu 22.04+, RHEL 9+)

#### Для кластера
- **Узлы:** 3+ серверов
- **CPU на узел:** 4+ ядер
- **RAM на узел:** 8+ GB
- **Сеть:** 1 Gbps между узлами
- **Kubernetes:** v1.25+

## Типы развертывания

### 1. Локальное развертывание

**Когда использовать:**
- Разработка и тестирование
- Демонстрация возможностей
- Небольшая команда (до 10 пользователей)

**Особенности:**
- Все сервисы на одной машине
- Docker Compose управление
- Простая настройка и отладка
- Минимальные требования к ресурсам

**Команды управления:**
```bash
# Запуск
./quick-deploy.sh local

# Остановка
docker-compose -f docker-compose.local.yml down

# Перезапуск
docker-compose -f docker-compose.local.yml restart

# Логи
docker-compose -f docker-compose.local.yml logs -f

# Обновление
docker-compose -f docker-compose.local.yml pull
docker-compose -f docker-compose.local.yml up -d
```

### 2. Серверное развертывание

**Когда использовать:**
- Продуктивная среда
- Средняя команда (10-100 пользователей)
- Корпоративная сеть

**Особенности:**
- Автоматическая настройка сервера
- Настройка безопасности и брандмауэра
- Автозапуск и мониторинг
- Регулярные бэкапы

**Настройка сервера:**

1. **Подготовьте inventory файл:**
```yaml
# ansible/inventory.yml
aibox_servers:
  hosts:
    production-server.company.com:
      ansible_user: admin
      ansible_ssh_private_key_file: ~/.ssh/id_rsa
```

2. **Настройте конфигурацию:**
```yaml
# config/aibox-config.yaml
infrastructure:
  server:
    ansible_host: "production-server.company.com"
    ansible_user: "admin"
    ssh_key_path: "~/.ssh/id_rsa"
```

3. **Запустите развертывание:**
```bash
./quick-deploy.sh server
```

**Управление на сервере:**
```bash
# SSH на сервер
ssh admin@production-server.company.com

# Статус сервисов
sudo systemctl status aibox

# Логи
sudo journalctl -u aibox -f

# Перезапуск
sudo systemctl restart aibox

# Бэкап
sudo -u aibox /opt/aibox/app/scripts/backup.sh
```

### 3. Кластерное развертывание

**Когда использовать:**
- Высокая нагрузка (100+ пользователей)
- Требования к отказоустойчивости
- Автоматическое масштабирование

**Особенности:**
- Kubernetes управление
- Helm charts развертывание
- Автоматическое масштабирование
- Высокая доступность

**Подготовка кластера:**

1. **Настройте inventory:**
```yaml
# ansible/cluster-inventory.yml
k8s_cluster:
  children:
    masters:
      hosts:
        k8s-master.company.com:
    workers:
      hosts:
        k8s-worker1.company.com:
        k8s-worker2.company.com:
        k8s-worker3.company.com:
  vars:
    ansible_user: admin
    ansible_ssh_private_key_file: ~/.ssh/id_rsa
```

2. **Настройте values для Helm:**
```yaml
# config/cluster-values.yaml
gateway:
  replicas: 3
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2
      memory: 4Gi

ollama:
  replicas: 2
  gpu_enabled: true
  
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

3. **Запустите развертывание:**
```bash
./quick-deploy.sh cluster
```

**Управление кластером:**
```bash
# Статус подов
kubectl get pods -n aibox

# Логи сервиса
kubectl logs -f deployment/aibox-gateway -n aibox

# Масштабирование
kubectl scale deployment aibox-gateway --replicas=5 -n aibox

# Обновление
helm upgrade aibox ./helm/aibox -f config/cluster-values.yaml -n aibox

# Удаление
helm uninstall aibox -n aibox
```

## Конфигурация

### Основной конфигурационный файл

Все настройки находятся в `config/aibox-config.yaml`:

```yaml
deployment:
  type: local  # local, server, cluster
  environment: production

services:
  gateway:
    port: 5000
    replicas: 1
  
  ollama:
    port: 11434
    models: ["llama3.1", "codellama"]
    gpu_enabled: true

infrastructure:
  local:
    docker_compose: true
    auto_install_docker: true
  
  server:
    ansible_host: "your-server.company.com"
    ansible_user: "admin"
  
  cluster:
    kubernetes: true
    helm: true
    namespace: "aibox"
```

### Переменные окружения

Секретные данные задаются через переменные окружения:

```bash
# Для production
export POSTGRES_PASSWORD="secure_password_2024"
export GRAFANA_ADMIN_PASSWORD="secure_admin_password"
export AIBOX_SECRET_KEY="your_secret_key_here"
```

### Кастомизация

#### Добавление новых AI моделей
```yaml
# config/aibox-config.yaml
services:
  ollama:
    models:
      - "llama3.1"
      - "codellama"
      - "mistral"
      - "phi3"  # добавить новую модель
```

#### Настройка ресурсов
```yaml
# config/cluster-values.yaml
resources:
  gateway:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 4000m
      memory: 8Gi
```

## Мониторинг и обслуживание

### Доступ к интерфейсам

- **AI Box:** http://your-server:5000
- **Grafana:** http://your-server:3000 (admin/admin)
- **Prometheus:** http://your-server:9090
- **API Docs:** http://your-server:5000/docs

### Мониторинг здоровья

```bash
# Проверка здоровья
curl http://your-server:5000/health

# Метрики Prometheus
curl http://your-server:5000/metrics

# Статус всех сервисов
curl http://your-server:5000/api/services/status
```

### Логи и отладка

```bash
# Логи всех сервисов
docker-compose logs -f

# Логи конкретного сервиса
docker-compose logs -f gateway

# Логи в кластере
kubectl logs -f deployment/aibox-gateway -n aibox
```

### Бэкапы

Автоматические бэкапы настраиваются через cron:

```bash
# Ручной бэкап
./scripts/backup.sh

# Восстановление
./scripts/restore.sh backup-2024-01-15.tar.gz
```

## Устранение неполадок

### Общие проблемы

1. **Сервисы не запускаются**
   ```bash
   # Проверьте логи
   docker-compose logs
   
   # Проверьте ресурсы
   docker system df
   free -h
   ```

2. **База данных недоступна**
   ```bash
   # Проверьте PostgreSQL
   docker exec -it postgres psql -U postgres -d aibox
   ```

3. **AI модели не загружаются**
   ```bash
   # Проверьте Ollama
   curl http://localhost:11434/api/tags
   
   # Загрузите модель вручную
   curl -X POST http://localhost:11434/api/pull -d '{"name":"llama3.1"}'
   ```

### Контакты поддержки

При проблемах с развертыванием:
1. Проверьте логи сервисов
2. Убедитесь в соответствии системным требованиям
3. Проверьте сетевые настройки и брандмауэр
4. Обратитесь к документации конкретного сервиса

## Обновления

### Локальное обновление
```bash
git pull
./quick-deploy.sh local
```

### Серверное обновление
```bash
ansible-playbook -i ansible/inventory.yml ansible/update-server.yml
```

### Кластерное обновление
```bash
helm upgrade aibox ./helm/aibox -f config/cluster-values.yaml -n aibox
```