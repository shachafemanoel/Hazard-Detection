#!/usr/bin/env python3
"""
Hazard Detection Backend Startup Script
Run this to start the backend inference API server.
"""

import sys
import os
import subprocess
import time

def check_requirements():
    """Check if required packages are installed"""
    # Package name mappings: pip_name -> import_name
    required_packages = {
        'fastapi': 'fastapi',
        'uvicorn': 'uvicorn',
        'openvino': 'openvino',  # OpenVINO runtime
        'opencv-python': 'cv2',  # OpenCV for image processing
        'pillow': 'PIL',  # pillow package imports as PIL
        'numpy': 'numpy',
        'python-multipart': 'multipart'  # Required for FastAPI file uploads
    }
    
    missing = []
    for pip_name, import_name in required_packages.items():
        try:
            __import__(import_name)
        except ImportError:
            missing.append(pip_name)
    
    if missing:
        print("❌ Missing required packages:")
        for pkg in missing:
            print(f"   - {pkg}")
        print("\nInstall them with:")
        print(f"   pip install {' '.join(missing)}")
        return False
    
    return True

def check_model_file():
    """Check if the OpenVINO model files exist"""
    model_xml = "best_openvino_model/best.xml"
    model_bin = "best_openvino_model/best.bin"
    
    if not os.path.exists(model_xml):
        print(f"❌ Model XML file not found: {model_xml}")
        print("Please ensure the OpenVINO model files are in the correct location.")
        return False
        
    if not os.path.exists(model_bin):
        print(f"❌ Model BIN file not found: {model_bin}")
        print("Please ensure the OpenVINO model files are in the correct location.")
        return False
    
    print(f"✅ OpenVINO model files found:")
    print(f"   - {model_xml}")
    print(f"   - {model_bin}")
    return True

def start_server():
    """Start the FastAPI server using uvicorn"""
    print("🚀 Starting Hazard Detection Backend Server...")
    print("📍 Server will be available at: http://localhost:8000")
    print("📊 Health check endpoint: http://localhost:8000/health")
    print("🔍 Detection endpoint: http://localhost:8000/detect")
    print("🤖 Backend: OpenVINO Runtime")
    print("\nPress Ctrl+C to stop the server\n")
    
    try:
        # Start the server
        subprocess.run([
            sys.executable, "-m", "uvicorn", 
            "app:app",
            "--host", "0.0.0.0",
            "--port", "8000",
            "--reload"
        ], check=True)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to start server: {e}")
        return False
    
    return True

def main():
    print("🔧 Hazard Detection Backend Setup")
    print("=" * 50)
    
    # Check requirements
    print("📦 Checking Python packages...")
    if not check_requirements():
        sys.exit(1)
    print("✅ All required packages are installed")
    
    # Check model files
    print("\n🤖 Checking OpenVINO model files...")
    if not check_model_file():
        sys.exit(1)
    
    # Start server
    print("\n🎯 Starting backend server...")
    if not start_server():
        sys.exit(1)

if __name__ == "__main__":
    main()