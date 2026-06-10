FROM python:3.12-slim

ARG TARGETARCH

WORKDIR /app

# System deps for Whisper + psycopg + audio
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libpq-dev \
    gcc \
    g++ \
    make \
    curl \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade "pip<26" "setuptools<81" wheel && \
    if [ "$TARGETARCH" = "amd64" ]; then \
      pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==2.5.1+cpu"; \
    fi && \
    WHISPER_VERSION="$(grep '^openai-whisper==' requirements.txt | cut -d= -f3)" && \
    pip install --no-cache-dir --no-build-isolation "openai-whisper==${WHISPER_VERSION}" && \
    pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x scripts/start.sh

EXPOSE 8000

CMD ["scripts/start.sh"]
