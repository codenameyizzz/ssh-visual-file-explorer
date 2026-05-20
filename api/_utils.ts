export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function methodNotAllowed(allowed: string[]) {
  return jsonResponse(
    {
      success: false,
      error: `Method not allowed. Use ${allowed.join(", ")}.`,
    },
    405,
  );
}

export async function parseJsonRequest<T>(request: Request) {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected server error.";
}
