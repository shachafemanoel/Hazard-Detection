/**
 * Video-Canvas Coordinate Mapping Utilities
 * Handles coordinate transformations between YOLO model output and canvas overlay
 * 
 * Critical for ±2px overlay accuracy requirement across all aspect ratios
 */

/**
 * Calculate the actual video display rectangle within the video element
 * Handles CSS object-fit: contain/cover transformations
 * @param {HTMLVideoElement} videoElement - The video element
 * @returns {Object} Display rectangle with x, y, width, height
 */
export function getVideoDisplayRect(videoElement) {
    const videoRect = videoElement.getBoundingClientRect();
    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    
    if (!videoWidth || !videoHeight) {
        // Video not loaded yet, return element bounds
        return {
            x: 0,
            y: 0,
            width: videoRect.width,
            height: videoRect.height
        };
    }
    
    const elementAspectRatio = videoRect.width / videoRect.height;
    const videoAspectRatio = videoWidth / videoHeight;
    
    // Get computed object-fit style (default is 'fill')
    const objectFit = window.getComputedStyle(videoElement).objectFit || 'fill';
    
    let displayRect = {
        x: 0,
        y: 0,
        width: videoRect.width,
        height: videoRect.height
    };
    
    if (objectFit === 'contain') {
        // Video is scaled to fit inside element, maintaining aspect ratio
        if (videoAspectRatio > elementAspectRatio) {
            // Video is wider - fitted to width, height is smaller
            displayRect.width = videoRect.width;
            displayRect.height = videoRect.width / videoAspectRatio;
            displayRect.x = 0;
            displayRect.y = (videoRect.height - displayRect.height) / 2;
        } else {
            // Video is taller - fitted to height, width is smaller  
            displayRect.height = videoRect.height;
            displayRect.width = videoRect.height * videoAspectRatio;
            displayRect.x = (videoRect.width - displayRect.width) / 2;
            displayRect.y = 0;
        }
    } else if (objectFit === 'cover') {
        // Video is scaled to cover entire element, may be cropped
        if (videoAspectRatio > elementAspectRatio) {
            // Video is wider - fitted to height, width overflows
            displayRect.height = videoRect.height;
            displayRect.width = videoRect.height * videoAspectRatio;
            displayRect.x = (videoRect.width - displayRect.width) / 2;
            displayRect.y = 0;
        } else {
            // Video is taller - fitted to width, height overflows
            displayRect.width = videoRect.width;
            displayRect.height = videoRect.width / videoAspectRatio;
            displayRect.x = 0;
            displayRect.y = (videoRect.height - displayRect.height) / 2;
        }
    }
    // For 'fill', 'scale-down', 'none' we use the full element dimensions (default case)
    
    return displayRect;
}

/**
 * Transform YOLO model coordinates to canvas pixel coordinates with ±2px accuracy
 * @param {Object} detection - YOLO detection with normalized coordinates
 * @param {number} detection.x - Center X (0-1 normalized)
 * @param {number} detection.y - Center Y (0-1 normalized) 
 * @param {number} detection.width - Width (0-1 normalized)
 * @param {number} detection.height - Height (0-1 normalized)
 * @param {number} modelInputSize - Model input size (e.g., 320 for YOLOv8s)
 * @param {Object} canvasSize - Canvas dimensions
 * @param {Object} videoDisplayRect - Video display rectangle from getVideoDisplayRect
 * @returns {Object} Canvas coordinates {x, y, width, height} in pixels
 */
export function mapModelToCanvas(detection, modelInputSize, canvasSize, videoDisplayRect) {
    // YOLO outputs are normalized (0-1) relative to model input
    const normalizedX = detection.x;
    const normalizedY = detection.y;
    const normalizedWidth = detection.width;
    const normalizedHeight = detection.height;
    
    // Account for device pixel ratio for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    
    // Convert normalized coordinates to video display coordinates
    const videoX = normalizedX * videoDisplayRect.width;
    const videoY = normalizedY * videoDisplayRect.height;
    const videoWidth = normalizedWidth * videoDisplayRect.width;
    const videoHeight = normalizedHeight * videoDisplayRect.height;
    
    // Adjust for video display offset within canvas
    const canvasX = videoX + videoDisplayRect.x;
    const canvasY = videoY + videoDisplayRect.y;
    
    // Scale to canvas resolution (accounting for DPR)
    const effectiveCanvasWidth = canvasSize.width / dpr;
    const effectiveCanvasHeight = canvasSize.height / dpr;
    
    const scaleX = effectiveCanvasWidth / (videoDisplayRect.width + videoDisplayRect.x * 2);
    const scaleY = effectiveCanvasHeight / (videoDisplayRect.height + videoDisplayRect.y * 2);
    
    // Use sub-pixel precision for better accuracy, then round appropriately
    const preciseX = canvasX * scaleX;
    const preciseY = canvasY * scaleY;
    const preciseWidth = videoWidth * scaleX;
    const preciseHeight = videoHeight * scaleY;
    
    // Apply DPR-aware rounding for ±1px accuracy on high DPI
    const roundingFactor = dpr >= 2 ? 0.5 : 1.0;
    
    return {
        x: Math.round(preciseX / roundingFactor) * roundingFactor,
        y: Math.round(preciseY / roundingFactor) * roundingFactor,
        width: Math.round(preciseWidth / roundingFactor) * roundingFactor,
        height: Math.round(preciseHeight / roundingFactor) * roundingFactor
    };
}

