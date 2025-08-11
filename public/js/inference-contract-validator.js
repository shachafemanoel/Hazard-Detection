/**
 * Inference Contract Validator
 * Validates detection results against the unified inference contract
 * Provides runtime validation and fail-fast error reporting
 */

// Import contract specification
const INFERENCE_CONTRACT_VERSION = '1.0';

// Valid class definitions per contract
const VALID_CLASSES = {
  0: 'crack',
  1: 'knocked', 
  2: 'pothole',
  3: 'surface damage'
};

const VALID_CLASS_IDS = Object.keys(VALID_CLASSES).map(Number);
const VALID_CLASS_NAMES = Object.values(VALID_CLASSES);

// Valid engine names per contract
const VALID_ENGINES = ['local', 'remote', 'worker'];
const VALID_BACKENDS = ['webgpu', 'wasm', 'openvino', 'fastapi', 'onnx'];

/**
 * Validation error class
 */
class ContractValidationError extends Error {
  constructor(message, field, value, expected) {
    super(message);
    this.name = 'ContractValidationError';
    this.field = field;
    this.value = value;
    this.expected = expected;
    this.timestamp = Date.now();
  }
}

/**
 * Validate a single detection object
 * @param {Object} detection - Detection to validate
 * @param {number} index - Detection index for error reporting
 * @param {number} imageWidth - Source image width for bounds checking
 * @param {number} imageHeight - Source image height for bounds checking
 * @throws {ContractValidationError} If validation fails
 */
function validateDetection(detection, index, imageWidth, imageHeight) {
  const prefix = `detections[${index}]`;

  // Required fields validation
  const requiredFields = ['x1', 'y1', 'x2', 'y2', 'score', 'classId', 'className'];
  for (const field of requiredFields) {
    if (!(field in detection)) {
      throw new ContractValidationError(
        `Missing required field: ${prefix}.${field}`,
        `${prefix}.${field}`,
        undefined,
        'required field'
      );
    }
  }

  // Coordinate validation
  if (typeof detection.x1 !== 'number' || typeof detection.y1 !== 'number' ||
      typeof detection.x2 !== 'number' || typeof detection.y2 !== 'number') {
    throw new ContractValidationError(
      `Invalid coordinate types in ${prefix}`,
      `${prefix}.coordinates`,
      typeof detection.x1,
      'number'
    );
  }

  // Coordinate bounds validation
  if (detection.x1 < 0 || detection.y1 < 0 || 
      detection.x2 > imageWidth || detection.y2 > imageHeight) {
    throw new ContractValidationError(
      `Coordinates out of bounds in ${prefix}: (${detection.x1},${detection.y1})→(${detection.x2},${detection.y2}) vs image (${imageWidth}×${imageHeight})`,
      `${prefix}.bounds`,
      `(${detection.x1},${detection.y1})→(${detection.x2},${detection.y2})`,
      `within (0,0)→(${imageWidth},${imageHeight})`
    );
  }

  // Coordinate ordering validation
  if (detection.x1 >= detection.x2 || detection.y1 >= detection.y2) {
    throw new ContractValidationError(
      `Invalid coordinate ordering in ${prefix}: x1 >= x2 or y1 >= y2`,
      `${prefix}.ordering`,
      `(${detection.x1},${detection.y1})→(${detection.x2},${detection.y2})`,
      'x1 < x2 and y1 < y2'
    );
  }

  // Score validation
  if (typeof detection.score !== 'number' || detection.score < 0 || detection.score > 1) {
    throw new ContractValidationError(
      `Invalid score in ${prefix}: must be number in range [0,1]`,
      `${prefix}.score`,
      detection.score,
      'number in [0,1]'
    );
  }

  // Class ID validation
  if (!Number.isInteger(detection.classId) || !VALID_CLASS_IDS.includes(detection.classId)) {
    throw new ContractValidationError(
      `Invalid classId in ${prefix}: must be integer in ${JSON.stringify(VALID_CLASS_IDS)}`,
      `${prefix}.classId`,
      detection.classId,
      `integer in ${JSON.stringify(VALID_CLASS_IDS)}`
    );
  }

  // Class name validation
  if (typeof detection.className !== 'string' || !VALID_CLASS_NAMES.includes(detection.className)) {
    throw new ContractValidationError(
      `Invalid className in ${prefix}: must be string in ${JSON.stringify(VALID_CLASS_NAMES)}`,
      `${prefix}.className`,
      detection.className,
      `string in ${JSON.stringify(VALID_CLASS_NAMES)}`
    );
  }

  // Class consistency validation
  if (VALID_CLASSES[detection.classId] !== detection.className) {
    throw new ContractValidationError(
      `Class inconsistency in ${prefix}: classId ${detection.classId} should map to "${VALID_CLASSES[detection.classId]}" but got "${detection.className}"`,
      `${prefix}.classConsistency`,
      `${detection.classId}→"${detection.className}"`,
      `${detection.classId}→"${VALID_CLASSES[detection.classId]}"`
    );
  }
}

