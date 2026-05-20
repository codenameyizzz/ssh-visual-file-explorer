import { runRemoteCommand } from "../../src/server/core.js";
import type { SSHCredentials } from "../../src/types.js";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils.js";

interface ExecRequestBody {
  credentials: SSHCredentials;
  command: string;
  cwd?: string;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<ExecRequestBody>(request);
      return jsonResponse(await runRemoteCommand(body.credentials, body.command, body.cwd));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
