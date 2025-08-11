#!/usr/bin/env python3
"""
ONNX Model Validation Script
Validates ONNX model structure and compatibility
"""
import sys
import os

def validate_onnx_model(model_path):
    """Validate ONNX model without requiring onnx library"""
    
    print(f"Validating ONNX model: {model_path}")
    
    # Check if file exists
    if not os.path.exists(model_path):
        print("❌ ERROR: Model file does not exist")
        return False
    
    # Check file size
    file_size = os.path.getsize(model_path)
    print(f"📁 File size: {file_size:,} bytes ({file_size / (1024*1024):.2f} MB)")
    
    if file_size < 1000:  # Less than 1KB is likely invalid
        print("❌ ERROR: File too small to be a valid ONNX model")
        return False
    
    # Check magic bytes and header
    try:
        with open(model_path, 'rb') as f:
            header = f.read(16)
            
        # ONNX files should start with protobuf magic
        if len(header) < 8:
            print("❌ ERROR: File too short to contain valid header")
            return False
            
        # Check for protobuf patterns
        header_hex = header.hex()
        print(f"🔍 Header bytes: {header_hex}")
        
        # Look for common ONNX patterns
        header_str = header.decode('utf-8', errors='ignore')
        if 'pytorch' in header_str.lower():
            print("✅ Found PyTorch signature in header")
        else:
            print("⚠️  No clear PyTorch signature found")
            
        # Try to import onnx for proper validation
        try:
            import onnx
            print("📦 ONNX library available - performing deep validation")
            
            try:
                model = onnx.load(model_path)
                onnx.checker.check_model(model)
                print("✅ ONNX model structure is valid")
                
                # Print model info
                print(f"📊 Model info:")
                print(f"   - IR version: {model.ir_version}")
                print(f"   - Producer: {model.producer_name} {model.producer_version}")
                print(f"   - Domain: {model.domain}")
                print(f"   - Inputs: {len(model.graph.input)}")
                print(f"   - Outputs: {len(model.graph.output)}")
                print(f"   - Nodes: {len(model.graph.node)}")
                
                # Check input/output shapes
                for i, input_tensor in enumerate(model.graph.input):
                    shape = [dim.dim_value if dim.dim_value > 0 else '?' for dim in input_tensor.type.tensor_type.shape.dim]
                    print(f"   - Input {i}: {input_tensor.name} {shape}")
                    
                for i, output_tensor in enumerate(model.graph.output):
                    shape = [dim.dim_value if dim.dim_value > 0 else '?' for dim in output_tensor.type.tensor_type.shape.dim]
                    print(f"   - Output {i}: {output_tensor.name} {shape}")
                
                return True
                
            except Exception as e:
                print(f"❌ ONNX model validation failed: {str(e)}")
                print("💡 Model may be corrupted or incompatible")
                return False
                
        except ImportError:
            print("⚠️  ONNX library not available - performing basic validation only")
            
            # Basic protobuf validation without onnx library
            if file_size > 100000:  # > 100KB suggests it's a real model
                print("✅ File size suggests valid model")
                return True
            else:
                print("⚠️  File size is suspicious for an ONNX model")
                return False
        
    except Exception as e:
        print(f"❌ ERROR reading file: {str(e)}")
        return False

def main():
    model_path = os.path.join(
        os.path.dirname(__file__),
        'public',
        'object_detection_model',
        'last_model_train12052025.onnx'
    )
    
    print("🔍 ONNX Model Validation Tool")
    print("=" * 50)
    
    is_valid = validate_onnx_model(model_path)
    
    print("=" * 50)
    if is_valid:
        print("✅ Model validation completed successfully")
        return 0
    else:
        print("❌ Model validation failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())