/**
 * Validate inference timings object
 * @param {Object} timings - Timings to validate
 * @throws {ContractValidationError} If validation fails
 */
function validateTimings(timings) {
  if (!timings || typeof timings !== 'object') {
    throw new ContractValidationError(
      'Invalid timings: must be object',
      'timings',
      typeof timings,
      'object'
    );
  }

  const requiredTimings = ['preprocess_ms', 'infer_ms', 'postprocess_ms', 'total_ms'];
  for (const timing of requiredTimings) {
    if (!(timing in timings)) {
      throw new ContractValidationError(
        `Missing required timing: ${timing}`,
        `timings.${timing}`,
        undefined,
        'required number'
      );
    }

    if (typeof timings[timing] !== 'number' || timings[timing] < 0) {
      throw new ContractValidationError(
        `Invalid timing ${timing}: must be non-negative number`,
        `timings.${timing}`,
        timings[timing],
        'non-negative number'
      );
    }
  }

  // Logical validation: total should be >= sum of components
  const componentSum = timings.preprocess_ms + timings.infer_ms + timings.postprocess_ms;
  if (timings.total_ms < componentSum * 0.9) { // Allow 10% tolerance for rounding
    console.warn(`Timing inconsistency: total_ms (${timings.total_ms}) < component sum (${componentSum})`);
  }
}

/**
 * Validate engine info object
 * @param {Object} engine - Engine info to validate
 * @throws {ContractValidationError} If validation fails
 */
function validateEngineInfo(engine) {
  if (!engine || typeof engine !== 'object') {
    throw new ContractValidationError(
      'Invalid engine: must be object',
      'engine',
      typeof engine,
      'object'
    );
  }

  // Required engine fields
  const requiredFields = ['name', 'backend', 'version'];
  for (const field of requiredFields) {
    if (!(field in engine)) {
      throw new ContractValidationError(
        `Missing required engine field: ${field}`,
        `engine.${field}`,
        undefined,
        'required string'
      );
    }

    if (typeof engine[field] !== 'string') {
      throw new ContractValidationError(
        `Invalid engine.${field}: must be string`,
        `engine.${field}`,
        typeof engine[field],
        'string'
      );
    }
  }

  // Engine name validation
  if (!VALID_ENGINES.includes(engine.name)) {
    throw new ContractValidationError(
      `Invalid engine.name: must be one of ${JSON.stringify(VALID_ENGINES)}`,
      'engine.name',
      engine.name,
      JSON.stringify(VALID_ENGINES)
    );
  }

  // Backend validation
  if (!VALID_BACKENDS.includes(engine.backend)) {
    throw new ContractValidationError(
      `Invalid engine.backend: must be one of ${JSON.stringify(VALID_BACKENDS)}`,
      'engine.backend',
      engine.backend,
      JSON.stringify(VALID_BACKENDS)
    );
  }
}

/**
 * Validate complete detection result against inference contract
 * @param {Object} result - Detection result to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateDetectionResult(result, options = {}) {
  const {
    strict = true,
    logWarnings = true,
    throwOnError = true
  } = options;

  const validationResult = {
    valid: true,
    errors: [],
    warnings: [],
    timestamp: Date.now(),
    contractVersion: INFERENCE_CONTRACT_VERSION
  };

  try {
    // Basic structure validation
    if (!result || typeof result !== 'object') {
      throw new ContractValidationError(
        'Detection result must be an object',
        'result',
        typeof result,
        'object'
      );
    }

    // Required top-level fields
    const requiredFields = ['detections', 'width', 'height', 'timings', 'engine'];
    for (const field of requiredFields) {
      if (!(field in result)) {
        throw new ContractValidationError(
          `Missing required field: ${field}`,
          field,
          undefined,
          'required field'
        );
      }
    }

    // Validate detections array
    if (!Array.isArray(result.detections)) {
      throw new ContractValidationError(
        'detections must be an array',
        'detections',
        typeof result.detections,
        'array'
      );
    }

    // Validate image dimensions
    if (typeof result.width !== 'number' || result.width <= 0 ||
        typeof result.height !== 'number' || result.height <= 0) {
      throw new ContractValidationError(
        'width and height must be positive numbers',
        'dimensions',
        `${result.width}×${result.height}`,
        'positive numbers'
      );
    }

    // Validate each detection
    result.detections.forEach((detection, index) => {
      validateDetection(detection, index, result.width, result.height);
    });

    // Validate timings
    validateTimings(result.timings);

    // Validate engine info
    validateEngineInfo(result.engine);

    // Performance warnings (non-fatal)
    if (logWarnings) {
      if (result.timings.total_ms > 5000) {
        validationResult.warnings.push(`High inference time: ${result.timings.total_ms}ms`);
      }

      if (result.detections.length > 100) {
        validationResult.warnings.push(`High detection count: ${result.detections.length}`);
      }
    }

  } catch (error) {
    validationResult.valid = false;
    validationResult.errors.push(error);

    if (throwOnError) {
      // Enhance error with validation context
      error.validationResult = validationResult;
      error.contractVersion = INFERENCE_CONTRACT_VERSION;
      throw error;
    }
  }

  // Log results
  if (validationResult.errors.length > 0) {
    console.error('🚫 Inference contract validation failed:', validationResult.errors);
  }

  if (validationResult.warnings.length > 0 && logWarnings) {
    console.warn('⚠️ Inference contract warnings:', validationResult.warnings);
  }

  if (validationResult.valid && validationResult.errors.length === 0) {
    console.log('✅ Inference contract validation passed', {
      detections: result.detections.length,
      engine: `${result.engine.name}/${result.engine.backend}`,
      totalTime: result.timings.total_ms
    });
  }

  return validationResult;
}

/**
 * Convert legacy detection format to contract format
 * @param {Array|Object} detections - Legacy detections
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Contract-compliant detection result
 */
