export const CLASS_ID_NAME_MAP = {
  0: 'pothole',
  1: 'crack',
  2: 'surface damage',
  3: 'knocked'
};

/**
 * Basic type guard checking if value looks like an API detection result
 * @param {unknown} x
 * @returns {boolean}
 */
export function isApiDetectionResult(x) {
  if (!x || typeof x !== 'object') return false;
  const obj = /** @type {Record<string,unknown>} */ (x);
  return Array.isArray(obj.detections) || Array.isArray(obj.results);
}

/**
 * @param {unknown} x
 * @returns {import('./result_normalizer.js').NormalizedResult}
 */
export function normalizeApiResult(x) {
  const base = {
    ok: false,
    session_id: null,
    processing_time_ms: null,
    detections: [],
    raw: x,
    error: null
  };

  try {
    if (!x || typeof x !== 'object') {
      return { ...base, error: { code: 'invalid_json', message: 'Result is not an object' } };
    }
    const obj = /** @type {any} */ (x);
    const list = Array.isArray(obj.detections)
      ? obj.detections
      : Array.isArray(obj.results)
      ? obj.results
      : [];

    const detections = [];
    list.forEach((det, idx) => {
      const norm = normalizeDetection(det, idx);
      if (norm) detections.push(norm);
    });

    const processingRaw = obj.processing_time_ms ?? obj.processing_time ?? obj.time ?? null;
    const processing_time_ms = parseProcessingTime(processingRaw);

    const ok = obj.success ?? obj.ok;

    const recognizedKeys = new Set(['detections','results','processing_time_ms','processing_time','time','success','ok','session_id','sessionId','error']);
    const meta = {};
    Object.keys(obj).forEach(k => {
      if (!recognizedKeys.has(k)) meta[k] = obj[k];
    });

    return {
      ok: ok === undefined ? true : Boolean(ok),
      session_id: obj.session_id ?? obj.sessionId ?? null,
      processing_time_ms,
      detections,
      meta: Object.keys(meta).length ? meta : undefined,
      raw: x,
      error: obj.error || null
    };
  } catch (err) {
    return { ...base, error: { code: 'normalization_error', message: String(err) } };
  }
}

function normalizeDetection(det, idx) {
  try {
    let box, confidence, classId = null, className = 'unknown';
    if (Array.isArray(det)) {
      if (det.length >= 6) {
        const [x1,y1,x2,y2,score,cid] = det;
        box = { x: Number(x1), y: Number(y1), w: Number(x2) - Number(x1), h: Number(y2) - Number(y1) };
        confidence = Number(score);
        classId = cid != null ? Number(cid) : null;
      } else if (det.length >= 5) {
        const [x,y,w,h,score] = det;
        box = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
        confidence = Number(score);
      }
    } else if (det && typeof det === 'object') {
      const d = /** @type {any} */ (det);
      if (Array.isArray(d.box) && d.box.length >= 4) {
        const [x1,y1,x2,y2] = d.box;
        box = { x: Number(x1), y: Number(y1), w: Number(x2) - Number(x1), h: Number(y2) - Number(y1) };
      } else if (Array.isArray(d.bbox) && d.bbox.length >=4) {
        const [x1,y1,x2,y2] = d.bbox;
        box = { x: Number(x1), y: Number(y1), w: Number(x2) - Number(x1), h: Number(y2) - Number(y1) };
      } else if ('x1' in d && 'y1' in d && 'x2' in d && 'y2' in d) {
        box = { x: Number(d.x1), y: Number(d.y1), w: Number(d.x2) - Number(d.x1), h: Number(d.y2) - Number(d.y1) };
      } else if ('x' in d && 'y' in d && 'w' in d && 'h' in d) {
        box = { x: Number(d.x), y: Number(d.y), w: Number(d.w), h: Number(d.h) };
      }
      confidence = Number(d.confidence ?? d.score ?? d[4]);
      classId = d.class_id ?? d.classId ?? d.class ?? null;
      className = d.class_name ?? d.className ?? CLASS_ID_NAME_MAP[classId] ?? 'unknown';
    }

    if (!box || !isFinite(box.x) || !isFinite(box.y) || !isFinite(box.w) || !isFinite(box.h) || box.w <= 0 || box.h <= 0) {
      return null;
    }
    if (!className || className === 'unknown') {
      if (classId != null && CLASS_ID_NAME_MAP[classId]) className = CLASS_ID_NAME_MAP[classId];
    }
    return {
      id: String(det.id ?? det.uuid ?? idx),
      class_id: classId !== undefined ? (classId===null?null:Number(classId)) : null,
      class_name: className || 'unknown',
      confidence: Number(confidence) || 0,
      box: { x: box.x, y: box.y, w: box.w, h: box.h }
    };
  } catch {
    return null;
  }
}

function parseProcessingTime(v) {
  if (v == null) return null;
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
    if (n < 50) n = n * 1000; // assume seconds if very small
  }
  return isFinite(n) ? n : null;
}

/**
 * Filter detections using global and per-class thresholds
 * @param {Array<import('./result_normalizer.js').NormalizedDetection>} detections
 * @param {number} globalThreshold
 * @param {Record<string,number>} classThresholds
 */
export function filterDetections(detections, globalThreshold=0.5, classThresholds={}) {
  return detections.filter(d => {
    const t = classThresholds[d.class_name] ?? globalThreshold;
    return d.confidence >= t;
  });
}

