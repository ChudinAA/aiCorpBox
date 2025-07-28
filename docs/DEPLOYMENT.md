# AI Box - Руководство по развертыванию

## Обзор

AI Box поддерживает несколько методов развертывания для различных окружений:
- **Docker Compose** - Локальная разработка и тестирование
- **Ansible** - Развертывание на одном сервере
- **Helm** - Развертывание в Kubernetes кластере

## Архитектура решения

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Docker Compose │     │     Ansible      │     │       Helm       │
│   (локальная     │     │   (серверная     │     │    (кластерная   │
│    разработка)   │     │    установка)    │     │     установка)   │
└────────┬─────────┘     └────────┬──────────┘     └────────┬─────────┘
         │                         │                          │
         └─────────────┬───────────┴──────────────────────────┘
                       │
              ┌────────▼────────┐
              │  Docker Images  │
              │   (локальная    │
              │  сборка или     │
              │   Docker Hub)   │
              └─────────────────┘
```

## Сервисы AI Box

| Сервис      | Порт  | Описание                              |
|-------------|-------|---------------------------------------|
| Frontend    | 5000  | Веб-интерфейс                        |
| Gateway     | 8000  | API Gateway и координатор            |
| RAG Service | 8001  | Retrieval Augmented Generation       |
| Agents      | 8002  | Сервис агентов                       |
| Postgres    | 5432  | База данных                          |
| Qdrant      | 6333  | Векторная база данных                |
| Ollama      | 11434 | LLM сервер                           |

## 1. Docker Compose (Локальная разработка)

### Запуск с локальной сборкой

```bash
# Сборка и запуск всех сервисов
docker-compose up --build

# Запуск в фоновом режиме
docker-compose up -d --build

# Остановка
docker-compose down

# Удаление с очисткой данных
docker-compose down -v
```

### Запуск с образами из Docker Hub

```bash
# Генерация конфигурации для Docker Hub
./scripts/deploy-manager.sh compose hub

# Запуск
docker-compose -f docker-compose.hub.yml up

# Проверка статуса
docker-compose -f docker-compose.hub.yml ps
```

## 2. Сборка и публикация образов в Docker Hub

### Подготовка

```bash
# Установка переменных окружения
export DOCKER_REGISTRY="your-dockerhub-username"
export VERSION="1.0.0"

# Логин в Docker Hub
docker login
```

### Сборка и публикация

```bash
# Сборка и публикация всех образов
./scripts/build-and-push-images.sh all

# Сборка и публикация конкретного сервиса
./scripts/build-and-push-images.sh frontend
./scripts/build-and-push-images.sh gateway
./scripts/build-and-push-images.sh rag
./scripts/build-and-push-images.sh agents

# Проверка загруженных образов
docker search $DOCKER_REGISTRY/aibox
```

### Использование Deploy Manager

```bash
# Режимы работы:
# - build: локальная сборка из ./services
# - hub: использование образов из Docker Hub

# Генерация конфигурации для локальной сборки
./scripts/deploy-manager.sh compose build

# Генерация конфигурации для Docker Hub
./scripts/deploy-manager.sh compose hub

# Генерация конфигурации Helm для Docker Hub
./scripts/deploy-manager.sh helm hub
```

## 3. Ansible (Серверное развертывание)

### Требования

- Ubuntu 20.04/22.04 или CentOS 7/8
- SSH доступ с sudo правами
- Минимум 8GB RAM, 50GB диска

### Подготовка inventory

```ini
# ansible/inventory/production.ini
[servers]
aibox-server ansible_host=192.168.1.100 ansible_user=ubuntu

[servers:vars]
ansible_python_interpreter=/usr/bin/python3
deployment_mode=hub  # или build для локальной сборки
docker_registry=your-dockerhub-username
image_tag=1.0.0
```

### Развертывание

```bash
cd ansible

# Проверка подключения
ansible -i inventory/production.ini servers -m ping

# Развертывание на сервер
ansible-playbook -i inventory/production.ini deploy-server.yml

# С локальной сборкой
ansible-playbook -i inventory/production.ini deploy-server.yml \
  -e deployment_mode=build

# С Docker Hub
ansible-playbook -i inventory/production.ini deploy-server.yml \
  -e deployment_mode=hub \
  -e docker_registry=your-dockerhub-username \
  -e image_tag=1.0.0

# Обновление сервисов
ansible-playbook -i inventory/production.ini update-services.yml
```

### Управление на сервере

```bash
# SSH подключение к серверу
ssh ubuntu@192.168.1.100

# Проверка статуса
sudo systemctl status aibox
docker ps

# Просмотр логов
docker-compose logs -f gateway
docker-compose logs -f frontend

# Перезапуск сервиса
sudo systemctl restart aibox

# Обновление конфигурации
cd /opt/aibox
sudo nano .env
sudo systemctl restart aibox
```

## 4. Helm (Кластерное развертывание)

### Требования

- Kubernetes 1.19+
- Helm 3.0+
- kubectl настроенный для доступа к кластеру
- StorageClass (опционально)

### Установка

```bash
# Создание namespace
kubectl create namespace aibox

# Установка с локальной сборкой
helm install aibox ./helm/aibox \
  --namespace aibox \
  --set global.imageRegistry="" \
  --set global.imageTag="latest"

# Установка с Docker Hub
helm install aibox ./helm/aibox \
  --namespace aibox \
  --set global.imageRegistry="your-dockerhub-username" \
  --set global.imageTag="1.0.0"

# С кастомным StorageClass
helm install aibox ./helm/aibox \
  --namespace aibox \
  --set global.storageClass="fast-ssd" \
  --set postgres.persistence.enabled=true \
  --set qdrant.persistence.enabled=true

