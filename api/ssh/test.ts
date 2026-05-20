import { testConnection } from "../../src/server/core.js";
import type { SSHCredentials } from "../../src/types.js";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const credentials = await parseJsonRequest<SSHCredentials>(request);
      return jsonResponse(await testConnection(credentials));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 400);
    }
  },
};
