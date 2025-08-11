<<<<<<< ours
/**
 * EXIF Parsing Web Worker
 * Handles EXIF data extraction in background thread for better performance
 * Supports GPS coordinates, timestamps, and device information
 */

// Import EXIF library dynamically
importScripts('https://cdn.jsdelivr.net/npm/exif-js@2.3.0/exif.js');

// Worker state
let workerState = {
  processed: 0,
  errors: 0,
  cacheSize: 0
};

// LRU cache for processed files to avoid re-processing identical images
const processedFilesCache = new Map();
const MAX_CACHE_SIZE = 100;

/**
 * Convert GPS coordinates from EXIF format to decimal degrees
 * @param {Array} gpsArray - GPS coordinates array [degrees, minutes, seconds]
 * @param {string} ref - GPS reference ('N', 'S', 'E', 'W')
 * @returns {number} Decimal degrees
 */
function convertGPSToDecimal(gpsArray, ref) {
  if (!gpsArray || !Array.isArray(gpsArray) || gpsArray.length !== 3) {
    return null;
  }
  
  const degrees = gpsArray[0] || 0;
  const minutes = gpsArray[1] || 0; 
  const seconds = gpsArray[2] || 0;
  
  let decimal = degrees + (minutes / 60) + (seconds / 3600);
  
  // Apply hemisphere correction
  if (ref === 'S' || ref === 'W') {
    decimal = -decimal;
  }
  
  return decimal;
}

/**
 * Extract comprehensive EXIF data from image file
 * @param {File} file - Image file to process
 * @returns {Promise<Object>} EXIF data object
 */
