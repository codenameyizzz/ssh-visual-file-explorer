import { writeRemoteFile } from "../../src/server/core.js";
import type { SSHCredentials } from "../../src/types.js";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils.js";

interface WriteRequestBody {
  credentials: SSHCredentials;
  path: string;
  content: string;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<WriteRequestBody>(request);
      return jsonResponse(await writeRemoteFile(body.credentials, body.path, body.content));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
