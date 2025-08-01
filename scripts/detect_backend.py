import json
from cpuinfo import get_cpu_info

flags = get_cpu_info().get('flags', [])
use_openvino = any(f in flags for f in ['avx', 'avx2', 'sse4_2'])
backend = 'openvino' if use_openvino else 'pytorch'
with open('/app/backend.env', 'w') as f:
    f.write(f"MODEL_BACKEND={backend}\n")
    f.write("MODEL_DIR=/app\n")
print(f"Selected backend: {backend}")