function extractExifData(file) {
  return new Promise((resolve) => {
    // Check cache first
    const cacheKey = `${file.name}_${file.size}_${file.lastModified}`;
    if (processedFilesCache.has(cacheKey)) {
      resolve(processedFilesCache.get(cacheKey));
      return;
    }
    
    // Use EXIF.js to extract data
    EXIF.getData(file, function() {
      try {
        // GPS coordinates
        const lat = EXIF.getTag(this, 'GPSLatitude');
        const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
        const lon = EXIF.getTag(this, 'GPSLongitude');
        const lonRef = EXIF.getTag(this, 'GPSLongitudeRef');
        const altitude = EXIF.getTag(this, 'GPSAltitude');
        const altitudeRef = EXIF.getTag(this, 'GPSAltitudeRef');
        
        // Timestamps
        const dateTime = EXIF.getTag(this, 'DateTime');
        const dateTimeOriginal = EXIF.getTag(this, 'DateTimeOriginal');
        const dateTimeDigitized = EXIF.getTag(this, 'DateTimeDigitized');
        const gpsTimeStamp = EXIF.getTag(this, 'GPSTimeStamp');
        const gpsDateStamp = EXIF.getTag(this, 'GPSDateStamp');
        
        // Camera and device information
        const make = EXIF.getTag(this, 'Make');
        const model = EXIF.getTag(this, 'Model');
        const software = EXIF.getTag(this, 'Software');
        const orientation = EXIF.getTag(this, 'Orientation');
        
        // Image technical details
        const imageWidth = EXIF.getTag(this, 'PixelXDimension') || EXIF.getTag(this, 'ImageWidth');
        const imageHeight = EXIF.getTag(this, 'PixelYDimension') || EXIF.getTag(this, 'ImageHeight');
        const colorSpace = EXIF.getTag(this, 'ColorSpace');
        const whiteBalance = EXIF.getTag(this, 'WhiteBalance');
        
        // Exposure settings
        const exposureTime = EXIF.getTag(this, 'ExposureTime');
        const fNumber = EXIF.getTag(this, 'FNumber');
        const iso = EXIF.getTag(this, 'ISOSpeedRatings');
        const flash = EXIF.getTag(this, 'Flash');
        const focalLength = EXIF.getTag(this, 'FocalLength');\n        \n        // Process GPS coordinates\n        let location = null;\n        if (lat && lon && latRef && lonRef) {\n          const latitude = convertGPSToDecimal(lat, latRef);\n          const longitude = convertGPSToDecimal(lon, lonRef);\n          \n          if (latitude !== null && longitude !== null) {\n            location = {\n              latitude,\n              longitude,\n              altitude: altitude ? (altitudeRef === 1 ? -altitude : altitude) : null,\n              accuracy: 'EXIF' // Indicate GPS source\n            };\n          }\n        }\n        \n        // Process timestamps\n        let timestamp = null;\n        if (dateTimeOriginal) {\n          timestamp = parseExifDateTime(dateTimeOriginal);\n        } else if (dateTime) {\n          timestamp = parseExifDateTime(dateTime);\n        } else if (dateTimeDigitized) {\n          timestamp = parseExifDateTime(dateTimeDigitized);\n        }\n        \n        // Create comprehensive EXIF object\n        const exifData = {\n          hasGPS: !!location,\n          location: location,\n          timestamp: timestamp,\n          camera: {\n            make: make,\n            model: model,\n            software: software\n          },\n          image: {\n            width: imageWidth,\n            height: imageHeight,\n            orientation: orientation,\n            colorSpace: colorSpace,\n            whiteBalance: whiteBalance\n          },\n          exposure: {\n            exposureTime: exposureTime,\n            fNumber: fNumber,\n            iso: iso,\n            flash: flash,\n            focalLength: focalLength\n          },\n          processingInfo: {\n            processedAt: new Date().toISOString(),\n            fileSize: file.size,\n            fileName: file.name,\n            fileType: file.type\n          }\n        };\n        \n        // Cache the result\n        if (processedFilesCache.size >= MAX_CACHE_SIZE) {\n          // Remove oldest entry\n          const firstKey = processedFilesCache.keys().next().value;\n          processedFilesCache.delete(firstKey);\n        }\n        processedFilesCache.set(cacheKey, exifData);\n        workerState.cacheSize = processedFilesCache.size;\n        \n        workerState.processed++;\n        resolve(exifData);\n        \n      } catch (error) {\n        console.error('EXIF extraction error:', error);\n        workerState.errors++;\n        resolve({\n          hasGPS: false,\n          location: null,\n          timestamp: null,\n          camera: {},\n          image: {},\n          exposure: {},\n          processingInfo: {\n            error: error.message,\n            processedAt: new Date().toISOString(),\n            fileSize: file.size,\n            fileName: file.name,\n            fileType: file.type\n          }\n        });\n      }\n    });\n  });\n}\n\n/**\n * Parse EXIF DateTime string to ISO format\n * @param {string} exifDateTime - EXIF format: \"YYYY:MM:DD HH:mm:ss\"\n * @returns {string|null} ISO format timestamp\n */\nfunction parseExifDateTime(exifDateTime) {\n  if (!exifDateTime || typeof exifDateTime !== 'string') {\n    return null;\n  }\n  \n  try {\n    // Convert EXIF format (YYYY:MM:DD HH:mm:ss) to ISO format\n    const [datePart, timePart] = exifDateTime.split(' ');\n    const [year, month, day] = datePart.split(':');\n    const [hour, minute, second] = timePart ? timePart.split(':') : ['00', '00', '00'];\n    \n    const date = new Date(year, month - 1, day, hour, minute, second);\n    \n    if (isNaN(date.getTime())) {\n      return null;\n    }\n    \n    return date.toISOString();\n  } catch (error) {\n    console.error('Date parsing error:', error);\n    return null;\n  }\n}\n\n/**\n * Create geo-tagged report from EXIF data\n * @param {Object} exifData - Extracted EXIF data\n * @param {File} file - Original image file\n * @returns {Object} Report data ready for upload\n */\nfunction createGeoTaggedReport(exifData, file) {\n  if (!exifData.hasGPS || !exifData.location) {\n    return null;\n  }\n  \n  return {\n    type: 'geo_tagged_upload',\n    imageBlob: file,\n    detections: [], // Will be populated after inference\n    timestamp: exifData.timestamp || new Date().toISOString(),\n    location: {\n      latitude: exifData.location.latitude,\n      longitude: exifData.location.longitude,\n      altitude: exifData.location.altitude,\n      accuracy: exifData.location.accuracy,\n      source: 'EXIF'\n    },\n    metadata: {\n      source: 'exif_auto_report',\n      camera: exifData.camera,\n      image: exifData.image,\n      exposure: exifData.exposure,\n      processingInfo: exifData.processingInfo\n    },\n    confidenceThreshold: 0.0 // Will accept any detection for EXIF reports\n  };\n}\n\n// Message handler\nself.onmessage = async function(e) {\n  const { type, payload, id } = e.data;\n  \n  try {\n    switch (type) {\n      case 'extract_exif':\n        {\n          const { file } = payload;\n          const exifData = await extractExifData(file);\n          \n          let geoReport = null;\n          if (exifData.hasGPS) {\n            geoReport = createGeoTaggedReport(exifData, file);\n          }\n          \n          self.postMessage({\n            type: 'exif_extracted',\n            id: id,\n            payload: {\n              exifData: exifData,\n              geoReport: geoReport,\n              stats: workerState\n            }\n          });\n        }\n        break;\n        \n      case 'get_stats':\n        self.postMessage({\n          type: 'stats_response',\n          id: id,\n          payload: {\n            stats: workerState,\n            cacheSize: processedFilesCache.size\n          }\n        });\n        break;\n        \n      case 'clear_cache':\n        processedFilesCache.clear();\n        workerState.cacheSize = 0;\n        self.postMessage({\n          type: 'cache_cleared',\n          id: id,\n          payload: {\n            stats: workerState\n          }\n        });\n        break;\n        \n      default:\n        throw new Error(`Unknown message type: ${type}`);\n    }\n    \n  } catch (error) {\n    self.postMessage({\n      type: 'error',\n      id: id,\n      payload: {\n        error: error.message,\n        stack: error.stack\n      }\n    });\n  }\n};\n\n// Initialize worker\nself.postMessage({\n  type: 'worker_ready',\n  payload: {\n    version: '1.0.0',\n    capabilities: ['exif_extraction', 'gps_parsing', 'auto_reporting'],\n    stats: workerState\n  }\n});\n\nconsole.log('📷 EXIF Worker initialized and ready for processing');
=======
importScripts('https://cdnjs.cloudflare.com/ajax/libs/exif-js/2.3.0/exif.min.js');

self.onmessage = function (e) {
  try {
    const arrayBuffer = e.data;
    const dataView = new DataView(arrayBuffer);
    const tags = EXIF.readFromBinaryFile(dataView);

    const lat = EXIF.getTag(tags, 'GPSLatitude');
    const lon = EXIF.getTag(tags, 'GPSLongitude');
    const latRef = EXIF.getTag(tags, 'GPSLatitudeRef');
    const lonRef = EXIF.getTag(tags, 'GPSLongitudeRef');
    const altitude = EXIF.getTag(tags, 'GPSAltitude');
    const altitudeRef = EXIF.getTag(tags, 'GPSAltitudeRef');

    const dateTime = EXIF.getTag(tags, 'DateTime');
    const dateTimeOriginal = EXIF.getTag(tags, 'DateTimeOriginal');
    const dateTimeDigitized = EXIF.getTag(tags, 'DateTimeDigitized');
    const gpsTimeStamp = EXIF.getTag(tags, 'GPSTimeStamp');
    const gpsDateStamp = EXIF.getTag(tags, 'GPSDateStamp');
    const make = EXIF.getTag(tags, 'Make');
    const model = EXIF.getTag(tags, 'Model');
    const software = EXIF.getTag(tags, 'Software');
    const orientation = EXIF.getTag(tags, 'Orientation');
    const imageWidth = EXIF.getTag(tags, 'PixelXDimension') || EXIF.getTag(tags, 'ImageWidth');
    const imageHeight = EXIF.getTag(tags, 'PixelYDimension') || EXIF.getTag(tags, 'ImageHeight');
    const colorSpace = EXIF.getTag(tags, 'ColorSpace');
    const whiteBalance = EXIF.getTag(tags, 'WhiteBalance');
    const exposureTime = EXIF.getTag(tags, 'ExposureTime');
    const fNumber = EXIF.getTag(tags, 'FNumber');
    const iso = EXIF.getTag(tags, 'ISOSpeedRatings');
    const flash = EXIF.getTag(tags, 'Flash');
    const focalLength = EXIF.getTag(tags, 'FocalLength');

    let location = null;
    if (lat && lon && latRef && lonRef) {
      const toDecimal = (dms, ref) => {
        const [deg, min, sec] = dms;
        let decimal = deg + min / 60 + sec / 3600;
        if (ref === 'S' || ref === 'W') decimal *= -1;
        return decimal;
      };
      location = {
        latitude: toDecimal(lat, latRef),
        longitude: toDecimal(lon, lonRef)
      };
    }

    self.postMessage({
      success: true,
      data: {
        location,
        altitude,
        altitudeRef,
        dateTime,
        dateTimeOriginal,
        dateTimeDigitized,
        gpsTimeStamp,
        gpsDateStamp,
        make,
        model,
        software,
        orientation,
        imageWidth,
        imageHeight,
        colorSpace,
        whiteBalance,
        exposureTime,
        fNumber,
        iso,
        flash,
        focalLength
      }
    });
  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};
>>>>>>> theirs
