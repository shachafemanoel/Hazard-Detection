
import onnx
from onnxsim import simplify

# load your predefined ONNX model
model = onnx.load('public/object_detection_model/best0608.onnx')

# convert model
model_simplified, check = simplify(model)

assert check, "Simplified ONNX model could not be validated"

onnx.save(model_simplified, 'public/object_detection_model/best0608_simplified.onnx')

print('ONNX model simplified and saved to public/object_detection_model/best0608_simplified.onnx')
