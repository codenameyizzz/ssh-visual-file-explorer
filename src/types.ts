export interface SSHCredentials {
  host: string;
  username: string;
  port: number;
  authType: "key" | "password";
  privateKey?: string;
  password?: string;
  passphrase?: string;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink?: boolean;
  size: number;
  mtime: number;
  permissions?: string;
}

export interface EditorState {
  isOpen: boolean;
  filePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  isSaving: boolean;
}
