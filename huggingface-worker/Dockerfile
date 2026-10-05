FROM python:3.10-slim

# Install system FFmpeg and tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    yt-dlp \
    pydantic

# Copy worker application
COPY app.py .

# Storage directory for temporary clips
RUN mkdir -p /app/clips && chmod -R 777 /app/clips

# Hugging Face Spaces exposes port 7860 by default
EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
