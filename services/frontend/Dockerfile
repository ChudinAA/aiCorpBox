# AI Box Frontend Service
# Максимально обособленный фронтенд для демонстрации возможностей AI Box

FROM node:18-alpine

# Установка дополнительных зависимостей
RUN apk add --no-cache \
    curl \
    git

# Создание рабочей директории
WORKDIR /app

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm ci --only=production

# Копирование исходного кода приложения
COPY . .

# Создание пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S frontend -u 1001

# Изменение владельца файлов
RUN chown -R frontend:nodejs /app
USER frontend

# Открытие порта
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Запуск приложения
CMD ["npm", "start"]