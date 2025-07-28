# AI Box - Быстрый старт

## Выбор метода развертывания

### 🚀 Для локальной разработки - Docker Compose

```bash
# Клонирование репозитория
git clone https://github.com/your-org/aibox.git
cd aibox

# Запуск всех сервисов
docker-compose up --build

# Откройте в браузере
# http://localhost:5000
```

### 📦 Для production сервера - Ansible + Docker Hub

```bash
# Шаг 1: Публикация образов в Docker Hub
export DOCKER_REGISTRY="your-dockerhub-username"
export VERSION="1.0.0"
docker login
./scripts/build-and-push-images.sh all

# Шаг 2: Развертывание на сервер
cd ansible
ansible-playbook -i inventory/production.ini deploy-server.yml \
  -e deployment_mode=hub \
  -e docker_registry=$DOCKER_REGISTRY \
  -e image_tag=$VERSION
```

### ☸️ Для Kubernetes кластера - Helm

```bash
# Создание namespace
kubectl create namespace aibox

# Установка из Docker Hub
helm install aibox ./helm/aibox \
  --namespace aibox \
  --set global.imageRegistry="your-dockerhub-username" \
  --set global.imageTag="1.0.0"

# Проверка статуса
kubectl get pods -n aibox
```

## Проверка работоспособности

После запуска проверьте доступность сервисов:

```bash
# Frontend
curl http://localhost:5000/health

# Gateway  
curl http://localhost:8000/health

# RAG Service
curl http://localhost:8001/health

# Agents
curl http://localhost:8002/health
```

## Первые шаги

1. **Откройте веб-интерфейс**: http://localhost:5000
2. **Загрузите модель в Ollama**:
   ```bash
   docker exec aibox-ollama ollama pull llama2
   ```
3. **Загрузите документы** через веб-интерфейс для RAG
4. **Начните чат** с AI ассистентом

## Остановка сервисов

### Docker Compose
```bash
docker-compose down
```

### Ansible (на сервере)
```bash
sudo systemctl stop aibox
```

### Helm
```bash
helm uninstall aibox -n aibox
```

## Полезные команды

### Просмотр логов
```bash
# Docker Compose
docker-compose logs -f gateway

# Kubernetes
kubectl logs -f -n aibox deployment/gateway
```

### Перезапуск сервиса
```bash
# Docker Compose
docker-compose restart gateway

# Kubernetes
kubectl rollout restart -n aibox deployment/gateway
```

### Обновление конфигурации
```bash
# Docker Compose
docker-compose up -d --force-recreate gateway

# Kubernetes
kubectl edit configmap -n aibox aibox-config
```

## Следующие шаги

- [Полное руководство по развертыванию](./DEPLOYMENT.md)
- [Настройка и конфигурация](./CONFIGURATION.md)
- [API документация](./API.md)
- [Архитектура решения](./ARCHITECTURE.md)

## Поддержка

Если у вас возникли проблемы:

1. Проверьте [раздел устранения неполадок](./DEPLOYMENT.md#8-устранение-неполадок)
2. Посмотрите логи соответствующего сервиса
3. Создайте issue в репозитории проекта