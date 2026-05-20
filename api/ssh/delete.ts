import { deleteRemotePath } from "../../src/server/core.js";
import type { SSHCredentials } from "../../src/types.js";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils.js";

interface DeleteRequestBody {
  credentials: SSHCredentials;
  path: string;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<DeleteRequestBody>(request);
      return jsonResponse(await deleteRemotePath(body.credentials, body.path));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
