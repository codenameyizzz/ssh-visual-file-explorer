import { listDirectory } from "../../src/server/core";
import type { SSHCredentials } from "../../src/types";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils";

interface ListRequestBody {
  credentials: SSHCredentials;
  path?: string;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<ListRequestBody>(request);
      return jsonResponse(await listDirectory(body.credentials, body.path));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
