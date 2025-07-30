#!/usr/bin/env python3
"""
AI Box - Вспомогательные утилиты для развертывания
Дополнительные функции поддержки quick-deploy.sh
"""

import os
import sys
import yaml
from pathlib import Path

class AIBoxHelper:
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.config_file = self.project_root / "config" / "aibox-config.yaml"
    
    def create_default_config(self):
        """Создает стандартную конфигурацию если её нет"""
        if self.config_file.exists():
            print("✅ Конфигурационный файл уже существует")
            return
            
        config_dir = self.project_root / "config"
        config_dir.mkdir(exist_ok=True)
        
        # Используем уже существующую конфигурацию из config/aibox-config.yaml
        print(f"✅ Используется существующий конфигурационный файл: {self.config_file}")
    
    def validate_config(self):
        """Проверяет корректность конфигурации"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            
            required_sections = ['deployment', 'services', 'infrastructure']
            for section in required_sections:
                if section not in config:
                    print(f"❌ Отсутствует секция '{section}' в конфигурации")
                    return False
            
            print("✅ Конфигурация корректна")
            return True
        except Exception as e:
            print(f"❌ Ошибка чтения конфигурации: {e}")
            return False
    
    def get_service_ports(self):
        """Возвращает порты сервисов из конфигурации"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            
            services = config.get('services', {})
            ports = {}
            
            for service, settings in services.items():
                if 'port' in settings:
                    ports[service] = settings['port']
            
            return ports
        except Exception as e:
            print(f"❌ Ошибка получения портов: {e}")
            return {}
    
    def check_requirements(self):
        """Проверяет системные требования"""
        import psutil
        
        # Проверка RAM
        memory_gb = psutil.virtual_memory().total / (1024**3)
        cpu_count = psutil.cpu_count()
        
        print(f"💾 RAM: {memory_gb:.1f} GB")
        print(f"🖥️  CPU: {cpu_count} cores")
        
        if memory_gb < 4:
            print("⚠️  Предупреждение: Рекомендуется минимум 4GB RAM")
        if cpu_count < 2:
            print("⚠️  Предупреждение: Рекомендуется минимум 2 CPU cores")
        
        return memory_gb >= 2 and cpu_count >= 1  # минимальные требования

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='AI Box - Вспомогательные утилиты')
    parser.add_argument('--create-config', action='store_true',
                       help='Создать конфигурационный файл по умолчанию')
    parser.add_argument('--validate-config', action='store_true',
                       help='Проверить корректность конфигурации')
    parser.add_argument('--check-requirements', action='store_true',
                       help='Проверить системные требования')
    parser.add_argument('--get-ports', action='store_true',
                       help='Показать порты сервисов')
    
    args = parser.parse_args()
    
    if not any(vars(args).values()):
        parser.print_help()
        return
    
    helper = AIBoxHelper()
    
    if args.create_config:
        helper.create_default_config()
    
    if args.validate_config:
        helper.validate_config()
    
    if args.check_requirements:
        helper.check_requirements()
    
    if args.get_ports:
        ports = helper.get_service_ports()
        print("🌐 Порты сервисов:")
        for service, port in ports.items():
            print(f"  - {service}: {port}")

if __name__ == '__main__':
    main()