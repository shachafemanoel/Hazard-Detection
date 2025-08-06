#!/bin/bash
# Check both services are running on their configured ports
API_PORT=${API_PORT:-8080}
WEB_PORT=${WEB_PORT:-3000}

if curl -f http://localhost:${API_PORT}/health >/dev/null 2>&1 && \
   curl -f http://localhost:${WEB_PORT}/health >/dev/null 2>&1; then
    exit 0
else
    exit 1
fi
