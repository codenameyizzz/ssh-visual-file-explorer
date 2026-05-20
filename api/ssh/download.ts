import { openDownloadStream, parseDownloadToken, toWebStream } from "../../src/server/core";
import { getErrorMessage, methodNotAllowed } from "../_utils";

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("No download token provided.", { status: 400 });
    }

    try {
      const payload = parseDownloadToken(token);
      const result = await openDownloadStream(payload.credentials, payload.targetPath, payload.isDirectory);
      const cleanup = () => result.cleanup();

      result.stream.on("close", cleanup);
      result.stream.on("end", cleanup);
      result.stream.on("error", cleanup);

      return new Response(toWebStream(result.stream), {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`,
          "Content-Type": result.contentType,
        },
      });
    } catch (error) {
      return new Response(`Failed to process download: ${getErrorMessage(error)}`, { status: 500 });
    }
  },
};
