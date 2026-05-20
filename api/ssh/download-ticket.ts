import { createDownloadToken } from "../../src/server/core";
import type { SSHCredentials } from "../../src/types";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils";

interface DownloadTicketRequestBody {
  credentials: SSHCredentials;
  path: string;
  isDirectory: boolean;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<DownloadTicketRequestBody>(request);
      if (!body.credentials || !body.path) {
        return jsonResponse({ success: false, error: "Credentials and target path are required." }, 400);
      }
      return jsonResponse(createDownloadToken(body.credentials, body.path, !!body.isDirectory));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
