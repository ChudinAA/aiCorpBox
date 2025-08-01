
#!/usr/bin/env python3
"""
Test Client для проверки взаимодействия всех сервисов AI Box
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, Any

class ServiceTester:
    def __init__(self):
        self.base_urls = {
            "gateway": "http://0.0.0.0:5000",
            "rag": "http://0.0.0.0:8001", 
            "agents": "http://0.0.0.0:8002",
            "ollama": "http://0.0.0.0:11434",
            "qdrant": "http://0.0.0.0:6333"
        }
        
    async def test_service_health(self, session: aiohttp.ClientSession, service: str, url: str):
        """Тест здоровья сервиса"""
        try:
            health_endpoint = f"{url}/health" if service != "ollama" else f"{url}/api/version"
            async with session.get(health_endpoint) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ {service}: {data}")
                    return True
                else:
                    print(f"❌ {service}: HTTP {response.status}")
                    return False
        except Exception as e:
            print(f"❌ {service}: {e}")
            return False
    
    async def test_gateway_demo(self, session: aiohttp.ClientSession):
        """Тест demo chat через gateway"""
        try:
            url = f"{self.base_urls['gateway']}/api/demo/chat"
            payload = {
                "message": "Test message from service tester",
                "service_type": "general",
                "session_id": "test-session"
            }
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Gateway Demo Chat: {data['response'][:100]}...")
                    return True
                else:
                    print(f"❌ Gateway Demo Chat: HTTP {response.status}")
                    return False
        except Exception as e:
            print(f"❌ Gateway Demo Chat: {e}")
            return False
    
    async def test_rag_query(self, session: aiohttp.ClientSession):
        """Тест RAG сервиса"""
        try:
            url = f"{self.base_urls['rag']}/query"
            payload = {
                "query": "Test query for RAG service",
                "session_id": "test-session"
            }
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ RAG Query: {data}")
                    return True
                else:
                    print(f"❌ RAG Query: HTTP {response.status}")
                    return False
        except Exception as e:
            print(f"❌ RAG Query: {e}")
            return False
    
    async def test_agents_execute(self, session: aiohttp.ClientSession):
        """Тест Agents сервиса"""
        try:
            url = f"{self.base_urls['agents']}/execute"
            payload = {
                "task": "Test task for agents service",
                "agent_type": "general"
            }
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Agents Execute: {data}")
                    return True
                else:
                    print(f"❌ Agents Execute: HTTP {response.status}")
                    return False
        except Exception as e:
            print(f"❌ Agents Execute: {e}")
            return False
    
    async def test_ollama_chat(self, session: aiohttp.ClientSession):
        """Тест Ollama сервиса"""
        try:
            url = f"{self.base_urls['ollama']}/api/chat"
            payload = {
                "model": "llama3.1",
                "messages": [{"role": "user", "content": "Test message"}]
            }
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Ollama Chat: {data}")
                    return True
                else:
                    print(f"❌ Ollama Chat: HTTP {response.status}")
                    return False
        except Exception as e:
            print(f"❌ Ollama Chat: {e}")
            return False
    
    async def run_all_tests(self):
        """Запуск всех тестов"""
        print("🧪 Запускаю тесты взаимодействия сервисов AI Box...\n")
        
        async with aiohttp.ClientSession() as session:
            # Тесты здоровья всех сервисов
            print("📋 Проверка здоровья сервисов:")
            health_results = []
            for service, url in self.base_urls.items():
                result = await self.test_service_health(session, service, url)
                health_results.append(result)
                await asyncio.sleep(0.5)
            
            print(f"\n📊 Здоровых сервисов: {sum(health_results)}/{len(health_results)}")
            
            if sum(health_results) == 0:
                print("❌ Нет доступных сервисов. Запустите dev_environment.py")
                return
            
            print("\n🔄 Тестирование взаимодействия:")
            
            # Функциональные тесты
            await self.test_gateway_demo(session)
            await asyncio.sleep(1)
            
            await self.test_rag_query(session)
            await asyncio.sleep(1)
            
            await self.test_agents_execute(session)
            await asyncio.sleep(1)
            
            await self.test_ollama_chat(session)
            
        print("\n✅ Тестирование завершено!")

if __name__ == "__main__":
    tester = ServiceTester()
    asyncio.run(tester.run_all_tests())
