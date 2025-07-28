
#!/usr/bin/env python3
"""
AI Box Development Environment
Запускает все сервисы в режиме разработки для тестирования взаимодействия
"""

import os
import sys
import subprocess
import threading
import time
import signal
from pathlib import Path

class ServiceManager:
    def __init__(self):
        self.processes = {}
        self.running = True
        
    def start_service(self, name, command, port, cwd=None):
        """Запуск сервиса в отдельном процессе"""
        print(f"🚀 Запускаю {name} на порту {port}")
        
        env = os.environ.copy()
        env.update({
            'HOST': '0.0.0.0',
            'PORT': str(port),
            'ENVIRONMENT': 'development',
            'DATABASE_URL': 'sqlite:///./aibox_dev.db',
            'OLLAMA_API_BASE': 'http://0.0.0.0:11434',
            'QDRANT_URL': 'http://0.0.0.0:6333',
            'GATEWAY_PORT': '5000',
            'RAG_PORT': '8001',
            'AGENTS_PORT': '8002',
            'OLLAMA_PORT': '11434'
        })
        
        try:
            process = subprocess.Popen(
                command,
                shell=True,
                cwd=cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )
            self.processes[name] = process
            
            # Мониторинг вывода в отдельном потоке
            def monitor_output():
                for line in process.stdout:
                    if self.running:
                        print(f"[{name}] {line.strip()}")
                        
            thread = threading.Thread(target=monitor_output, daemon=True)
            thread.start()
            
        except Exception as e:
            print(f"❌ Ошибка запуска {name}: {e}")
    
    def start_all_services(self):
        """Запуск всех сервисов AI Box"""
        
        # 1. Gateway (главный сервис на порту 5000)
        if Path("services/gateway/main.py").exists():
            self.start_service(
                "Gateway",
                "python -m uvicorn main:app --host 0.0.0.0 --port 5000",
                5000,
                cwd="services/gateway"
            )
        else:
            # Demo Gateway
            self.start_service(
                "Demo Gateway", 
                "python demo_gateway.py", 
                5000
            )
        
        
        time.sleep(1)
        
        # 2. RAG Service - используем мок для упрощения тестирования
        self.start_service(
            "RAG Service (Mock)",
            "python sandbox_dev/mock_rag.py",
            8001
        )
        
        time.sleep(1)
        
        # 3. Agents Service
        if Path("services/agents/main.py").exists():
            self.start_service(
                "Agents Service",
                "python -m uvicorn main:app --host 0.0.0.0 --port 8002",
                8002,
                cwd="services/agents"
            )
        else:
            # Мок Agents сервиса
            self.start_service(
                "Agents Service (Mock)",
                "python sandbox_dev/mock_agents.py",
                8002
            )
        
        time.sleep(1)
        
        # 4. Ollama Mock (если нет реального)
        self.start_service(
            "Ollama Mock",
            "python sandbox_dev/mock_ollama.py",
            11434
        )
        
        time.sleep(1)
        
        # 5. Qdrant Mock (если нет реального)
        self.start_service(
            "Qdrant Mock",
            "python sandbox_dev/mock_qdrant.py",
            6333
        )
        
        print("\n✅ Все сервисы запущены!")
        print("🌐 Gateway: http://localhost:5000")
        print("📚 RAG Service: http://localhost:8001")
        print("🤖 Agents Service: http://localhost:8002")
        print("🧠 Ollama Mock: http://localhost:11434")
        print("📊 Qdrant Mock: http://localhost:6333")
        
    def stop_all(self):
        """Остановка всех сервисов"""
        self.running = False
        print("\n🛑 Останавливаю все сервисы...")
        
        for name, process in self.processes.items():
            try:
                print(f"Останавливаю {name}")
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            except Exception as e:
                print(f"Ошибка остановки {name}: {e}")
        
        print("✅ Все сервисы остановлены")

def signal_handler(signum, frame):
    global manager
    manager.stop_all()
    sys.exit(0)

if __name__ == "__main__":
    manager = ServiceManager()
    
    # Обработка сигналов для корректной остановки
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        manager.start_all_services()
        
        # Держим главный процесс активным
        while manager.running:
            time.sleep(1)
            
    except KeyboardInterrupt:
        manager.stop_all()
