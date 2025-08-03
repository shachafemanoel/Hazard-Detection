// hazardClasses.js - Standardized Hazard Detection Classes
// Following Node.js Integration Guide patterns for consistent naming

/**
 * Road Damage Detection Classes (10 classes)
 * Standardized across all modules for consistency
 */
export const HAZARD_CLASS_NAMES = [
  'Alligator Crack', // 0: Interconnected cracking resembling alligator skin
  'Block Crack', // 1: Rectangular crack patterns in pavement
  'Crosswalk Blur', // 2: Faded or unclear crosswalk markings
  'Lane Blur', // 3: Faded or unclear lane markings
  'Longitudinal Crack', // 4: Cracks parallel to traffic direction
  'Manhole', // 5: Manhole covers and surrounding issues
  'Patch Repair', // 6: Previous repair work areas
  'Pothole', // 7: Circular/oval holes in road surface
  'Transverse Crack', // 8: Cracks perpendicular to traffic direction
  'Wheel Mark Crack', // 9: Cracks caused by wheel loading
];

/**
 * Legacy class names for backward compatibility
 */
export const LEGACY_CLASS_NAMES = [
  'crack',
  'knocked',
  'pothole',
  'surface_damage',
];

/**
 * Hazard-specific colors for visualization
 */
export const HAZARD_COLORS = {
  'Alligator Crack': '#FF4444', // Red - Critical structural damage
  'Block Crack': '#FF6600', // Red-Orange - Significant cracking
  'Crosswalk Blur': '#4444FF', // Blue - Safety marking issues
  'Lane Blur': '#6644FF', // Purple - Traffic marking issues
  'Longitudinal Crack': '#FF8844', // Orange - Directional cracking
  Manhole: '#888888', // Gray - Infrastructure elements
  'Patch Repair': '#44FF88', // Green - Previous repairs
  Pothole: '#FF0088', // Pink - Critical surface damage
  'Transverse Crack': '#FFAA44', // Light Orange - Cross cracking
  'Wheel Mark Crack': '#AA4444', // Dark Red - Load-induced damage
};

/**
 * Class-specific confidence thresholds for real-time detection
 */
export const CLASS_THRESHOLDS = {
  0: 0.35, // Alligator Crack - real-time adjusted
  1: 0.4, // Block Crack - standard
  2: 0.45, // Crosswalk Blur - higher (avoid false marking detections)
  3: 0.45, // Lane Blur - higher (avoid false marking detections)
  4: 0.35, // Longitudinal Crack - real-time adjusted
  5: 0.5, // Manhole - higher (avoid false infrastructure detections)
  6: 0.4, // Patch Repair - standard
  7: 0.35, // Pothole - clear damage, allow lower threshold
  8: 0.35, // Transverse Crack - real-time adjusted
  9: 0.4, // Wheel Mark Crack - standard
};

/**
 * Get class name by index
 * @param {number} classIndex - Class index (0-9)
 * @returns {string} - Class name or Unknown Class
 */
export function getClassName(classIndex) {
  if (classIndex >= 0 && classIndex < HAZARD_CLASS_NAMES.length) {
    return HAZARD_CLASS_NAMES[classIndex];
  }
  return `Unknown Class ${classIndex}`;
}

/**
 * Get class index by name
 * @param {string} className - Class name
 * @returns {number} - Class index or -1 if not found
 */
export function getClassIndex(className) {
  return HAZARD_CLASS_NAMES.indexOf(className);
}

/**
 * Get color for class
 * @param {string} className - Class name
 * @returns {string} - Hex color code
 */
export function getClassColor(className) {
  return HAZARD_COLORS[className] || '#00FF00';
}

/**
 * Get confidence threshold for class
 * @param {number} classIndex - Class index
 * @returns {number} - Confidence threshold
 */
export function getClassThreshold(classIndex) {
  return CLASS_THRESHOLDS[classIndex] || 0.4;
}

/**
 * Map legacy class name to new class name
 * @param {string} legacyName - Legacy class name
 * @returns {string} - New class name
 */
export function mapLegacyClassName(legacyName) {
  const legacyMap = {
    crack: 'Alligator Crack',
    knocked: 'Block Crack',
    pothole: 'Pothole',
    surface_damage: 'Patch Repair',
  };

  return legacyMap[legacyName] || legacyName;
}

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.HAZARD_CLASS_NAMES = HAZARD_CLASS_NAMES;
  window.HAZARD_COLORS = HAZARD_COLORS;
  window.CLASS_THRESHOLDS = CLASS_THRESHOLDS;
  window.getClassName = getClassName;
  window.getClassIndex = getClassIndex;
  window.getClassColor = getClassColor;
  window.getClassThreshold = getClassThreshold;
  window.mapLegacyClassName = mapLegacyClassName;
}
