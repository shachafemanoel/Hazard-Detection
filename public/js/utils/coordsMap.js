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
 * Transform YOLO model coordinates to canvas pixel coordinates
 * Handles both center-based and corner-based YOLO formats with DPR accuracy
 * @param {Object} detection - YOLO detection with coordinates
 * @param {number} detection.x1|detection.x - Left/Center X coordinate
 * @param {number} detection.y1|detection.y - Top/Center Y coordinate
 * @param {number} detection.x2|detection.width - Right/Width coordinate
 * @param {number} detection.y2|detection.height - Bottom/Height coordinate
 * @param {number} modelInputSize - Model input size (e.g., 640 for YOLOv8)
 * @param {Object} canvasSize - Canvas dimensions {width, height}
 * @param {Object} videoDisplayRect - Video display rectangle from getVideoDisplayRect
 * @param {number} dpr - Device pixel ratio (default: window.devicePixelRatio)
 * @returns {Object} Canvas coordinates {x1, y1, x2, y2} in device pixels
 */
export function mapModelToCanvas(detection, modelInputSize, canvasSize, videoDisplayRect, dpr = window.devicePixelRatio || 1) {
    let x1, y1, x2, y2;
    
    // Handle different YOLO output formats
    if ('x1' in detection && 'y1' in detection && 'x2' in detection && 'y2' in detection) {
        // Corner format (x1, y1, x2, y2) - already normalized to model input size
        x1 = detection.x1 / modelInputSize;
        y1 = detection.y1 / modelInputSize;
        x2 = detection.x2 / modelInputSize;
        y2 = detection.y2 / modelInputSize;
    } else if ('x' in detection && 'y' in detection && 'width' in detection && 'height' in detection) {
        // Center format (x, y, width, height) - normalized 0-1
        const centerX = detection.x;
        const centerY = detection.y;
        const width = detection.width;
        const height = detection.height;
        
        x1 = centerX - width / 2;
        y1 = centerY - height / 2;
        x2 = centerX + width / 2;
        y2 = centerY + height / 2;
    } else {
        console.error('Invalid detection format:', detection);
        return { x1: 0, y1: 0, x2: 0, y2: 0 };
    }
    
    // Clamp normalized coordinates to [0, 1] range
    x1 = Math.max(0, Math.min(1, x1));
    y1 = Math.max(0, Math.min(1, y1));
    x2 = Math.max(0, Math.min(1, x2));
    y2 = Math.max(0, Math.min(1, y2));
    
    // Map normalized coordinates to video display space
    const displayX1 = x1 * videoDisplayRect.width + videoDisplayRect.x;
    const displayY1 = y1 * videoDisplayRect.height + videoDisplayRect.y;
    const displayX2 = x2 * videoDisplayRect.width + videoDisplayRect.x;
    const displayY2 = y2 * videoDisplayRect.height + videoDisplayRect.y;
    
    // Scale to canvas device pixels for DPR accuracy
    const canvasX1 = Math.round(displayX1 * dpr);
    const canvasY1 = Math.round(displayY1 * dpr);
    const canvasX2 = Math.round(displayX2 * dpr);
    const canvasY2 = Math.round(displayY2 * dpr);
    
    return { x1: canvasX1, y1: canvasY1, x2: canvasX2, y2: canvasY2 };
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
 * Validate coordinate mapping accuracy for testing
 * Ensures ≤1px error at all DPR values as required by CLAUDE.md
 * @param {Object} originalCoords - Original model coordinates
 * @param {Object} mappedCoords - Mapped canvas coordinates  
 * @param {Object} tolerance - Acceptable tolerance {x: px, y: px}
 * @param {Object} mapping - Mapping parameters for validation
 * @returns {boolean} True if mapping is within tolerance
 */
export function validateMappingAccuracy(originalCoords, mappedCoords, tolerance = {x: 1, y: 1}, mapping = null) {
    // Basic sanity checks
    const hasValidCoords = (
        typeof mappedCoords.x1 === 'number' && !isNaN(mappedCoords.x1) &&
        typeof mappedCoords.y1 === 'number' && !isNaN(mappedCoords.y1) &&
        typeof mappedCoords.x2 === 'number' && !isNaN(mappedCoords.x2) &&
        typeof mappedCoords.y2 === 'number' && !isNaN(mappedCoords.y2) &&
        mappedCoords.x2 > mappedCoords.x1 &&
        mappedCoords.y2 > mappedCoords.y1
    );
    
    if (!hasValidCoords) {
        console.warn('Invalid mapped coordinates:', mappedCoords);
        return false;
    }
    
    // If mapping parameters are provided, validate precision
    if (mapping && originalCoords) {
        // Check center point accuracy (most critical for detection overlay)
        const originalCenterX = (originalCoords.x1 + originalCoords.x2) / 2;
        const originalCenterY = (originalCoords.y1 + originalCoords.y2) / 2;
        const mappedCenterX = (mappedCoords.x1 + mappedCoords.x2) / 2;
        const mappedCenterY = (mappedCoords.y1 + mappedCoords.y2) / 2;
        
        // Convert original to expected mapped center for comparison
        const expectedCenterX = (mapping.offsetX + originalCenterX * mapping.displayWidth) * (mapping.dpr || 1);
        const expectedCenterY = (mapping.offsetY + originalCenterY * mapping.displayHeight) * (mapping.dpr || 1);
        
        const centerErrorX = Math.abs(mappedCenterX - expectedCenterX);
        const centerErrorY = Math.abs(mappedCenterY - expectedCenterY);
        
        if (centerErrorX > tolerance.x || centerErrorY > tolerance.y) {
            console.warn(`Mapping accuracy failed: center error (${centerErrorX.toFixed(2)}, ${centerErrorY.toFixed(2)}) > tolerance (${tolerance.x}, ${tolerance.y})`);
            return false;
        }
    }
    
    return true;
}

/**
 * Debug utility to visualize coordinate mapping with DPR awareness
 * @param {HTMLCanvasElement} debugCanvas - Canvas for debug visualization
 * @param {Object} detection - Detection with original coordinates
 * @param {Object} mappedCoords - Mapped coordinates {x1, y1, x2, y2}
 * @param {string} color - Debug color (default: red)
 * @param {Object} options - Debug options {showGrid, showCenter, dpr}
 */
export function debugDrawMapping(debugCanvas, detection, mappedCoords, color = 'red', options = {}) {
    if (!debugCanvas || !debugCanvas.getContext) return;
    
    const ctx = debugCanvas.getContext('2d');
    const dpr = options.dpr || window.devicePixelRatio || 1;
    
    // Save context state
    ctx.save();
    
    // Apply DPR scaling to context for crisp rendering
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.scale(1/dpr, 1/dpr); // Scale down for display
    
    // Draw mapped bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([5 * dpr, 5 * dpr]);
    
    const width = mappedCoords.x2 - mappedCoords.x1;
    const height = mappedCoords.y2 - mappedCoords.y1;
    ctx.strokeRect(mappedCoords.x1, mappedCoords.y1, width, height);
    
    // Draw center point if requested
    if (options.showCenter) {
        const centerX = (mappedCoords.x1 + mappedCoords.x2) / 2;
        const centerY = (mappedCoords.y1 + mappedCoords.y2) / 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3 * dpr, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // Draw confidence and class label
    ctx.fillStyle = color;
    ctx.font = `${12 * dpr}px ui-sans-serif`;
    ctx.fillText(
        `${detection.class || 'unknown'}: ${(detection.confidence || 0).toFixed(2)}`,
        mappedCoords.x1,
        mappedCoords.y1 - 5 * dpr
    );
    
    // Draw coordinate debug info
    if (options.showCoords) {
        ctx.fillText(
            `(${mappedCoords.x1},${mappedCoords.y1})→(${mappedCoords.x2},${mappedCoords.y2})`,
            mappedCoords.x1,
            mappedCoords.y2 + 15 * dpr
        );
    }
    
    // Restore context state
    ctx.restore();
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
        dpr,
        videoW,
        videoH,
        viewportW,
        viewportH
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

export function modelToCanvasBox(modelBox, mapping, inputSize = 640) {
    // Convert model-space box (x1,y1,x2,y2 in inputSize x inputSize) to canvas-space box
    const [x1, y1, x2, y2] = modelBox;
    
    // Normalize from model input size to [0,1]
    const normalizedX1 = Math.max(0, Math.min(1, x1 / inputSize));
    const normalizedY1 = Math.max(0, Math.min(1, y1 / inputSize));
    const normalizedX2 = Math.max(0, Math.min(1, x2 / inputSize));
    const normalizedY2 = Math.max(0, Math.min(1, y2 / inputSize));
    
    // Apply mapping to canvas space with DPR scaling
    const dpr = mapping.dpr || window.devicePixelRatio || 1;
    const canvasX1 = Math.round((mapping.offsetX + (normalizedX1 * mapping.displayWidth)) * dpr);
    const canvasY1 = Math.round((mapping.offsetY + (normalizedY1 * mapping.displayHeight)) * dpr);
    const canvasX2 = Math.round((mapping.offsetX + (normalizedX2 * mapping.displayWidth)) * dpr);
    const canvasY2 = Math.round((mapping.offsetY + (normalizedY2 * mapping.displayHeight)) * dpr);
    
    return [canvasX1, canvasY1, canvasX2, canvasY2];
}