# Build from the backend/ directory:  docker build -f pet-service/Dockerfile -t pet-service backend
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY pet-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common ./common
COPY pet-service/main.py .

# Run as a non-root user; /app/data is only used by the SQLite fallback
RUN useradd --create-home appuser && mkdir -p /app/data && chown -R appuser /app
USER appuser

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
