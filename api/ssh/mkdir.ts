import { createRemoteDirectory } from "../../src/server/core.js";
import type { SSHCredentials } from "../../src/types.js";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils.js";

interface MkdirRequestBody {
  credentials: SSHCredentials;
  path: string;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<MkdirRequestBody>(request);
      return jsonResponse(await createRemoteDirectory(body.credentials, body.path));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
