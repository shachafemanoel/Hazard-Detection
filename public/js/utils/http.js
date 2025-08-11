export function ensureOk(res) { 
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`); 
  return res; 
}

export async function getJsonOrThrow(res) {
  const text = await res.text();
  try { 
    return JSON.parse(text); 
  } catch { 
    throw new Error(`Bad JSON (${res.status}) ${text.substring(0, 100)}...`); 
  }
}