export function convertToContractFormat(detections, metadata = {}) {
  const {
    width = 640,
    height = 640,
    timings = { preprocess_ms: 0, infer_ms: 0, postprocess_ms: 0, total_ms: 0 },
    engine = { name: 'unknown', backend: 'unknown', version: '1.0' }
  } = metadata;

  // Convert various detection formats to contract format
  let contractDetections = [];

  if (Array.isArray(detections)) {
    contractDetections = detections.map((det, index) => {
      // Handle array format [x1, y1, x2, y2, score, classId]
      if (Array.isArray(det) && det.length >= 6) {
        return {
          x1: det[0],
          y1: det[1],
          x2: det[2],
          y2: det[3],
          score: det[4],
          classId: Math.floor(det[5]),
          className: VALID_CLASSES[Math.floor(det[5])] || `Class ${Math.floor(det[5])}`
        };
      }

      // Handle object format (already mostly compliant)
      if (typeof det === 'object') {
        return {
          x1: det.x1,
          y1: det.y1,
          x2: det.x2,
          y2: det.y2,
          score: det.score || det.confidence,
          classId: det.classId,
          className: det.className || VALID_CLASSES[det.classId] || `Class ${det.classId}`
        };
      }

      console.warn(`Unknown detection format at index ${index}:`, det);
      return null;
    }).filter(det => det !== null);
  }

  // Create contract-compliant result
  const result = {
    detections: contractDetections,
    width: width,
    height: height,
    timings: {
      preprocess_ms: timings.preprocess_ms || 0,
      infer_ms: timings.infer_ms || 0,
      postprocess_ms: timings.postprocess_ms || 0,
      total_ms: timings.total_ms || 0
    },
    engine: {
      name: engine.name || 'unknown',
      backend: engine.backend || 'unknown',
      version: engine.version || '1.0',
      ...engine
    }
  };

  return result;
}

/**
 * Create a fail-fast validator decorator for functions
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Validation options
 * @returns {Function} Wrapped function with validation
 */
export function withContractValidation(fn, options = {}) {
  return function(...args) {
    const result = fn.apply(this, args);
    
    // If result is a Promise, validate when resolved
    if (result && typeof result.then === 'function') {
      return result.then(detectionResult => {
        validateDetectionResult(detectionResult, options);
        return detectionResult;
      });
    }
    
    // Immediate validation for sync results
    validateDetectionResult(result, options);
    return result;
  };
}

/**
 * Log contract validation failure with enhanced details
 * @param {ContractValidationError} error - Validation error
 * @param {Object} context - Additional context
 */
export function logContractFailure(error, context = {}) {
  console.error('🚫 INFERENCE CONTRACT VIOLATION 🚫', {
    error: error.message,
    field: error.field,
    expected: error.expected,
    received: error.value,
    timestamp: new Date(error.timestamp).toISOString(),
    context: context,
    contractVersion: INFERENCE_CONTRACT_VERSION,
    stack: error.stack
  });

  // Send failure report to monitoring if available
  if (typeof reportContractViolation === 'function') {
    reportContractViolation({
      error: error.message,
      field: error.field,
      context: context,
      timestamp: error.timestamp
    });
  }
}

// Export validation utilities
export {
  ContractValidationError,
  VALID_CLASSES,
  VALID_CLASS_IDS,
  VALID_CLASS_NAMES,
  VALID_ENGINES,
  VALID_BACKENDS,
  INFERENCE_CONTRACT_VERSION
};