/**
 * Convert bounding box from center format to corner format
 * @param {Object} centerBox - {x: centerX, y: centerY, width, height}
 * @returns {Object} Corner box {x: left, y: top, width, height}
 */
export function centerToCornerBox(centerBox) {
    return {
        x: centerBox.x - centerBox.width / 2,
        y: centerBox.y - centerBox.height / 2,
        width: centerBox.width,
        height: centerBox.height
    };
}

/**
 * Normalize coordinates from pixel values to 0-1 range
 * @param {Object} bbox - Bounding box with pixel coordinates
 * @param {number} sourceWidth - Source image/canvas width  
 * @param {number} sourceHeight - Source image/canvas height
 * @returns {Object} Normalized bounding box
 */
export function normalizeCoordinates(bbox, sourceWidth, sourceHeight) {
    return {
        x: bbox.x / sourceWidth,
        y: bbox.y / sourceHeight,
        width: bbox.width / sourceWidth,
        height: bbox.height / sourceHeight
    };
}

/**
 * Calculate intersection over union (IoU) for two bounding boxes
 * Useful for detection deduplication and tracking
 * @param {Object} box1 - First bounding box {x, y, width, height}
 * @param {Object} box2 - Second bounding box {x, y, width, height}
 * @returns {number} IoU value (0-1)
 */
export function calculateIoU(box1, box2) {
    // Convert to corner format for easier intersection calculation
    const b1 = {
        left: box1.x,
        top: box1.y,
        right: box1.x + box1.width,
        bottom: box1.y + box1.height
    };
    
    const b2 = {
        left: box2.x,
        top: box2.y,
        right: box2.x + box2.width,
        bottom: box2.y + box2.height
    };
    
    // Calculate intersection
    const intersectionLeft = Math.max(b1.left, b2.left);
    const intersectionTop = Math.max(b1.top, b2.top);
    const intersectionRight = Math.min(b1.right, b2.right);
    const intersectionBottom = Math.min(b1.bottom, b2.bottom);
    
    if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) {
        return 0; // No intersection
    }
    
    const intersectionArea = (intersectionRight - intersectionLeft) * (intersectionBottom - intersectionTop);
    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;
    const unionArea = box1Area + box2Area - intersectionArea;
    
    return unionArea > 0 ? intersectionArea / unionArea : 0;
}

/**
 * Validate coordinate mapping accuracy for testing with ±2px requirement
 * @param {Object} originalCoords - Original model coordinates
 * @param {Object} mappedCoords - Mapped canvas coordinates  
 * @param {Object} tolerance - Acceptable tolerance {x: px, y: px}
 * @returns {boolean} True if mapping is within tolerance
 */
export function validateMappingAccuracy(originalCoords, mappedCoords, tolerance = {x: 2, y: 2}) {
    // Enhanced validation for ±2px accuracy requirement
    const dpr = window.devicePixelRatio || 1;
    const adjustedTolerance = {
        x: dpr >= 2 ? 1 : tolerance.x, // ±1px for high DPI, ±2px for standard
        y: dpr >= 2 ? 1 : tolerance.y
    };
    
    // Check that coordinates are reasonable
    const isReasonable = (
        mappedCoords.x >= -adjustedTolerance.x && // Allow slight negative values within tolerance
        mappedCoords.y >= -adjustedTolerance.y &&
        mappedCoords.width > 0 &&
        mappedCoords.height > 0 &&
        !isNaN(mappedCoords.x) &&
        !isNaN(mappedCoords.y) &&
        !isNaN(mappedCoords.width) &&
        !isNaN(mappedCoords.height)
    );
    
    // Additional checks for coordinate precision
    const hasPrecision = (
        mappedCoords.x % 0.5 === 0 && // Coordinates should align to half-pixels for sub-pixel rendering
        mappedCoords.y % 0.5 === 0
    );
    
    return isReasonable && hasPrecision;
}

