# Multi-stage Dockerfile for FastAPI + Express + Static Assets
# Stage 1: Node.js Builder
FROM node:20-alpine AS node-builder

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Python Builder
FROM python:3.10-slim AS python-builder

WORKDIR /app

# Install system dependencies for Python packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    cmake \
    pkg-config \
    libhdf5-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir --user -r api/requirements.txt

# Stage 3: Final Runtime Stage
FROM python:3.10-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    procps \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js in the final stage
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=python-builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy Node.js dependencies from builder
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package*.json ./

# Install runtime helpers
RUN npm install -g npm-run-all concurrently

# Copy application files
COPY api/ ./api/
COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY bridge/ ./bridge/

# Copy configuration files (optional)
COPY railway.json ./railway.json
COPY tailwind.config.js ./tailwind.config.js

# Create startup script
COPY <<EOF /app/start-services.sh
#!/bin/bash
set -e

echo "🚀 Starting Hazard Detection Multi-Service Application..."
echo "Environment: \${NODE_ENV:-production}"
echo "Port: \${PORT:-3000}"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down services..."
    pkill -f "uvicorn" || true
    pkill -f "node" || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT EXIT

# Start FastAPI on port 8001
echo "🐍 Starting FastAPI service on port 8001..."
cd /app
echo "📁 Current directory: \$(pwd)"
echo "📂 API directory contents: \$(ls -la api/ 2>/dev/null || echo 'API directory not found')"
echo "🎯 Model directory contents: \$(ls -la api/best_openvino_model/ 2>/dev/null || echo 'Model directory not found')"
echo "🌍 MODEL_DIR environment: \${MODEL_DIR:-NOT SET}"
echo "🔗 API_URL environment: \${API_URL:-NOT SET}"
MODEL_DIR=/app/api/best_openvino_model API_URL=http://localhost:8001 PYTHONPATH=/app python -m uvicorn api.app:app --host 0.0.0.0 --port 8001 --workers 1 &
API_PID=\$!

# Wait for API to start
sleep 5

# Start Express server on PORT (default 8080 for Railway)
echo "🌐 Starting Express server on port \${PORT:-8080}..."
cd /app/server/routes
if [ -f "server.js" ]; then
    PORT=\${PORT:-8080} node server.js &
else
    echo "❌ server.js not found in \$(pwd)"
    echo "📁 Available files:"
    ls -la
    exit 1
fi
WEB_PID=\$!

echo "✅ Both services started successfully!"
echo "📊 API PID: \$API_PID | Web PID: \$WEB_PID"

# Wait for both processes
wait
EOF

RUN chmod +x /app/start-services.sh

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONPATH=/app
ENV MODEL_DIR=/app/api/best_openvino_model
ENV API_URL=http://localhost:8001

# Expose port (Railway uses PORT env var)
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start both services
CMD ["/app/start-services.sh"]