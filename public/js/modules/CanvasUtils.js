/**
 * Canvas utility functions for image processing and drawing
 */
export class CanvasUtils {
  /**
   * Computes letterbox parameters for maintaining aspect ratio
   * @param {number} origWidth - Original width
   * @param {number} origHeight - Original height
   * @param {number} targetSize - Target size (default: 640)
   * @returns {Object} Letterbox parameters
   */
  static computeLetterboxParams(origWidth, origHeight, targetSize = 640) {
    const scale = Math.min(targetSize / origWidth, targetSize / origHeight);
    const newW = Math.round(origWidth * scale);
    const newH = Math.round(origHeight * scale);
    const offsetX = Math.floor((targetSize - newW) / 2);
    const offsetY = Math.floor((targetSize - newH) / 2);

    return { scale, newW, newH, offsetX, offsetY };
  }

  /**
   * Preprocesses image to tensor format for model input
   * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image - Image element
   * @param {number} targetSize - Target size (default: 640)
   * @returns {Object} Object containing tensor and letterbox parameters
   */
  static preprocessImageToTensor(image, targetSize = 640) {
    const offscreen = document.createElement("canvas");
    offscreen.width = targetSize;
    offscreen.height = targetSize;
    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

    const imgWidth = image.naturalWidth || image.videoWidth || image.width;
    const imgHeight = image.naturalHeight || image.videoHeight || image.height;
    const letterboxParams = this.computeLetterboxParams(
      imgWidth,
      imgHeight,
      targetSize,
    );
    const { offsetX, offsetY, newW, newH } = letterboxParams;

    offCtx.fillStyle = "black";
    offCtx.fillRect(0, 0, targetSize, targetSize);
    offCtx.drawImage(image, offsetX, offsetY, newW, newH);

    const imageData = offCtx.getImageData(0, 0, targetSize, targetSize);
    const { data, width, height } = imageData;

    const tensorData = new Float32Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      tensorData[j] = data[i] / 255;
      tensorData[j + 1] = data[i + 1] / 255;
      tensorData[j + 2] = data[i + 2] / 255;
    }

    const chwData = new Float32Array(3 * width * height);
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          chwData[c * width * height + h * width + w] =
            tensorData[h * width * 3 + w * 3 + c];
        }
      }
    }

    const dims = [1, 3, height, width];
    const tensor = new ort.Tensor("float32", chwData, dims);

    return { tensor, letterboxParams };
  }

  /**
   * Draws detection results on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Array} boxes - Array of detection boxes
   * @param {Array} classNames - Array of class names
   * @param {Object} letterboxParams - Letterbox parameters
   * @param {number} confidenceThreshold - Confidence threshold
   * @returns {Array} Array of detected hazard types
   */
  static drawDetections(
    ctx,
    boxes,
    classNames,
    letterboxParams,
    confidenceThreshold = 0.5,
  ) {
    const hazardTypes = [];

    boxes.forEach((box) => {
      let [x1, y1, x2, y2, score, classId] = box;
      if (score < confidenceThreshold) return;

      const boxW = x2 - x1;
      const boxH = y2 - y1;

      if (boxW <= 1 || boxH <= 1) return;

      const labelName = classNames[Math.floor(classId)] || `Class ${classId}`;
      const scorePerc = (score * 100).toFixed(1);

      if (!hazardTypes.includes(labelName)) {
        hazardTypes.push(labelName);
      }

      const color = "#00FF00";
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, boxW, boxH);

      ctx.fillStyle = color;
      ctx.font = "bold 16px Arial";
      const textWidth = ctx.measureText(`${labelName} (${scorePerc}%)`).width;
      const textBgX = x1;
      const textBgY = y1 > 20 ? y1 - 20 : y1;
      const textBgWidth = textWidth + 8;
      const textBgHeight = 20;
      ctx.fillRect(textBgX, textBgY, textBgWidth, textBgHeight);
      ctx.fillStyle = "black";
      ctx.fillText(`${labelName} (${scorePerc}%)`, textBgX + 4, textBgY + 15);
    });

    return hazardTypes;
  }

  /**
   * Clears canvas content
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  static clearCanvas(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /**
   * Converts image data to CHW format for model input
   * @param {ImageData} imageData - Image data
   * @returns {Float32Array} CHW formatted data
   */
  static convertToCHW(imageData) {
    const { data, width, height } = imageData;
    const inv255 = 1.0 / 255.0;
    const chwData = new Float32Array(3 * width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const outputIndex = y * width + x;

        chwData[outputIndex] = data[pixelIndex] * inv255; // R
        chwData[width * height + outputIndex] = data[pixelIndex + 1] * inv255; // G
        chwData[2 * width * height + outputIndex] =
          data[pixelIndex + 2] * inv255; // B
      }
    }

    return chwData;
  }

  /**
   * Creates a canvas element with specified dimensions
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @returns {HTMLCanvasElement} Created canvas element
   */
  static createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Calculates image difference for motion detection
   * @param {ImageData} curr - Current image data
   * @param {ImageData} prev - Previous image data
   * @param {number} step - Sampling step (default: 16)
   * @returns {number} Difference sum
   */
  static calculateImageDifference(curr, prev, step = 16) {
    let sum = 0;
    const d1 = curr.data,
      d2 = prev.data;

    for (let i = 0; i < d1.length; i += step) {
      sum +=
        Math.abs(d1[i] - d2[i]) +
        Math.abs(d1[i + 1] - d2[i + 1]) +
        Math.abs(d1[i + 2] - d2[i + 2]);
    }

    return sum;
  }
}
