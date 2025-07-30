#!/usr/bin/env python3
"""
AI Box - One-Click Deployment Tool
Простой инструмент развертывания AI Box в любой инфраструктуре
"""

import os
import sys
import subprocess
import argparse
import yaml
from pathlib import Path

class AIBoxDeployer:
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.config_file = self.project_root / "config" / "aibox-config.yaml"
        
    def load_config(self):
        """Загружает конфигурацию из файла"""
        if not self.config_file.exists():
            print("❌ Конфигурационный файл не найден. Создаю стандартный...")
            self.create_default_config()
        
        with open(self.config_file, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    
    def create_default_config(self):
        """Создает стандартную конфигурацию"""
        config_dir = self.project_root / "config"
        config_dir.mkdir(exist_ok=True)
        
        default_config = {
            'deployment': {
                'type': 'local',  # local, server, cluster
                'environment': 'development'  # development, production
            },
            'services': {
                'gateway': {'port': 5000, 'replicas': 1},
                'ollama': {'port': 11434, 'replicas': 1, 'models': ['llama3.1', 'codellama']},
                'rag': {'port': 8001, 'replicas': 1},
                'agents': {'port': 8002, 'replicas': 1},
                'database': {'port': 5432, 'type': 'postgresql'},
                'vector_db': {'port': 6333, 'type': 'qdrant'},
                'monitoring': {'prometheus_port': 9090, 'grafana_port': 3000}
            },
            'infrastructure': {
                'local': {
                    'docker_compose': True,
                    'auto_install_docker': True
                },
                'server': {
                    'ansible_host': 'your-server.company.com',
                    'ansible_user': 'admin',
                    'ssh_key_path': '~/.ssh/id_rsa'
                },
                'cluster': {
                    'kubernetes': True,
                    'helm': True,
                    'nodes': ['node1.company.com', 'node2.company.com', 'node3.company.com']
                }
            }
        }
        
        with open(self.config_file, 'w', encoding='utf-8') as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True)
        
        print(f"✅ Создан конфигурационный файл: {self.config_file}")
    
    def deploy_local(self, config):
        """Развертывание на локальной машине"""
        print("🚀 Начинаю развертывание AI Box на локальной машине...")
        
        # 1. Проверка Docker
        if not self.check_docker():
            if config['infrastructure']['local']['auto_install_docker']:
                print("📦 Устанавливаю Docker...")
                self.install_docker()
            else:
                print("❌ Docker не установлен. Установите Docker и повторите попытку.")
                return False
        
        # 2. Создание docker-compose.local.yml
        self.create_local_compose(config)
        
        # 3. Запуск контейнеров
        print("🔄 Запускаю контейнеры...")
        subprocess.run(['docker-compose', '-f', 'docker-compose.local.yml', 'up', '-d'], 
                      cwd=self.project_root)
        
        print("✅ AI Box успешно развернут локально!")
        print("🌐 Веб-интерфейс: http://localhost:5000")
        print("📊 Мониторинг: http://localhost:3000")
        print("📚 API документация: http://localhost:5000/docs")
        
        return True
    
    def deploy_server(self, config):
        """Развертывание на удаленном сервере через Ansible"""
        print("🚀 Начинаю развертывание AI Box на сервере...")
        
        # 1. Проверка Ansible
        if not self.check_ansible():
            print("📦 Устанавливаю Ansible...")
            self.install_ansible()
        
        # 2. Создание Ansible inventory
        self.create_ansible_inventory(config)
        
        # 3. Запуск Ansible playbook
        print("🔄 Запускаю развертывание через Ansible...")
        subprocess.run(['ansible-playbook', '-i', 'ansible/inventory.yml', 
                       'ansible/deploy-server.yml'], cwd=self.project_root)
        
        print("✅ AI Box успешно развернут на сервере!")
        server_host = config['infrastructure']['server']['ansible_host']
        print(f"🌐 Веб-интерфейс: http://{server_host}:5000")
        
        return True
    
    def deploy_cluster(self, config):
        """Развертывание на кластере через Kubernetes + Helm + Ansible"""
        print("🚀 Начинаю развертывание AI Box на кластере...")
        
        # 1. Проверка инструментов
        self.check_cluster_tools()
        
        # 2. Подготовка кластера через Ansible
        print("🔧 Настраиваю кластер через Ansible...")
        subprocess.run(['ansible-playbook', '-i', 'ansible/cluster-inventory.yml', 
                       'ansible/prepare-cluster.yml'], cwd=self.project_root)
        
        # 3. Развертывание через Helm
        print("📦 Устанавливаю AI Box через Helm...")
        subprocess.run(['helm', 'install', 'aibox', './helm/aibox', 
                       '-f', 'config/cluster-values.yaml'], cwd=self.project_root)
        
        print("✅ AI Box успешно развернут на кластере!")
        print("🔍 Проверьте статус: kubectl get pods -n aibox")
        
        return True
    
    def check_docker(self):
        """Проверяет наличие Docker"""
        try:
            subprocess.run(['docker', '--version'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def install_docker(self):
        """Устанавливает Docker"""
        system = os.uname().sysname.lower()
        if system == 'linux':
            subprocess.run(['curl', '-fsSL', 'https://get.docker.com', '-o', 'get-docker.sh'])
            subprocess.run(['sh', 'get-docker.sh'])
            subprocess.run(['sudo', 'systemctl', 'enable', 'docker'])
            subprocess.run(['sudo', 'systemctl', 'start', 'docker'])
        else:
            print("❌ Автоматическая установка Docker доступна только для Linux")
            print("📖 Установите Docker вручную: https://docs.docker.com/get-docker/")
    
    def check_ansible(self):
        """Проверяет наличие Ansible"""
        try:
            subprocess.run(['ansible', '--version'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def install_ansible(self):
        """Устанавливает Ansible"""
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'ansible'])
    
    def check_cluster_tools(self):
        """Проверяет инструменты для кластера"""
        tools = ['kubectl', 'helm', 'ansible']
        for tool in tools:
            try:
                subprocess.run([tool, '--version'], capture_output=True, check=True)
                print(f"✅ {tool} установлен")
            except (subprocess.CalledProcessError, FileNotFoundError):
                print(f"❌ {tool} не найден. Установите его перед развертыванием кластера.")
                return False
        return True
    
    def create_local_compose(self, config):
        """Создает docker-compose файл для локального развертывания"""
        compose_content = f"""version: '3.8'

services:
  # AI Box Gateway
  gateway:
    build: 
      context: .
      dockerfile: Dockerfile.gateway
    ports:
      - "{config['services']['gateway']['port']}:5000"
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

  # Ollama LLM Service
  ollama:
    image: ollama/ollama:latest
    ports:
      - "{config['services']['ollama']['port']}:11434"
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - aibox-network
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # RAG Service
  rag:
    build:
      context: ./services/rag
    ports:
      - "{config['services']['rag']['port']}:8001"
    environment:
      - QDRANT_URL=http://qdrant:6333
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - qdrant
      - ollama
    networks:
      - aibox-network

  # AI Agents Service
  agents:
    build:
      context: ./services/agents
    ports:
      - "{config['services']['agents']['port']}:8002"
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/aibox
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - postgres
      - ollama
    networks:
      - aibox-network

  # PostgreSQL Database
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: aibox
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "{config['services']['database']['port']}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - aibox-network

  # Qdrant Vector Database
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "{config['services']['vector_db']['port']}:6333"
    volumes:
      - qdrant-data:/qdrant/storage
    networks:
      - aibox-network

  # Prometheus Monitoring
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "{config['services']['monitoring']['prometheus_port']}:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    networks:
      - aibox-network

  # Grafana Dashboard
  grafana:
    image: grafana/grafana:latest
    ports:
      - "{config['services']['monitoring']['grafana_port']}:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./config/grafana:/etc/grafana/provisioning
    networks:
      - aibox-network

volumes:
  postgres-data:
  qdrant-data:
  ollama-data:
  prometheus-data:
  grafana-data:

networks:
  aibox-network:
    driver: bridge
"""
        
        with open(self.project_root / 'docker-compose.local.yml', 'w') as f:
            f.write(compose_content)
    
    def create_ansible_inventory(self, config):
        """Создает Ansible inventory для сервера"""
        ansible_dir = self.project_root / 'ansible'
        ansible_dir.mkdir(exist_ok=True)
        
        inventory = {
            'aibox_servers': {
                'hosts': {
                    config['infrastructure']['server']['ansible_host']: {
                        'ansible_user': config['infrastructure']['server']['ansible_user'],
                        'ansible_ssh_private_key_file': config['infrastructure']['server']['ssh_key_path']
                    }
                }
            }
        }
        
        with open(ansible_dir / 'inventory.yml', 'w') as f:
            yaml.dump(inventory, f, default_flow_style=False)

def main():
    parser = argparse.ArgumentParser(description='AI Box - Инструмент развертывания')
    parser.add_argument('deployment_type', choices=['local', 'server', 'cluster'],
                       help='Тип развертывания')
    parser.add_argument('--config', '-c', default='config/aibox-config.yaml',
                       help='Путь к конфигурационному файлу')
    
    args = parser.parse_args()
    
    deployer = AIBoxDeployer()
    config = deployer.load_config()
    
    print(f"🎯 Развертывание AI Box: {args.deployment_type}")
    print("=" * 50)
    
    if args.deployment_type == 'local':
        success = deployer.deploy_local(config)
    elif args.deployment_type == 'server':
        success = deployer.deploy_server(config)
    elif args.deployment_type == 'cluster':
        success = deployer.deploy_cluster(config)
    
    if success:
        print("\n🎉 Развертывание завершено успешно!")
        print("📖 Документация: ./docs/")
        print("🔧 Конфигурация: ./config/aibox-config.yaml")
    else:
        print("\n❌ Произошла ошибка при развертывании")
        sys.exit(1)

if __name__ == '__main__':
    main()