# Проверка статуса
helm status aibox -n aibox
kubectl get pods -n aibox
kubectl get services -n aibox
```

### Обновление

```bash
# Обновление с новыми образами
helm upgrade aibox ./helm/aibox \
  --namespace aibox \
  --set global.imageTag="1.0.1"

# Откат к предыдущей версии
helm rollback aibox -n aibox

# История релизов
helm history aibox -n aibox
```

### Доступ к сервисам

```bash
# Port-forward для локального доступа
kubectl port-forward -n aibox svc/gateway 8000:8000
kubectl port-forward -n aibox svc/frontend 5000:5000

# Получение внешнего IP (если используется LoadBalancer)
kubectl get svc -n aibox frontend

# Просмотр логов
kubectl logs -n aibox deployment/gateway
kubectl logs -n aibox deployment/frontend -f
```

### Удаление

```bash
# Удаление релиза
helm uninstall aibox -n aibox

# Удаление namespace
kubectl delete namespace aibox
```

## 5. Конфигурация

### Переменные окружения

Все сервисы используют следующие переменные окружения:

```bash
# База данных
DATABASE_URL=postgresql://user:password@postgres:5432/aibox

# Векторная БД
QDRANT_URL=http://qdrant:6333

# LLM
OLLAMA_URL=http://ollama:11434

# Сервисы
GATEWAY_URL=http://gateway:8000
RAG_SERVICE_URL=http://rag:8001
AGENTS_SERVICE_URL=http://agents:8002
```

### Единая конфигурация

Файл `config/aibox-config.yaml` содержит централизованную конфигурацию:

```yaml
services:
  frontend:
    port: 5000
    replicas: 2
    resources:
      requests:
        memory: "256Mi"
        cpu: "100m"
      limits:
        memory: "512Mi"
        cpu: "500m"
  
  gateway:
    port: 8000
    replicas: 2
    # ...
```

## 6. Мониторинг и отладка

### Docker Compose

```bash
# Просмотр логов
docker-compose logs -f

# Статистика использования ресурсов
docker stats

# Вход в контейнер
docker exec -it aibox-gateway bash
```

### Kubernetes

```bash
# Метрики подов
kubectl top pods -n aibox

# События
kubectl get events -n aibox --sort-by='.lastTimestamp'

# Описание пода
kubectl describe pod -n aibox gateway-xxx

# Вход в под
kubectl exec -it -n aibox gateway-xxx -- bash
```

## 7. Резервное копирование

### База данных

```bash
# Создание дампа
docker exec aibox-postgres pg_dump -U aibox aibox > backup.sql

# Восстановление
docker exec -i aibox-postgres psql -U aibox aibox < backup.sql
```

### Векторная база

```bash
# Экспорт коллекций
curl -X GET http://localhost:6333/collections/documents/points \
  > qdrant_backup.json

# Импорт
curl -X PUT http://localhost:6333/collections/documents/points \
  -H 'Content-Type: application/json' \
  -d @qdrant_backup.json
```

## 8. Устранение неполадок

### Общие проблемы

**Проблема**: Контейнеры не запускаются
```bash
# Проверка логов
docker-compose logs service-name
kubectl logs -n aibox pod-name

# Проверка ресурсов
df -h
free -m
```

**Проблема**: Сервисы не могут соединиться
```bash
# Проверка сети
docker network ls
kubectl get svc -n aibox

# Проверка DNS
docker exec container-name nslookup service-name
kubectl exec -n aibox pod-name -- nslookup service-name
```

**Проблема**: Недостаточно памяти для Ollama
```bash
# Увеличение лимитов в docker-compose.yml или values.yaml
resources:
  limits:
    memory: "8Gi"
```

### Проверка здоровья

```bash
# Health check endpoint
curl http://localhost:8000/health
curl http://localhost:5000/health

# Проверка всех сервисов
for port in 5000 8000 8001 8002; do
  echo "Checking port $port:"
  curl -s http://localhost:$port/health | jq .
done
```

## 9. Безопасность

### Рекомендации

1. **Используйте secrets** для паролей и ключей
2. **Настройте TLS** для внешних подключений
3. **Ограничьте сетевой доступ** через firewall
4. **Регулярно обновляйте** образы и зависимости
5. **Включите аудит** и логирование

### Настройка TLS в Kubernetes

```bash
# Создание сертификата
kubectl create secret tls aibox-tls \
  --cert=tls.crt \
  --key=tls.key \
  -n aibox

# Использование в Ingress
helm upgrade aibox ./helm/aibox \
  --set ingress.enabled=true \
  --set ingress.tls.enabled=true \
  --set ingress.tls.secretName=aibox-tls
```

## 10. CI/CD интеграция

### GitHub Actions пример

```yaml
name: Deploy AI Box
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Build and Push Images
        env:
          DOCKER_REGISTRY: ${{ secrets.DOCKER_REGISTRY }}
          VERSION: ${{ github.sha }}
        run: |
          docker login -u ${{ secrets.DOCKER_USER }} \
            -p ${{ secrets.DOCKER_PASSWORD }}
          ./scripts/build-and-push-images.sh all
      
      - name: Deploy to Kubernetes
        run: |
          helm upgrade --install aibox ./helm/aibox \
            --namespace aibox \
            --set global.imageRegistry=${{ secrets.DOCKER_REGISTRY }} \
            --set global.imageTag=${{ github.sha }}
```

## Поддержка

При возникновении проблем:

1. Проверьте логи соответствующего сервиса
2. Убедитесь в правильности конфигурации
3. Проверьте доступность зависимых сервисов
4. Обратитесь к разделу устранения неполадок

Для получения помощи создайте issue в репозитории проекта.