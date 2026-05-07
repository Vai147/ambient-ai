FROM python:3.12-slim

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
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x scripts/start.sh

EXPOSE 8000

CMD ["scripts/start.sh"]
