import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import {
  MAX_UPLOAD_SIZE_BYTES,
  createBatchDownloadToken,
  createDownloadToken,
  createRemoteDirectory,
  deleteRemotePath,
  listDirectory,
  openDownloadStream,
  parseDownloadToken,
  readRemoteFile,
  testConnection,
  uploadRemoteFile,
  writeRemoteFile,
} from "./src/server/core.js";
import type { SSHCredentials } from "./src/types.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";

app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true, limit: "6mb" }));

app.post("/api/ssh/test", async (req, res) => {
  try {
    const credentials = req.body as SSHCredentials;
    res.setHeader("Cache-Control", "no-store");
    res.json(await testConnection(credentials));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(400).json({ success: false, error: message });
  }
});

app.post("/api/ssh/list", async (req, res) => {
  try {
    const body = req.body as { credentials: SSHCredentials; path?: string };
    res.setHeader("Cache-Control", "no-store");
    res.json(await listDirectory(body.credentials, body.path));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).json({ success: false, error: message });
  }
});

app.post("/api/ssh/read", async (req, res) => {
  try {
    const body = req.body as { credentials: SSHCredentials; path: string };
    res.setHeader("Cache-Control", "no-store");
    res.json(await readRemoteFile(body.credentials, body.path));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).json({ success: false, error: message });
  }
});

app.post("/api/ssh/write", async (req, res) => {
  try {
    const body = req.body as { credentials: SSHCredentials; path: string; content: string };
    res.setHeader("Cache-Control", "no-store");
    res.json(await writeRemoteFile(body.credentials, body.path, body.content));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).json({ success: false, error: message });
  }
});

app.post("/api/ssh/upload", async (req, res) => {
  try {
    const body = req.body as {
      credentials: SSHCredentials;
      path: string;
      fileName: string;
      contentBase64: string;
    };

    if (!body.credentials || !body.path || !body.fileName || !body.contentBase64) {
      return res.status(400).json({ success: false, error: "Credentials, path, file name, and file content are required." });
    }

    const fileBuffer = Buffer.from(body.contentBase64, "base64");
    if (!fileBuffer.length) {
      return res.status(400).json({ success: false, error: "Uploaded file is empty." });
    }

    if (fileBuffer.length > MAX_UPLOAD_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        error: `File is too large. Maximum supported upload size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`,
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.json(await uploadRemoteFile(body.credentials, body.path, fileBuffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).json({ success: false, error: message });
  }
});

app.post("/api/ssh/mkdir", async (req, res) => {
  try {
    const body = req.body as { credentials: SSHCredentials; path: string };
    res.setHeader("Cache-Control", "no-store");
    res.json(await createRemoteDirectory(body.credentials, body.path));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).json({ success: false, error: message });
  }
});

app.post("/api/ssh/delete", async (req, res) => {
  try {
    const body = req.body as { credentials: SSHCredentials; path: string };
    res.setHeader("Cache-Control", "no-store");
    res.json(await deleteRemotePath(body.credentials, body.path));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).json({ success: false, error: message });
  }
});

app.post("/api/ssh/download-ticket", async (req, res) => {
  try {
    const body = req.body as {
      credentials: SSHCredentials;
      path?: string;
      isDirectory?: boolean;
      items?: Array<{ path: string; name: string }>;
    };
    if (!body.credentials) {
      return res.status(400).json({ success: false, error: "Credentials are required." });
    }

    if (body.items?.length) {
      res.setHeader("Cache-Control", "no-store");
      return res.json(createBatchDownloadToken(body.credentials, body.items));
    }

    if (!body.path) {
      return res.status(400).json({ success: false, error: "Target path is required." });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(createDownloadToken(body.credentials, body.path, !!body.isDirectory));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).json({ success: false, error: message });
  }
});

app.get("/api/ssh/download", async (req, res) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    return res.status(400).send("No download token provided.");
  }

  try {
    const payload = parseDownloadToken(token);
    const result = await openDownloadStream(payload.credentials, payload.targetPath, payload.isDirectory, payload.items);
    const cleanup = () => result.cleanup();

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(result.filename)}"`);
    res.setHeader("Content-Type", result.contentType);

    result.stream.on("close", cleanup);
    result.stream.on("end", cleanup);
    result.stream.on("error", cleanup);
    result.stream.pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(500).send(`Failed to process download: ${message}`);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
