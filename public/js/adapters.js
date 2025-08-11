/**
 * @file adapters.js
 * @description This file contains mandatory data transformation functions to ensure
 * the client-side application works with a unified data contract, regardless of
 * the specific format returned by local or remote APIs.
 */

/**
 * Normalizes a response from a detection API (local or remote) into the
 * stable, canonical `InferenceResponse` shape.
 *
 * @param {any} json - The raw JSON response from a detection endpoint.
 * @returns {import('../../../Prompt.md').InferenceResponse} A normalized detection response object.
 */
const CLASS_ID_NAME_MAP = {
  0: 'crack',
  1: 'pothole'
};

function parseProcessingTime(v) {
  if (v == null) return undefined;
  let n;
  if (typeof v === 'string') {
    if (v.endsWith('ms')) {
      n = parseFloat(v);
    } else if (v.endsWith('s')) {
      n = parseFloat(v) * 1000;
    } else {
      n = parseFloat(v);
    }
  } else if (typeof v === 'number') {
    n = v;
    // Assume seconds if value is very small, otherwise ms
    if (n < 1000) n = n * 1000;
  }
  return isFinite(n) ? n : undefined;
}

export function normalizeDetectResponse(json) {
  if (!json) {
    json = {};
  }
  const detectionsRaw = Array.isArray(json?.detections) ? json.detections : (Array.isArray(json?.results) ? json.results : []);
  const detections = detectionsRaw.map(d => {
    if (Array.isArray(d)) { // Handle tuple format [x1, y1, x2, y2, score, class_id, class_name?]
        const classId = d[5];
        const hasClassName = d.length > 6 && typeof d[6] === 'string';
        return {
            box: [d[0], d[1], d[2], d[3]],
            label: hasClassName ? d[6] : (CLASS_ID_NAME_MAP[classId] || String(classId ?? '')),
            score: Number(d[4] ?? 0)
        }
    }
    // Handle object format
    const classId = d.class_id;
    return {
        box: Array.isArray(d.box) ? d.box : d.bbox ?? d.rect ?? d.xyxy,
        label: d.label ?? d.class_name ?? (CLASS_ID_NAME_MAP[classId] || String(classId ?? '')),
        score: Number(d.score ?? d.confidence ?? d.prob ?? 0)
    }
  }).filter(x => Array.isArray(x.box) && x.box.length === 4);

  const size = json?.original_image_size ?? json?.image_size ?? {};
  const processingTime = parseProcessingTime(json?.processing_time);

  return {
    detections,
    original_image_size: { width: Number(size.width) || 0, height: Number(size.height) || 0 },
    detections_count: Number(json?.detections_count ?? detections.length) || 0,
    processing_time: processingTime,
    has_new_reports: Boolean(json?.has_new_reports),
    has_session_stats: Boolean(json?.has_session_stats)
  };
}

/**
 * Normalizes a response from a reports list API into a stable array of
 * `ReportItem` objects. It handles both direct arrays and object-wrapped arrays.
 *
 * @param {any} data - The raw data from a reports list endpoint.
 * @returns {import('../../../Prompt.md').ReportItem[]} A normalized array of report items.
 */
export function normalizeReportsResponse(data) {
  if (!data) {
    return [];
  }
  const items = Array.isArray(data) ? data : (Array.isArray(data?.reports) ? data.reports : []);
  return items.map(it => ({
    id: String(it.id ?? it._id ?? ''),
    image_url: it.image_url ?? it.imageUrl ?? it.image ?? '',
    class_name: it.class_name ?? it.className ?? it.type ?? '',
    timestamp: it.timestamp ?? it.created_at ?? it.time ?? '',
    latitude: (it.latitude != null) ? Number(it.latitude) : undefined,
    longitude: (it.longitude != null) ? Number(it.longitude) : undefined
  }));
}
