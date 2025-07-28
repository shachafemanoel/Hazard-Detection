#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

console.log('🔧 Hazard Detection Environment Check');
console.log('=' .repeat(50));

// Check Python installation
function checkPython() {
    return new Promise((resolve) => {
        // Try python3 first, then python
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const python = spawn(pythonCmd, ['--version']);
        
        python.stdout.on('data', (data) => {
            console.log('✅ Python found:', data.toString().trim());
            resolve(true);
        });
        
        python.stderr.on('data', (data) => {
            console.log('✅ Python found:', data.toString().trim());
            resolve(true);
        });
        
        python.on('error', () => {
            console.log('❌ Python not found. Please install Python 3.8+');
            resolve(false);
        });
        
        python.on('close', (code) => {
            if (code !== 0) {
                console.log('❌ Python check failed');
                resolve(false);
            }
        });
    });
}

// Check OpenVINO installation
function checkOpenVINO() {
    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32' ? 'venv\\Scripts\\python' : 'venv/bin/python3';
        const pip = spawn(pythonCmd, ['-c', 'import openvino; print(f"OpenVINO {openvino.__version__}")']);
        
        pip.stdout.on('data', (data) => {
            console.log('✅', data.toString().trim());
            resolve(true);
        });
        
        pip.stderr.on('data', (data) => {
            if (data.toString().includes('No module named')) {
                console.log('❌ OpenVINO not installed. Run: pip install openvino');
                resolve(false);
            }
        });
        
        pip.on('error', () => {
            console.log('❌ Failed to check OpenVINO installation');
            resolve(false);
        });
        
        pip.on('close', (code) => {
            if (code !== 0) {
                resolve(false);
            }
        });
    });
}

// Check required Python packages
function checkPythonPackages() {
    return new Promise((resolve) => {
        const packages = ['fastapi', 'uvicorn', 'pillow', 'numpy', 'python-multipart'];
        const pythonCmd = process.platform === 'win32' ? 'venv\\Scripts\\python' : 'venv/bin/python3';
        const pip = spawn(pythonCmd, ['-c', `
import sys
packages = ${JSON.stringify(packages)}
missing = []
for pkg in packages:
    try:
        if pkg == 'pillow':
            __import__('PIL')
        elif pkg == 'python-multipart':
            __import__('multipart')
        else:
            __import__(pkg)
        print(f"✅ {pkg}")
    except ImportError:
        missing.append(pkg)
        print(f"❌ {pkg} - Not installed")
        
if missing:
    print(f"\\nInstall missing packages with:")
    print(f"pip install {' '.join(missing)}")
    sys.exit(1)
else:
    print("\\n✅ All Python packages are installed")
        `]);
        
        pip.stdout.on('data', (data) => {
            console.log(data.toString());
        });
        
        pip.stderr.on('data', (data) => {
            console.log(data.toString());
        });
        
        pip.on('close', (code) => {
            resolve(code === 0);
        });
    });
}

// Check OpenVINO model files
function checkModelFiles() {
    const modelXml = join(process.cwd(), 'api', 'best_openvino_model', 'best.xml');
    const modelBin = join(process.cwd(), 'api', 'best_openvino_model', 'best.bin');
    
    console.log('\\n🤖 Checking OpenVINO model files...');
    
    if (existsSync(modelXml) && existsSync(modelBin)) {
        console.log('✅ OpenVINO model files found:');
        console.log('   - api/best_openvino_model/best.xml');
        console.log('   - api/best_openvino_model/best.bin');
        return true;
    } else {
        console.log('❌ OpenVINO model files not found in api/best_openvino_model/');
        console.log('   Expected: api/best_openvino_model/best.xml and api/best_openvino_model/best.bin');
        console.log('   Please ensure the model files are in the correct location.');
        return false;
    }
}

// Main check function
async function main() {
    console.log('\\n📦 Checking Python installation...');
    const pythonOk = await checkPython();
    
    if (!pythonOk) {
        process.exit(1);
    }
    
    console.log('\\n📚 Checking Python packages...');
    const packagesOk = await checkPythonPackages();
    
    if (!packagesOk) {
        process.exit(1);
    }
    
    const openvinoOk = await checkOpenVINO();
    
    if (!openvinoOk) {
        process.exit(1);
    }
    
    const modelsOk = checkModelFiles();
    
    if (!modelsOk) {
        process.exit(1);
    }
    
    console.log('\\n🎉 Environment check passed! Ready to start the application.');
    console.log('\\n🚀 Starting services...');
}

main().catch(console.error);