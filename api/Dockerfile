FROM python:3.11-slim

# Install system dependencies for OpenCV and OpenVINO
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (excluding large model files)
COPY *.py .
COPY requirements*.txt .
COPY railway.json .

# Create model directory
RUN mkdir -p /app/best_openvino_model

# Set environment variables
ENV MODEL_DIR=/app/best_openvino_model
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Start the application (Railway uses PORT environment variable)
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]