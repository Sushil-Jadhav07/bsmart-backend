FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models

# ffmpeg pulls frames from reels that have no thumbnail.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt -r requirements-ml.txt

# Bake the models into the image so containers start without downloading (~1.1 GB).
RUN python -c "from sentence_transformers import SentenceTransformer as S; \
S('sentence-transformers/clip-ViT-B-32'); S('sentence-transformers/clip-ViT-B-32-multilingual-v1')"

COPY app ./app

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4)"
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
