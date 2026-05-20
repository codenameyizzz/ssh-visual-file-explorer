import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { NodeSSH } from "node-ssh";
import type { SSHCredentials } from "../types";

const FILE_TYPE_MASK = 0o170000;
const DIRECTORY_MODE = 0o040000;
const SYMLINK_MODE = 0o120000;
const DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;
const DEV_DOWNLOAD_SECRET = "local-dev-download-secret-change-me";
export const MAX_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024;

interface DownloadTokenPayload {
  credentials: SSHCredentials;
  targetPath?: string;
  isDirectory?: boolean;
  items?: Array<{
    path: string;
    name: string;
  }>;
  expiresAt: number;
}

export interface DownloadStreamResult {
  filename: string;
  contentType: string;
  stream: NodeJS.ReadableStream;
  cleanup: () => void;
}

export interface DownloadItemRequest {
  path: string;
  name: string;
}

type SftpStats = {
  mode: number;
  size: number;
  mtime: number;
};

type SftpListItem = {
  filename: string;
  attrs: SftpStats;
};

type SftpClient = {
  readdir: (remotePath: string, cb: (err: Error | undefined | null, list: SftpListItem[]) => void) => void;
  stat: (remotePath: string, cb: (err: Error | undefined | null, stats: SftpStats) => void) => void;
  lstat: (remotePath: string, cb: (err: Error | undefined | null, stats: SftpStats) => void) => void;
  writeFile: (
    remotePath: string,
    data: string | Buffer,
    options: { encoding?: BufferEncoding } | undefined,
    cb: (err?: Error | null) => void,
  ) => void;
  mkdir: (remotePath: string, attrs: Record<string, never>, cb: (err?: Error | null) => void) => void;
  unlink: (remotePath: string, cb: (err?: Error | null) => void) => void;
  rmdir: (remotePath: string, cb: (err?: Error | null) => void) => void;
  createReadStream: (remotePath: string, options?: { encoding?: BufferEncoding }) => NodeJS.ReadableStream;
};

function isDirectoryMode(mode: number | undefined) {
  return ((mode || 0) & FILE_TYPE_MASK) === DIRECTORY_MODE;
}

function isSymlinkMode(mode: number | undefined) {
  return ((mode || 0) & FILE_TYPE_MASK) === SYMLINK_MODE;
}

function posixJoin(basePath: string, childName: string) {
  return basePath === "/" ? `/${childName}` : `${basePath}/${childName}`;
}

function escapePosixShellArg(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function sanitizeArchiveBaseName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "download-bundle";
}

function getDownloadSecret() {
  const configuredSecret = process.env.DOWNLOAD_TOKEN_SECRET;
  if (configuredSecret) {
    return crypto.createHash("sha256").update(configuredSecret).digest();
  }

  const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new Error("DOWNLOAD_TOKEN_SECRET is required in production.");
  }

  return crypto.createHash("sha256").update(DEV_DOWNLOAD_SECRET).digest();
}

function encryptPayload(payload: DownloadTokenPayload) {
  const key = getDownloadSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptPayload(token: string): DownloadTokenPayload {
  const [ivPart, tagPart, dataPart] = token.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid download token.");
  }

  const key = getDownloadSecret();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  const payload = JSON.parse(decrypted.toString("utf8")) as DownloadTokenPayload;

  if (!payload.expiresAt || payload.expiresAt < Date.now()) {
    throw new Error("Download token has expired.");
  }

  return payload;
}

async function getSftp(ssh: NodeSSH) {
  return (await ssh.requestSFTP()) as unknown as SftpClient;
}

async function sftpReaddir(sftp: SftpClient, remotePath: string) {
  return await new Promise<SftpListItem[]>((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) return reject(err);
      resolve(list);
    });
  });
}

async function sftpStat(sftp: SftpClient, remotePath: string) {
  return await new Promise<SftpStats>((resolve, reject) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });
}

