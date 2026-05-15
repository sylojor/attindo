import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely fetch JSON from an API endpoint.
 * Returns parsed JSON or throws a descriptive error.
 */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let errorMsg = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error) errorMsg = errBody.error;
    } catch {
      // ignore JSON parse error on error response
    }
    throw new Error(errorMsg);
  }
  const text = await res.text();
  if (!text) {
    throw new Error("Empty response from server");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON response from server");
  }
}
