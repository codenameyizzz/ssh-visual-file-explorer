import dotenv from "dotenv";
import express from "express";
import path from "path";
import { NodeSSH } from "node-ssh";
import { createServer as createViteServer } from "vite";

dotenv.config();

interface SSHCredentials {
  host: string;
  username: string;
  port?: number;
  privateKey?: string;
  password?: string;
  passphrase?: string;
}

const app = express();
const PORT = Number(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";

// Increase body limit to support large text file transfers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Map to store temporary download tickets
// Maps random token string -> { credentials, targetPath, isDirectory }
const downloadTickets = new Map<string, { credentials: SSHCredentials; targetPath: string; isDirectory: boolean }>();

// Helper to secure connection
async function connectSSH(creds: SSHCredentials): Promise<NodeSSH> {
  if (!creds.host || !creds.username) {
    throw new Error("Host and Username are required.");
  }
  const ssh = new NodeSSH();
  await ssh.connect({
    host: creds.host,
    username: creds.username,
    port: creds.port || 22,
    password: creds.password || undefined,
    privateKey: creds.privateKey || undefined,
    passphrase: creds.passphrase || undefined,
    readyTimeout: 15000,
  });
  return ssh;
}

// 1. Connection test endpoint
app.post("/api/ssh/test", async (req, res) => {
  try {
    const creds: SSHCredentials = req.body;
    const ssh = await connectSSH(creds);
    
    // Get initial working directory path
    const { stdout } = await ssh.execCommand("pwd");
    const homeDir = stdout.trim() || "/";
    
    ssh.dispose();
    res.json({ success: true, homeDir });
  } catch (err: any) {
    console.error("Test connection error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2. List directory contents
app.post("/api/ssh/list", async (req, res) => {
  let ssh: NodeSSH | null = null;
  try {
    const { credentials, path: targetPathInput } = req.body;
    ssh = await connectSSH(credentials);
    
    // Resolve home directory if path is blank or starts with ~
    const { stdout: pwdOut } = await ssh.execCommand("pwd");
    const homeDir = pwdOut.trim() || "/";
    
    let targetPath = (targetPathInput || "").trim();
    if (!targetPath) {
      targetPath = homeDir;
    } else if (targetPath === "~") {
      targetPath = homeDir;
    } else if (targetPath.startsWith("~/")) {
      targetPath = targetPath.replace("~", homeDir);
    }
    
    const sftp = await ssh.requestSFTP();
    const files = await new Promise<any[]>((resolve, reject) => {
      sftp.readdir(targetPath, (err, list) => {
        if (err) {
          return reject(err);
        }
        
        const results = list
          .filter((item) => item.filename !== "." && item.filename !== "..")
          .map((item) => {
            const isDirectory = (item.attrs.mode & 0o170000) === 0o040000;
            const isSymlink = (item.attrs.mode & 0o170000) === 0o120000;
            
            return {
              name: item.filename,
              path: targetPath === "/" ? `/${item.filename}` : `${targetPath}/${item.filename}`,
              isDirectory: isDirectory || isSymlink,
              isSymlink,
              size: item.attrs.size,
              mtime: item.attrs.mtime * 1000,
              permissions: item.attrs.mode.toString(8).slice(-3), // last 3 digits e.g. 755
            };
          });
        
        // Sort: folders first, then files alphabetically
        results.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        
        resolve(results);
      });
    });
    
    ssh.dispose();
    res.json({ success: true, currentPath: targetPath, files });
  } catch (err: any) {
    if (ssh) ssh.dispose();
    console.error("List SFTP directory error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Read file content (up to 10MB)
app.post("/api/ssh/read", async (req, res) => {
  let ssh: NodeSSH | null = null;
  try {
    const { credentials, path: targetPath } = req.body;
    ssh = await connectSSH(credentials);
    const sftp = await ssh.requestSFTP();
    
    // Quick Stat check to size-restrict
    const stats = await new Promise<any>((resolve, reject) => {
      sftp.stat(targetPath, (err, stats) => {
        if (err) return reject(err);
        resolve(stats);
      });
    });
    
    if (stats.size > 15 * 1024 * 1024) {
      throw new Error("File is too large (> 15MB) to view in the web editor. Please use the download feature.");
    }
    
    const content = await new Promise<string>((resolve, reject) => {
      const stream = sftp.createReadStream(targetPath, { encoding: "utf8" });
      let data = "";
      stream.on("data", (chunk) => {
        data += chunk;
      });
      stream.on("end", () => {
        resolve(data);
      });
      stream.on("error", (err) => {
        reject(err);
      });
    });
    
    ssh.dispose();
    res.json({ success: true, content, size: stats.size });
  } catch (err: any) {
    if (ssh) ssh.dispose();
    console.error("Read file error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Save file changes or create new file
app.post("/api/ssh/write", async (req, res) => {
  let ssh: NodeSSH | null = null;
  try {
    const { credentials, path: targetPath, content } = req.body;
    ssh = await connectSSH(credentials);
    const sftp = await ssh.requestSFTP();
    
    await new Promise<void>((resolve, reject) => {
      sftp.writeFile(targetPath, content, { encoding: "utf8" }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    
    ssh.dispose();
    res.json({ success: true });
  } catch (err: any) {
    if (ssh) ssh.dispose();
    console.error("Write file error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Create new folder
app.post("/api/ssh/mkdir", async (req, res) => {
  let ssh: NodeSSH | null = null;
  try {
    const { credentials, path: targetPath } = req.body;
    ssh = await connectSSH(credentials);
    const sftp = await ssh.requestSFTP();
    
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(targetPath, {}, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    
    ssh.dispose();
    res.json({ success: true });
  } catch (err: any) {
    if (ssh) ssh.dispose();
    console.error("Mkdir error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Delete file or directory (recursively via SSH command rm -rf)
app.post("/api/ssh/delete", async (req, res) => {
  let ssh: NodeSSH | null = null;
  try {
    const { credentials, path: targetPath, isDirectory } = req.body;
    ssh = await connectSSH(credentials);
    
    let cmd = "";
    if (isDirectory) {
      cmd = `rm -rf "${targetPath.replace(/"/g, '\\"')}"`;
    } else {
      cmd = `rm -f "${targetPath.replace(/"/g, '\\"')}"`;
    }
    
    const { code, stderr } = await ssh.execCommand(cmd);
    if (code !== 0) {
      throw new Error(stderr || `Exited with code ${code}`);
    }
    
    ssh.dispose();
    res.json({ success: true });
  } catch (err: any) {
    if (ssh) ssh.dispose();
    console.error("Delete error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Generate a one-time download ticket for browser downloads (files or folders)
app.post("/api/ssh/download-ticket", (req, res) => {
  try {
    const { credentials, path: targetPath, isDirectory } = req.body;
    if (!credentials || !targetPath) {
      return res.status(400).json({ success: false, error: "Credentials and target path are required." });
    }
    
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    downloadTickets.set(token, { credentials, targetPath, isDirectory: !!isDirectory });
    
    // Automatically delete token after 5 minutes to prevent leak/leak memory
    setTimeout(() => {
      downloadTickets.delete(token);
    }, 5 * 60 * 1000);
    
    res.json({ success: true, token });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Stream the physical file or zipped folder directly to browser
app.get("/api/ssh/download", async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).send("No download token provided.");
  }
  
  const ticket = downloadTickets.get(token);
  if (!ticket) {
    return res.status(404).send("Download ticket has expired or is invalid. Please try initiating the download again.");
  }
  
  const { credentials, targetPath, isDirectory } = ticket;
  let ssh: NodeSSH | null = null;
  
  try {
    ssh = await connectSSH(credentials);
    
    if (isDirectory) {
      // It's a directory! Compress and stream as .tar.gz on-the-fly
      const parentDir = path.dirname(targetPath);
      const folderName = path.basename(targetPath);
      const conn = ssh.connection;
      
      if (!conn) {
        throw new Error("SSH Connection not accessible");
      }
      
      const safeFilename = encodeURIComponent(folderName || "archive");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.tar.gz"`);
      res.setHeader("Content-Type", "application/gzip");
      
      // Execute standard tar compression to stdout
      conn.exec(`tar -czf - -C "${parentDir.replace(/"/g, '\\"')}" "${folderName.replace(/"/g, '\\"')}"`, (err, stream) => {
        if (err) {
          if (ssh) ssh.dispose();
          downloadTickets.delete(token);
          return res.status(500).send("Command execution failed: " + err.message);
        }
        
        stream.pipe(res);
        
        stream.on("close", () => {
          if (ssh) ssh.dispose();
          downloadTickets.delete(token);
        });
        
        stream.on("error", (streamErr) => {
          console.error("Tar compression stream error:", streamErr);
          if (ssh) ssh.dispose();
          downloadTickets.delete(token);
        });
      });
    } else {
      // It's a single file! Stream contents directly via SFTP
      const sftp = await ssh.requestSFTP();
      const filename = path.basename(targetPath);
      const safeFilename = encodeURIComponent(filename || "download");
      
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      
      const stream = sftp.createReadStream(targetPath);
      stream.pipe(res);
      
      stream.on("end", () => {
        if (ssh) ssh.dispose();
        downloadTickets.delete(token);
      });
      
      stream.on("error", (streamErr) => {
        console.error("SFTP file download stream error:", streamErr);
        if (ssh) ssh.dispose();
        downloadTickets.delete(token);
      });
    }
  } catch (err: any) {
    if (ssh) ssh.dispose();
    downloadTickets.delete(token);
    console.error("Download handling error:", err);
    res.status(500).send("Failed to process download: " + err.message);
  }
});

// Configure Vite integration
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
