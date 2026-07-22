FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY src/frontend/package.json src/frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY src/frontend/ ./
RUN yarn build

FROM python:3.11-slim AS app
WORKDIR /app
COPY src/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
COPY src/backend/ ./
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${API_WORKERS:-1}"]

FROM nginx:1.27-alpine AS frontend
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8000

# Preserve the repository's historical default image contract: a plain Docker build produces
# the complete Pad application. Compose selects the lightweight `frontend` target explicitly.
FROM app AS final