async function sftpLstat(sftp: SftpClient, remotePath: string) {
  return await new Promise<SftpStats>((resolve, reject) => {
    sftp.lstat(remotePath, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });
}

async function sftpWriteFile(
  sftp: SftpClient,
  remotePath: string,
  content: string | Buffer,
  options?: { encoding?: BufferEncoding },
) {
  await new Promise<void>((resolve, reject) => {
    sftp.writeFile(remotePath, content, options, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function sftpMkdir(sftp: SftpClient, remotePath: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.mkdir(remotePath, {}, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function sftpUnlink(sftp: SftpClient, remotePath: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.unlink(remotePath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function sftpRmdir(sftp: SftpClient, remotePath: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.rmdir(remotePath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function deleteRemoteEntry(sftp: SftpClient, remotePath: string): Promise<void> {
  const stats = await sftpLstat(sftp, remotePath);
  if (isSymlinkMode(stats.mode) || !isDirectoryMode(stats.mode)) {
    await sftpUnlink(sftp, remotePath);
    return;
  }

  const entries = await sftpReaddir(sftp, remotePath);
  for (const entry of entries) {
    if (entry.filename === "." || entry.filename === "..") {
      continue;
    }
    await deleteRemoteEntry(sftp, posixJoin(remotePath, entry.filename));
  }

  await sftpRmdir(sftp, remotePath);
}

async function readUtf8Stream(stream: NodeJS.ReadableStream) {
  return await new Promise<string>((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => {
      data += chunk;
    });
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

async function resolveHomeDirectory(ssh: NodeSSH) {
  const { stdout } = await ssh.execCommand("pwd");
  return stdout.trim() || "/";
}

async function resolveRemotePath(ssh: NodeSSH, targetPathInput?: string) {
  const homeDir = await resolveHomeDirectory(ssh);
  let targetPath = (targetPathInput || "").trim();

  if (!targetPath || targetPath === "~") {
    return homeDir;
  }

  if (targetPath.startsWith("~/")) {
    return targetPath.replace("~", homeDir);
  }

  return targetPath;
}

export async function connectSSH(creds: SSHCredentials) {
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

export async function testConnection(credentials: SSHCredentials) {
  const ssh = await connectSSH(credentials);
  try {
    const homeDir = await resolveHomeDirectory(ssh);
    return { success: true, homeDir };
  } finally {
    ssh.dispose();
  }
}

export async function listDirectory(credentials: SSHCredentials, targetPathInput?: string) {
  const ssh = await connectSSH(credentials);
  try {
    const targetPath = await resolveRemotePath(ssh, targetPathInput);
    const sftp = await getSftp(ssh);
    const entries = await sftpReaddir(sftp, targetPath);
    const files = entries
      .filter((item) => item.filename !== "." && item.filename !== "..")
      .map((item) => {
        const isDirectory = isDirectoryMode(item.attrs.mode);
        const isSymlink = isSymlinkMode(item.attrs.mode);

        return {
          name: item.filename,
          path: posixJoin(targetPath, item.filename),
          isDirectory: isDirectory || isSymlink,
          isSymlink,
          size: item.attrs.size,
          mtime: item.attrs.mtime * 1000,
          permissions: item.attrs.mode?.toString(8).slice(-3) || "---",
        };
      })
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

    return { success: true, currentPath: targetPath, files };
  } finally {
    ssh.dispose();
  }
}

export async function readRemoteFile(credentials: SSHCredentials, targetPath: string) {
  const ssh = await connectSSH(credentials);
  try {
    const sftp = await getSftp(ssh);
    const stats = await sftpStat(sftp, targetPath);

    if (stats.size > 15 * 1024 * 1024) {
      throw new Error("File is too large (> 15MB) to view in the web editor. Please use the download feature.");
    }

    const stream = sftp.createReadStream(targetPath, { encoding: "utf8" });
    const content = await readUtf8Stream(stream);
    return { success: true, content, size: stats.size };
  } finally {
    ssh.dispose();
  }
}

export async function writeRemoteFile(credentials: SSHCredentials, targetPath: string, content: string) {
  const ssh = await connectSSH(credentials);
  try {
    const sftp = await getSftp(ssh);
    await sftpWriteFile(sftp, targetPath, content, { encoding: "utf8" });
    return { success: true };
  } finally {
    ssh.dispose();
  }
}

export async function uploadRemoteFile(credentials: SSHCredentials, targetPath: string, fileBuffer: Buffer) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  if (fileBuffer.length > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`File is too large. Maximum supported upload size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`);
  }

  const ssh = await connectSSH(credentials);
  try {
    const sftp = await getSftp(ssh);
    await sftpWriteFile(sftp, targetPath, fileBuffer);
    return { success: true, size: fileBuffer.length };
  } finally {
    ssh.dispose();
  }
}

export async function createRemoteDirectory(credentials: SSHCredentials, targetPath: string) {
  const ssh = await connectSSH(credentials);
  try {
    const sftp = await getSftp(ssh);
    await sftpMkdir(sftp, targetPath);
    return { success: true };
  } finally {
    ssh.dispose();
  }
}

export async function deleteRemotePath(credentials: SSHCredentials, targetPath: string) {
  const ssh = await connectSSH(credentials);
  try {
    const sftp = await getSftp(ssh);
    await deleteRemoteEntry(sftp, targetPath);
    return { success: true };
  } finally {
    ssh.dispose();
  }
}

export function createDownloadToken(credentials: SSHCredentials, targetPath: string, isDirectory: boolean) {
  return {
    success: true,
    token: encryptPayload({
      credentials,
      targetPath,
      isDirectory,
      expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
    }),
  };
}

export function createBatchDownloadToken(credentials: SSHCredentials, items: DownloadItemRequest[]) {
  if (!items.length) {
    throw new Error("At least one item is required for batch download.");
  }

  return {
    success: true,
    token: encryptPayload({
      credentials,
      items,
      expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
    }),
  };
}

export function parseDownloadToken(token: string) {
  return decryptPayload(token);
}

async function openBatchDownloadStream(ssh: NodeSSH, items: DownloadItemRequest[]): Promise<DownloadStreamResult> {
  if (!items.length) {
    throw new Error("No items provided for batch download.");
  }

  const parentDir = path.posix.dirname(items[0].path);
  const sameParent = items.every((item) => path.posix.dirname(item.path) === parentDir);
  if (!sameParent) {
    throw new Error("Batch download currently requires all selected items to be in the same directory.");
  }

  const conn = ssh.connection;
  if (!conn) {
    throw new Error("SSH connection not accessible.");
  }

  const tarTargets = items.map((item) => escapePosixShellArg(path.posix.basename(item.path))).join(" ");
  const archiveBaseName = sanitizeArchiveBaseName(path.posix.basename(parentDir) || "download-bundle");
  const command = `tar -czf - -C ${escapePosixShellArg(parentDir)} ${tarTargets}`;
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    conn.exec(command, (err, remoteStream) => {
      if (err) return reject(err);
      resolve(remoteStream);
    });
  });

  return {
    filename: `${archiveBaseName}-selection.tar.gz`,
    contentType: "application/gzip",
    stream,
    cleanup: () => ssh.dispose(),
  };
}

export async function openDownloadStream(
  credentials: SSHCredentials,
  targetPath?: string,
  isDirectory?: boolean,
  items?: DownloadItemRequest[],
): Promise<DownloadStreamResult> {
  const ssh = await connectSSH(credentials);

  try {
    if (items?.length) {
      return await openBatchDownloadStream(ssh, items);
    }

    if (!targetPath) {
      throw new Error("Target path is required.");
    }

    if (isDirectory) {
      const parentDir = path.posix.dirname(targetPath);
      const folderName = path.posix.basename(targetPath);
      const conn = ssh.connection;

      if (!conn) {
        throw new Error("SSH connection not accessible.");
      }

      const command = `tar -czf - -C ${escapePosixShellArg(parentDir)} ${escapePosixShellArg(folderName)}`;
      const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        conn.exec(command, (err, remoteStream) => {
          if (err) return reject(err);
          resolve(remoteStream);
        });
      });

      return {
        filename: `${folderName || "archive"}.tar.gz`,
        contentType: "application/gzip",
        stream,
        cleanup: () => ssh.dispose(),
      };
    }

    const sftp = await getSftp(ssh);
    const filename = path.posix.basename(targetPath) || "download";
    const stream = sftp.createReadStream(targetPath);

    return {
      filename,
      contentType: "application/octet-stream",
      stream,
      cleanup: () => ssh.dispose(),
    };
  } catch (error) {
    ssh.dispose();
    throw error;
  }
}

export function toWebStream(stream: NodeJS.ReadableStream) {
  return Readable.toWeb(stream as Readable) as ReadableStream;
}
