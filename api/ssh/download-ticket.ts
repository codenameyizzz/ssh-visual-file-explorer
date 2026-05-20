import { createBatchDownloadToken, createDownloadToken } from "../../src/server/core.js";
import type { SSHCredentials } from "../../src/types.js";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils.js";

interface DownloadTicketRequestBody {
  credentials: SSHCredentials;
  path?: string;
  isDirectory?: boolean;
  items?: Array<{
    path: string;
    name: string;
  }>;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<DownloadTicketRequestBody>(request);
      if (!body.credentials) {
        return jsonResponse({ success: false, error: "Credentials are required." }, 400);
      }

      if (body.items?.length) {
        return jsonResponse(createBatchDownloadToken(body.credentials, body.items));
      }

      if (!body.path) {
        return jsonResponse({ success: false, error: "Target path is required." }, 400);
      }

      return jsonResponse(createDownloadToken(body.credentials, body.path, !!body.isDirectory));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
