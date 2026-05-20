import { MAX_UPLOAD_SIZE_BYTES, uploadRemoteFile } from "../../src/server/core.js";
import type { SSHCredentials } from "../../src/types.js";
import { getErrorMessage, jsonResponse, methodNotAllowed, parseJsonRequest } from "../_utils.js";

interface UploadRequestBody {
  credentials: SSHCredentials;
  path: string;
  fileName: string;
  contentBase64: string;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const body = await parseJsonRequest<UploadRequestBody>(request);
      if (!body.credentials || !body.path || !body.fileName || !body.contentBase64) {
        return jsonResponse({ success: false, error: "Credentials, path, file name, and file content are required." }, 400);
      }

      const fileBuffer = Buffer.from(body.contentBase64, "base64");
      if (!fileBuffer.length) {
        return jsonResponse({ success: false, error: "Uploaded file is empty." }, 400);
      }

      if (fileBuffer.length > MAX_UPLOAD_SIZE_BYTES) {
        return jsonResponse(
          {
            success: false,
            error: `File is too large. Maximum supported upload size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`,
          },
          413,
        );
      }

      return jsonResponse(await uploadRemoteFile(body.credentials, body.path, fileBuffer));
    } catch (error) {
      return jsonResponse({ success: false, error: getErrorMessage(error) }, 500);
    }
  },
};
