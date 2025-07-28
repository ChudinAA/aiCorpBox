# AI Box - Enterprise AI Platform

🚀 **Простое развертывание AI платформы одним нажатием в любой корпоративной инфраструктуре**

## 📚 Документация

- [🚀 Быстрый старт](./docs/QUICK_START.md) - Начните работу за 5 минут
- [📦 Руководство по развертыванию](./docs/DEPLOYMENT.md) - Подробные инструкции для всех методов
- [🏗️ Архитектура](./docs/ARCHITECTURE.md) - Описание компонентов системы

## Быстрый старт

### 1️⃣ Локальная машина (Docker Compose)
```bash
# Запуск всех сервисов
docker-compose up --build
```
Результат: AI Box работает на http://localhost:5000

### 2️⃣ Удаленный сервер (Ansible)
```bash
# Развертывание на сервер
cd ansible
ansible-playbook -i inventory/production.ini deploy-server.yml
```
Результат: AI Box развернут на вашем сервере

### 3️⃣ Кластер (Helm)
```bash
# Установка в Kubernetes
kubectl create namespace aibox
helm install aibox ./helm/aibox -n aibox
```
Результат: AI Box работает в Kubernetes кластере

## Что получаете

- **🤖 Локальные LLM**: Ollama с моделями Llama, CodeLlama, Mistral
- **📚 RAG система**: Обработка документов с векторным поиском
- **🔧 AI агенты**: Умные помощники для автоматизации задач
- **🌐 Веб-интерфейс**: Простой интерфейс для всех возможностей
- **📊 Мониторинг**: Grafana дашборды и метрики Prometheus

## Архитектура

```
Пользователи → API Gateway → AI Сервисы → Базы данных
                   ↓
           [LLM | RAG | Agents] → [PostgreSQL | Qdrant]
                   ↓
              Мониторинг (Prometheus + Grafana)
```

## Системные требования

**Минимум (тест):**
- 2 CPU, 4GB RAM, 20GB диск

**Рекомендуется (production):**
- 8 CPU, 16GB RAM, 100GB SSD, GPU опционально

## Доступ к сервисам

После развертывания доступны:
- **AI Box**: http://your-server:5000
- **API Docs**: http://your-server:5000/docs  
- **Grafana**: http://your-server:3000 (admin/admin)
- **Prometheus**: http://your-server:9090

## Конфигурация

Все настройки в одном файле `config/aibox-config.yaml`:
```yaml
deployment:
  type: local  # local, server, cluster

services:
  gateway:
    port: 5000
  ollama:
    models: ["llama3.1", "codellama"]
    gpu_enabled: true

infrastructure:
  server:
    ansible_host: "your-server.company.com"
    ansible_user: "admin"
```

## Документация

- **[📖 Полное руководство](docs/DEPLOYMENT_GUIDE.md)** - детальная документация
- **[⚙️ Конфигурация](config/aibox-config.yaml)** - настройки системы
- **[🔧 Ansible плейбуки](ansible/)** - автоматизация развертывания

## Особенности

✅ **Одна команда развертывания** для любой инфраструктуры  
✅ **Прогрессивная сложность**: локально → сервер → кластер  
✅ **Полная автоматизация** через Ansible  
✅ **Закрытый контур** - работает без интернета  
✅ **Единая конфигурация** для всех типов развертывания  
✅ **Встроенный мониторинг** и диагностика  

## Поддержка

При проблемах:
1. Проверьте `./quick-deploy.sh` логи
2. Посмотрите [руководство по развертыванию](docs/DEPLOYMENT_GUIDE.md)
3. Проверьте здоровье системы: `curl http://your-server:5000/health`