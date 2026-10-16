# Build from the backend/ directory:  docker build -f adoption-service/Dockerfile -t adoption-service backend
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY adoption-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common ./common
COPY adoption-service/main.py .

# Run as a non-root user; /app/data is only used by the SQLite fallback
RUN useradd --create-home appuser && mkdir -p /app/data && chown -R appuser /app
USER appuser

EXPOSE 8002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
