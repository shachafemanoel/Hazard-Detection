FROM python:3.11-slim

# Install system dependencies for OpenCV and OpenVINO
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables
ENV MODEL_DIR=/app/best_openvino_model
ENV PYTHONPATH=/app

# Debug: List files in working directory
RUN ls -la /app

# Debug: Check if app.py exists and is readable
RUN test -f /app/app.py && echo "app.py found" || echo "app.py NOT found"

# Debug: Try to import the module
RUN python -c "import sys; print('Python path:', sys.path)" || true
RUN python -c "import app; print('app module imported successfully')" || echo "Failed to import app module"

# Expose port
EXPOSE 8000

# Start the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]