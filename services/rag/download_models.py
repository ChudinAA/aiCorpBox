
#!/usr/bin/env python3
"""
Pre-download embedding models to avoid runtime download issues
"""
import os
import logging
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def download_models():
    """Download embedding models during container build"""
    models = [
        "BAAI/bge-small-en",
        "sentence-transformers/all-mpnet-base-v2",
        "sentence-transformers/all-MiniLM-L6-v2"
    ]
    
    cache_dir = "/app/embeddings_cache"
    os.makedirs(cache_dir, exist_ok=True)
    
    for model_name in models:
        try:
            logger.info(f"Downloading model: {model_name}")
            model = SentenceTransformer(model_name, cache_folder=cache_dir)
            logger.info(f"Successfully downloaded: {model_name}")
        except Exception as e:
            logger.warning(f"Failed to download {model_name}: {e}")
            continue

if __name__ == "__main__":
    download_models()
