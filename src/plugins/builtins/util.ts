import type { Detection, TechCategory } from "../../core/types.js";

/** Convenience factory for {@link Detection} objects. */
export function detect(
  name: string,
  category: TechCategory,
  confidence: number,
  detail?: string,
  evidence?: string,
): Detection {
  return { name, category, confidence, detail, evidence };
}

/** Filters to detections with confidence above a threshold. */
export function confident(detections: Detection[], min = 0.5): Detection[] {
  return detections.filter((det) => det.confidence >= min);
}

export function uniqByName(detections: Detection[]): Detection[] {
  const seen = new Map<string, Detection>();
  for (const det of detections) {
    const key = `${det.category}:${det.name}`;
    const existing = seen.get(key);
    if (!existing || det.confidence > existing.confidence) {
      seen.set(key, det);
    }
  }
  return [...seen.values()];
}