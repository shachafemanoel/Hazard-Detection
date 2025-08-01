import json
from cpuinfo import get_cpu_info

flags = get_cpu_info().get('flags', [])
use_openvino = any(f in flags for f in ['avx', 'avx2', 'sse4_2'])
backend = 'openvino' if use_openvino else 'pytorch'
model_dir = '/app/api/best_openvino_model' if backend == 'openvino' else '/app'
with open('/app/backend.env', 'w') as f:
    f.write(f"MODEL_BACKEND={backend}\n")
print(f"Selected backend: {backend}")
