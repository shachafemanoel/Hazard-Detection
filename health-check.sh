#!/bin/bash
# Check both services are running
if curl -f http://localhost:8000/health >/dev/null 2>&1 && \\
   curl -f http://localhost:\${PORT:-8080}/health >/dev/null 2>&1; then
    exit 0
else
    exit 1
fi
