/**
 * Unit tests for YOLO detection pipeline functions
 * Tests the core detection functionality from yolo_tfjs.js
 */

import { 
  loadModel, 
  computeLetterboxParams, 
  preprocessImageToTensor, 
  runInference, 
  parseBoxes, 
  drawDetections 
} from '../../public/js/yolo_tfjs.js';

describe('YOLO Detection Pipeline', () => {
  
  describe('loadModel', () => {
    beforeEach(() => {
      // Reset mocks
      global.ort.InferenceSession.create.mockClear();
    });

    it('should load model with WebGL execution provider first', async () => {
      const mockSession = { inputNames: ['images'], outputNames: ['output'] };
      global.ort.InferenceSession.create.mockResolvedValueOnce(mockSession);

      const result = await loadModel('/test/model.onnx');

      expect(global.ort.InferenceSession.create).toHaveBeenCalledWith(
        '/test/model.onnx',
        { executionProviders: ['webgl'] }
      );
      expect(result).toBe(mockSession);
    });

    it('should fallback to CPU when WebGL fails', async () => {
      const mockSession = { inputNames: ['images'], outputNames: ['output'] };
      global.ort.InferenceSession.create
        .mockRejectedValueOnce(new Error('WebGL not supported'))
        .mockResolvedValueOnce(mockSession);

      const result = await loadModel('/test/model.onnx');

      expect(global.ort.InferenceSession.create).toHaveBeenCalledTimes(2);
      expect(global.ort.InferenceSession.create).toHaveBeenNthCalledWith(1,
        '/test/model.onnx',
        { executionProviders: ['webgl'] }
      );
      expect(global.ort.InferenceSession.create).toHaveBeenNthCalledWith(2,
        '/test/model.onnx'
      );
      expect(result).toBe(mockSession);
    });

    it('should throw error when both WebGL and CPU fail', async () => {
      global.ort.InferenceSession.create
        .mockRejectedValueOnce(new Error('WebGL failed'))
        .mockRejectedValueOnce(new Error('CPU failed'));

      await expect(loadModel('/test/model.onnx')).rejects.toThrow('CPU failed');
    });

    it('should handle invalid model paths', async () => {
      global.ort.InferenceSession.create.mockRejectedValue(new Error('Model not found'));

      await expect(loadModel('/invalid/path.onnx')).rejects.toThrow('Model not found');
    });
  });

  describe('computeLetterboxParams', () => {
    it('should compute correct letterbox parameters for landscape image', () => {
      const params = computeLetterboxParams(800, 600, 640);
      
      expect(params).toEqual({
        scale: 0.8,
        newW: 640,
        newH: 480,
        offsetX: 0,
        offsetY: 80
      });
    });

    it('should compute correct letterbox parameters for portrait image', () => {
      const params = computeLetterboxParams(400, 800, 640);
      
      expect(params).toEqual({
        scale: 0.8,
        newW: 320,
        newH: 640,
        offsetX: 160,
        offsetY: 0
      });
    });

    it('should compute correct letterbox parameters for square image', () => {
      const params = computeLetterboxParams(640, 640, 640);
      
      expect(params).toEqual({
        scale: 1,
        newW: 640,
        newH: 640,
        offsetX: 0,
        offsetY: 0
      });
    });

    it('should handle very small images', () => {
      const params = computeLetterboxParams(10, 10, 640);
      
      expect(params.scale).toBe(64);
      expect(params.newW).toBe(640);
      expect(params.newH).toBe(640);
    });

    it('should use default target size when not provided', () => {
      const params = computeLetterboxParams(800, 600);
      
      expect(params.scale).toBe(0.8);
      expect(params.newW).toBe(640);
      expect(params.newH).toBe(480);
    });
  });

  describe('preprocessImageToTensor', () => {
    let mockImage, mockCanvas, mockContext;

    beforeEach(() => {
      // Mock canvas and context
      mockContext = {
        fillStyle: '',
        fillRect: jest.fn(),
        drawImage: jest.fn(),
        getImageData: jest.fn().mockReturnValue({
          data: new Uint8ClampedArray(640 * 640 * 4).fill(128), // Gray image
          width: 640,
          height: 640
        })
      };
      
      mockCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn().mockReturnValue(mockContext)
      };

      // Mock createElement to return our mock canvas
      const originalCreateElement = document.createElement;
      document.createElement = jest.fn((tagName) => {
        if (tagName === 'canvas') {
          return mockCanvas;
        }
        return originalCreateElement.call(document, tagName);
      });

      mockImage = {
        naturalWidth: 800,
        naturalHeight: 600,
        width: 800,
        height: 600
      };

      // Mock ONNX Tensor constructor
      global.ort.Tensor.mockImplementation((type, data, dims) => ({
        type,
        data,
        dims
      }));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should preprocess image to correct tensor format', () => {
      const result = preprocessImageToTensor(mockImage, 640);

      expect(mockCanvas.width).toBe(640);
      expect(mockCanvas.height).toBe(640);
      expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 640, 640);
      expect(mockContext.drawImage).toHaveBeenCalledWith(
        mockImage, 0, 80, 640, 480
      );
      expect(result.tensor).toBeDefined();
      expect(result.letterboxParams).toBeDefined();
    });

    it('should handle video elements', () => {
      const mockVideo = {
        videoWidth: 1280,
        videoHeight: 720,
        width: 1280,
        height: 720
      };

      const result = preprocessImageToTensor(mockVideo, 640);

      expect(result.tensor).toBeDefined();
      expect(result.letterboxParams.scale).toBeCloseTo(0.5);
    });

    it('should create tensor with correct dimensions', () => {
      const result = preprocessImageToTensor(mockImage, 640);

      expect(global.ort.Tensor).toHaveBeenCalledWith(
        'float32',
        expect.any(Float32Array),
        [1, 3, 640, 640]
      );
    });

    it('should normalize pixel values to 0-1 range', () => {
      // Mock image data with specific RGB values
      mockContext.getImageData.mockReturnValue({
        data: new Uint8ClampedArray([255, 128, 0, 255]), // R=255, G=128, B=0, A=255
        width: 1,
        height: 1
      });

      const result = preprocessImageToTensor(mockImage, 1);

      // Check that tensor data contains normalized values
      const tensorData = global.ort.Tensor.mock.calls[0][1];
      expect(tensorData[0]).toBeCloseTo(1.0); // R channel
      expect(tensorData[1]).toBeCloseTo(0.5); // G channel  
      expect(tensorData[2]).toBeCloseTo(0.0); // B channel
    });
  });

  describe('runInference', () => {
    let mockSession, mockTensor;

    beforeEach(() => {
      mockTensor = { data: new Float32Array(640 * 640 * 3) };
      mockSession = {
        run: jest.fn()
      };
    });

    it('should run inference and return parsed boxes', async () => {
      const mockOutput = {
        data: new Float32Array([
          100, 100, 200, 200, 0.8, 0, // Valid detection
          300, 300, 400, 400, 0.9, 1  // Another valid detection
        ])
      };
      
      mockSession.run.mockResolvedValue({
        output: mockOutput
      });

      const result = await runInference(mockSession, mockTensor);

      expect(mockSession.run).toHaveBeenCalledWith({ images: mockTensor });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual([100, 100, 200, 200, 0.8, 0]);
      expect(result[1]).toEqual([300, 300, 400, 400, 0.9, 1]);
    });

    it('should handle inference errors', async () => {
      mockSession.run.mockRejectedValue(new Error('Inference failed'));

      await expect(runInference(mockSession, mockTensor)).rejects.toThrow('Inference failed');
    });

    it('should handle empty inference results', async () => {
      mockSession.run.mockResolvedValue({
        output: { data: new Float32Array([]) }
      });

      const result = await runInference(mockSession, mockTensor);

      expect(result).toHaveLength(0);
    });

    it('should handle multiple output keys', async () => {
      const mockOutput = {
        data: new Float32Array([100, 100, 200, 200, 0.8, 0])
      };
      
      mockSession.run.mockResolvedValue({
        'output_0': mockOutput,
        'output_1': { data: new Float32Array([]) }
      });

      const result = await runInference(mockSession, mockTensor);

      expect(result).toHaveLength(1);
    });
  });

  describe('parseBoxes', () => {
    it('should filter boxes by confidence threshold', () => {
      const boxes = [
        [100, 100, 200, 200, 0.8, 0], // Above threshold
        [300, 300, 400, 400, 0.3, 1], // Below threshold
        [500, 500, 600, 600, 0.9, 0]  // Above threshold
      ];

      const result = parseBoxes(boxes, 0.5);

      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(0.8);
      expect(result[1].score).toBe(0.9);
    });

    it('should filter boxes with invalid dimensions', () => {
      const boxes = [
        [100, 100, 200, 200, 0.8, 0], // Valid box
        [300, 300, 300, 300, 0.9, 1], // Zero width/height
        [500, 500, 499, 499, 0.7, 0]  // Negative width/height
      ];

      const result = parseBoxes(boxes, 0.5);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        x1: 100, y1: 100, x2: 200, y2: 200,
        score: 0.8, classId: 0
      });
    });

    it('should round class IDs to integers', () => {
      const boxes = [
        [100, 100, 200, 200, 0.8, 0.7] // Fractional class ID
      ];

      const result = parseBoxes(boxes, 0.5);

      expect(result[0].classId).toBe(0);
    });

    it('should use default confidence threshold when not provided', () => {
      const boxes = [
        [100, 100, 200, 200, 0.6, 0], // Above default threshold (0.5)
        [300, 300, 400, 400, 0.4, 1]  // Below default threshold
      ];

      const result = parseBoxes(boxes);

      expect(result).toHaveLength(1);
    });
  });

  describe('drawDetections', () => {
    let mockContext, mockImage, mockCanvas;

    beforeEach(() => {
      mockContext = {
        clearRect: jest.fn(),
        drawImage: jest.fn(),
        strokeRect: jest.fn(),
        fillRect: jest.fn(),
        fillText: jest.fn(),
        measureText: jest.fn().mockReturnValue({ width: 100 }),
        canvas: { width: 640, height: 480 },
        strokeStyle: '',
        lineWidth: 0,
        fillStyle: '',
        font: ''
      };

      mockImage = {
        naturalWidth: 800,
        naturalHeight: 600,
        width: 800,
        height: 600
      };

      mockCanvas = {
        width: 640,
        height: 480
      };
      mockContext.canvas = mockCanvas;
    });

    it('should draw detections on canvas', () => {
      const boxes = [
        { x1: 100, y1: 100, x2: 200, y2: 200, score: 0.8, classId: 0 }
      ];
      const classNames = ['crack', 'pothole'];

      drawDetections(mockContext, mockImage, boxes, classNames);

      expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
      expect(mockContext.drawImage).toHaveBeenCalledWith(mockImage, 0, 0, 640, 480);
      expect(mockContext.strokeRect).toHaveBeenCalled();
      expect(mockContext.fillText).toHaveBeenCalledWith(
        expect.stringContaining('crack'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should handle video elements', () => {
      const mockVideo = {
        videoWidth: 1280,
        videoHeight: 720,
        width: 1280,
        height: 720
      };
      const boxes = [
        { x1: 100, y1: 100, x2: 200, y2: 200, score: 0.8, classId: 0 }
      ];
      const classNames = ['crack', 'pothole'];

      drawDetections(mockContext, mockVideo, boxes, classNames);

      expect(mockContext.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0, 640, 480);
    });

    it('should use letterbox parameters when provided', () => {
      const boxes = [
        { x1: 100, y1: 100, x2: 200, y2: 200, score: 0.8, classId: 0 }
      ];
      const classNames = ['crack'];
      const letterboxParams = { scale: 0.5, offsetX: 160, offsetY: 90 };

      drawDetections(mockContext, mockImage, boxes, classNames, letterboxParams);

      // Should scale coordinates based on original image dimensions
      expect(mockContext.strokeRect).toHaveBeenCalled();
    });

    it('should handle missing class names gracefully', () => {
      const boxes = [
        { x1: 100, y1: 100, x2: 200, y2: 200, score: 0.8, classId: 5 } // Class ID beyond available names
      ];
      const classNames = ['crack', 'pothole'];

      drawDetections(mockContext, mockImage, boxes, classNames);

      expect(mockContext.fillText).toHaveBeenCalledWith(
        expect.stringContaining('Class 5'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should handle empty boxes array', () => {
      const boxes = [];
      const classNames = ['crack', 'pothole'];

      drawDetections(mockContext, mockImage, boxes, classNames);

      expect(mockContext.clearRect).toHaveBeenCalled();
      expect(mockContext.drawImage).toHaveBeenCalled();
      expect(mockContext.strokeRect).not.toHaveBeenCalled();
    });

    it('should position text labels correctly', () => {
      const boxes = [
        { x1: 10, y1: 10, x2: 110, y2: 110, score: 0.8, classId: 0 }, // Near top edge
        { x1: 100, y1: 100, x2: 200, y2: 200, score: 0.9, classId: 1 } // Normal position
      ];
      const classNames = ['crack', 'pothole'];

      drawDetections(mockContext, mockImage, boxes, classNames);

      expect(mockContext.fillText).toHaveBeenCalledTimes(2);
      // First box should have text at y=10 (edge case)
      // Second box should have text above the box
    });
  });
});

describe('Integration Tests - Detection Pipeline', () => {
  it('should handle complete detection workflow', async () => {
    // Mock successful model loading
    const mockSession = {
      run: jest.fn().mockResolvedValue({
        output: {
          data: new Float32Array([100, 100, 200, 200, 0.8, 0])
        }
      })
    };
    global.ort.InferenceSession.create.mockResolvedValue(mockSession);

    // Mock image processing
    const mockImage = {
      naturalWidth: 640,
      naturalHeight: 480
    };

    // Load model
    const session = await loadModel('/test/model.onnx');
    
    // Preprocess image
    const { tensor, letterboxParams } = preprocessImageToTensor(mockImage);
    
    // Run inference
    const rawBoxes = await runInference(session, tensor);
    
    // Parse results
    const parsedBoxes = parseBoxes(rawBoxes, 0.5);

    expect(parsedBoxes).toHaveLength(1);
    expect(parsedBoxes[0]).toMatchObject({
      x1: 100, y1: 100, x2: 200, y2: 200,
      score: 0.8, classId: 0
    });
  });

  it('should handle detection pipeline errors gracefully', async () => {
    // Mock model loading failure
    global.ort.InferenceSession.create.mockRejectedValue(new Error('Model loading failed'));

    await expect(loadModel('/invalid/model.onnx')).rejects.toThrow('Model loading failed');
  });
});