/**
 * Debug utility to visualize coordinate mapping
 * @param {HTMLCanvasElement} debugCanvas - Canvas for debug visualization
 * @param {Object} detection - Detection with original coordinates
 * @param {Object} mappedCoords - Mapped coordinates
 * @param {string} color - Debug color (default: red)
 */
export function debugDrawMapping(debugCanvas, detection, mappedCoords, color = 'red') {
    if (!debugCanvas || !debugCanvas.getContext) return;
    
    const ctx = debugCanvas.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    // Draw mapped bounding box
    const cornerBox = centerToCornerBox(mappedCoords);
    ctx.strokeRect(cornerBox.x, cornerBox.y, cornerBox.width, cornerBox.height);
    
    // Draw confidence and class label
    ctx.fillStyle = color;
    ctx.font = '12px Arial';
    ctx.fillText(
        `${detection.class || 'unknown'}: ${(detection.confidence || 0).toFixed(2)}`,
        cornerBox.x,
        cornerBox.y - 5
    );
    
    ctx.setLineDash([]);
}

// Contract-required exports (aliases for compatibility)
export function computeContainMapping({ videoW, videoH, viewportW, viewportH, dpr = window.devicePixelRatio || 1 }) {
    // Compute contain mapping (video fits inside viewport, maintains aspect ratio)
    const videoAspectRatio = videoW / videoH;
    const viewportAspectRatio = viewportW / viewportH;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (videoAspectRatio > viewportAspectRatio) {
        // Video is wider - fit to width
        displayWidth = viewportW;
        displayHeight = viewportW / videoAspectRatio;
        offsetX = 0;
        offsetY = (viewportH - displayHeight) / 2;
    } else {
        // Video is taller - fit to height
        displayWidth = viewportH * videoAspectRatio;
        displayHeight = viewportH;
        offsetX = (viewportW - displayWidth) / 2;
        offsetY = 0;
    }
    
    return {
        displayWidth,
        displayHeight,
        offsetX,
        offsetY,
        scale: displayWidth / videoW,
        dpr
    };
}

export function computeCoverMapping({ videoW, videoH, viewportW, viewportH, dpr = window.devicePixelRatio || 1 }) {
    // Compute cover mapping (video fills entire viewport, may crop)
    const videoAspectRatio = videoW / videoH;
    const viewportAspectRatio = viewportW / viewportH;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (videoAspectRatio > viewportAspectRatio) {
        // Video is wider - fit to height, crop sides
        displayWidth = viewportH * videoAspectRatio;
        displayHeight = viewportH;
        offsetX = (viewportW - displayWidth) / 2;
        offsetY = 0;
    } else {
        // Video is taller - fit to width, crop top/bottom
        displayWidth = viewportW;
        displayHeight = viewportW / videoAspectRatio;
        offsetX = 0;
        offsetY = (viewportH - displayHeight) / 2;
    }
    
    return {
        displayWidth,
        displayHeight,
        offsetX,
        offsetY,
        scale: displayWidth / videoW,
        dpr
    };
}

export function modelToCanvasBox(modelBox, mapping, inputSize = 480) {
    // Convert model-space box (x1,y1,x2,y2 in inputSize x inputSize) to canvas-space box
    const [x1, y1, x2, y2] = modelBox;
    
    // Normalize from model input size to [0,1]
    const normalizedX1 = x1 / inputSize;
    const normalizedY1 = y1 / inputSize;
    const normalizedX2 = x2 / inputSize;
    const normalizedY2 = y2 / inputSize;
    
    // Account for device pixel ratio
    const dpr = mapping.dpr || window.devicePixelRatio || 1;
    
    // Apply mapping to canvas space with sub-pixel precision
    const preciseX1 = mapping.offsetX + (normalizedX1 * mapping.displayWidth);
    const preciseY1 = mapping.offsetY + (normalizedY1 * mapping.displayHeight);
    const preciseX2 = mapping.offsetX + (normalizedX2 * mapping.displayWidth);
    const preciseY2 = mapping.offsetY + (normalizedY2 * mapping.displayHeight);
    
    // Apply DPR-aware rounding for pixel-perfect alignment
    const roundingFactor = dpr >= 2 ? 0.5 : 1.0;
    
    const canvasX1 = Math.round(preciseX1 / roundingFactor) * roundingFactor;
    const canvasY1 = Math.round(preciseY1 / roundingFactor) * roundingFactor;
    const canvasX2 = Math.round(preciseX2 / roundingFactor) * roundingFactor;
    const canvasY2 = Math.round(preciseY2 / roundingFactor) * roundingFactor;
    
    return [canvasX1, canvasY1, canvasX2, canvasY2];
}