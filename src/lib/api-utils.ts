import { NextResponse } from "next/server";

/**
 * Safely handle API errors - always returns valid JSON
 */
export function apiError(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Wrapper for API route handlers that ensures JSON error responses
 */
export function withApiHandler(handler: () => Promise<NextResponse>) {
  return handler().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[API Error]", message);
    return apiError(message);
  });
}
