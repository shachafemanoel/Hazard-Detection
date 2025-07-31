#!/usr/bin/env python3
"""
Intelligent CPU detection and model selection for Hazard Detection
Detects CPU capabilities and selects the best available model format
"""

import os
import sys
import json
import subprocess
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CPUModelSelector:
    def __init__(self):
        self.app_root = Path('/app')
        self.models_root = self.app_root / 'models'
        self.config_file = self.app_root / 'model-config.json'
        
    def detect_cpu_capabilities(self):
        """Detect CPU capabilities for OpenVINO support"""
        try:
            # Try to import cpuinfo for detailed CPU detection
            try:
                from cpuinfo import get_cpu_info
                cpu_info = get_cpu_info()
                cpu_flags = cpu_info.get('flags', [])
                cpu_brand = cpu_info.get('brand_raw', 'Unknown')
                logger.info(f"CPU: {cpu_brand}")
                logger.info(f"CPU Flags: {', '.join(cpu_flags[:10])}...")  # First 10 flags
                
                # Check for OpenVINO-friendly instruction sets
                openvino_friendly = any(flag in cpu_flags for flag in [
                    'sse4_2', 'sse4.2', 'avx', 'avx2', 'avx512f'
                ])
                
                return {
                    'cpu_brand': cpu_brand,
                    'has_sse42': 'sse4_2' in cpu_flags or 'sse4.2' in cpu_flags,
                    'has_avx': 'avx' in cpu_flags,
                    'has_avx2': 'avx2' in cpu_flags,
                    'has_avx512': 'avx512f' in cpu_flags,
                    'openvino_compatible': openvino_friendly,
                    'total_flags': len(cpu_flags)
                }
                
            except ImportError:
                logger.warning("py-cpuinfo not available, using fallback detection")
                # Fallback: try to use system commands
                try:
                    result = subprocess.run(['lscpu'], capture_output=True, text=True, timeout=5)
                    lscpu_output = result.stdout.lower()
                    
                    # Basic detection from lscpu
                    has_sse42 = 'sse4_2' in lscpu_output or 'sse4.2' in lscpu_output
                    has_avx = 'avx' in lscpu_output
                    has_avx2 = 'avx2' in lscpu_output
                    
                    return {
                        'cpu_brand': 'Unknown (detected via lscpu)',
                        'has_sse42': has_sse42,
                        'has_avx': has_avx,
                        'has_avx2': has_avx2,
                        'has_avx512': False,
                        'openvino_compatible': has_sse42 or has_avx,
                        'total_flags': 'unknown'
                    }
                except Exception as e:
                    logger.warning(f"lscpu fallback failed: {e}")
                    
        except Exception as e:
            logger.error(f"CPU detection failed: {e}")
            
        # Ultimate fallback - assume basic compatibility
        return {
            'cpu_brand': 'Unknown',
            'has_sse42': True,  # Most modern CPUs have this
            'has_avx': False,
            'has_avx2': False,
            'has_avx512': False,
            'openvino_compatible': True,  # Optimistic assumption
            'total_flags': 'unknown'
        }
    
    def check_model_files(self):
        """Check availability of different model formats"""
        models = {
            'openvino': {
                'available': False,
                'path': None,
                'files': []
            },
            'pytorch': {
                'available': False,
                'path': None,
                'files': []
            },
            'onnx': {
                'available': False,
                'path': None,
                'files': []
            }
        }
        
        # Check OpenVINO models
        openvino_path = self.models_root / 'openvino'
        if openvino_path.exists():
            xml_files = list(openvino_path.glob('*.xml'))
            bin_files = list(openvino_path.glob('*.bin'))
            if xml_files and bin_files:
                models['openvino']['available'] = True
                models['openvino']['path'] = str(openvino_path)
                models['openvino']['files'] = [f.name for f in xml_files + bin_files]
        
        # Check PyTorch models
        pytorch_path = self.models_root / 'pytorch'
        if pytorch_path.exists():
            pt_files = list(pytorch_path.glob('*.pt'))
            if pt_files:
                models['pytorch']['available'] = True
                models['pytorch']['path'] = str(pytorch_path)
                models['pytorch']['files'] = [f.name for f in pt_files]
        
        # Check ONNX models (backup frontend models)
        onnx_files = list(pytorch_path.glob('*.onnx')) if pytorch_path.exists() else []
        if onnx_files:
            models['onnx']['available'] = True
            models['onnx']['path'] = str(pytorch_path)
            models['onnx']['files'] = [f.name for f in onnx_files]
        
        return models
    
    def select_optimal_configuration(self):
        """Select the best model and configuration based on CPU and available models"""
        cpu_caps = self.detect_cpu_capabilities()
        available_models = self.check_model_files()
        
        logger.info("=== CPU Detection Results ===")
        logger.info(f"CPU: {cpu_caps['cpu_brand']}")
        logger.info(f"OpenVINO Compatible: {cpu_caps['openvino_compatible']}")
        logger.info(f"SSE4.2: {cpu_caps['has_sse42']}, AVX: {cpu_caps['has_avx']}, AVX2: {cpu_caps['has_avx2']}")
        
        logger.info("=== Available Models ===")
        for model_type, info in available_models.items():
            status = "✅ Available" if info['available'] else "❌ Not Available"
            logger.info(f"{model_type.upper()}: {status}")
            if info['available']:
                logger.info(f"  Path: {info['path']}")
                logger.info(f"  Files: {', '.join(info['files'])}")
        
        # Decision logic for optimal configuration
        config = {
            'cpu_capabilities': cpu_caps,
            'available_models': available_models,
            'selected_backend': 'pytorch',  # Default fallback
            'model_path': None,
            'reasons': []
        }
        
        # Priority 1: OpenVINO if CPU supports it and models are available
        if (cpu_caps['openvino_compatible'] and 
            available_models['openvino']['available']):
            config['selected_backend'] = 'openvino'
            config['model_path'] = available_models['openvino']['path']
            config['reasons'].append('CPU supports OpenVINO instruction sets')
            config['reasons'].append('OpenVINO models are available')
            
        # Priority 2: PyTorch if available (universal compatibility)
        elif available_models['pytorch']['available']:
            config['selected_backend'] = 'pytorch'
            config['model_path'] = available_models['pytorch']['path']
            config['reasons'].append('PyTorch models available (universal compatibility)')
            if not cpu_caps['openvino_compatible']:
                config['reasons'].append('CPU lacks OpenVINO-optimal instruction sets')
                
        # Priority 3: ONNX as last resort for frontend
        elif available_models['onnx']['available']:
            config['selected_backend'] = 'onnx'
            config['model_path'] = available_models['onnx']['path']
            config['reasons'].append('Using ONNX models as fallback')
            config['reasons'].append('Neither OpenVINO nor PyTorch models available')
        
        else:
            config['reasons'].append('No suitable models found!')
            logger.error("❌ No suitable models found for any backend!")
        
        return config
    
    def generate_environment_config(self, config):
        """Generate environment variables for the selected configuration"""
        env_vars = {
            'MODEL_BACKEND': config['selected_backend'],
            'MODEL_DIR': config['model_path'] or '/app/models',
            'CPU_OPTIMIZATION': 'enabled' if config['cpu_capabilities']['openvino_compatible'] else 'basic',
            'INFERENCE_MODE': config['selected_backend'],
        }
        
        # Backend-specific configurations
        if config['selected_backend'] == 'openvino':
            env_vars.update({
                'OPENVINO_MODEL_XML': f"{config['model_path']}/best.xml",
                'OPENVINO_MODEL_BIN': f"{config['model_path']}/best.bin",
                'OV_CPU_THREADS': '0',  # Auto-detect
                'OV_CACHE_ENABLED': 'true'
            })
        elif config['selected_backend'] == 'pytorch':
            pytorch_model = None
            if config['model_path']:
                pt_files = list(Path(config['model_path']).glob('*.pt'))
                pytorch_model = str(pt_files[0]) if pt_files else None
            
            env_vars.update({
                'PYTORCH_MODEL_PATH': pytorch_model or '/app/models/pytorch/best.pt',
                'TORCH_NUM_THREADS': '0',  # Auto-detect
                'TORCH_DEVICE': 'cpu'
            })
        
        return env_vars
    
    def save_config(self):
        """Main method to detect, select, and save configuration"""
        try:
            logger.info("🔍 Starting intelligent model selection...")
            
            config = self.select_optimal_configuration()
            env_vars = self.generate_environment_config(config)
            
            # Save detailed config
            full_config = {
                'timestamp': str(subprocess.check_output(['date'], text=True).strip()),
                'selection_config': config,
                'environment_variables': env_vars,
                'container_info': {
                    'python_version': sys.version,
                    'working_directory': str(self.app_root)
                }
            }
            
            with open(self.config_file, 'w') as f:
                json.dump(full_config, f, indent=2)
            
            # Save environment file for Docker
            env_file = self.app_root / '.env.model'
            with open(env_file, 'w') as f:
                f.write("# Auto-generated model configuration\\n")
                f.write(f"# Generated at: {full_config['timestamp']}\\n")
                f.write(f"# Selected backend: {config['selected_backend']}\\n")
                for key, value in env_vars.items():
                    f.write(f"{key}={value}\\n")
            
            logger.info("✅ Model selection completed successfully!")
            logger.info(f"📊 Selected Backend: {config['selected_backend'].upper()}")
            logger.info(f"📁 Model Path: {config['model_path']}")
            logger.info("📝 Reasons:")
            for reason in config['reasons']:
                logger.info(f"   • {reason}")
            
            return config
            
        except Exception as e:
            logger.error(f"❌ Model selection failed: {e}")
            # Create fallback configuration
            fallback_env = {
                'MODEL_BACKEND': 'pytorch',
                'MODEL_DIR': '/app/models/pytorch',
                'PYTORCH_MODEL_PATH': '/app/models/pytorch/best.pt',
                'INFERENCE_MODE': 'pytorch'
            }
            
            with open(self.app_root / '.env.model', 'w') as f:
                f.write("# Fallback configuration\\n")
                for key, value in fallback_env.items():
                    f.write(f"{key}={value}\\n")
            
            return {'selected_backend': 'pytorch', 'model_path': '/app/models/pytorch'}

if __name__ == '__main__':
    selector = CPUModelSelector()
    result = selector.save_config()
    print(f"Selected backend: {result['selected_backend']}")
    sys.exit(0)
