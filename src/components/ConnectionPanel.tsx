import React, { useState, useEffect } from "react";
import { SSHCredentials } from "../types";
import { Server, Key, Lock, ArrowRight, ShieldCheck, FileKey, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

interface ConnectionPanelProps {
  onConnect: (creds: SSHCredentials) => void;
  isConnecting: boolean;
  onShowToast: (message: string, type: "success" | "error" | "info") => void;
}

export default function ConnectionPanel({ onConnect, isConnecting, onShowToast }: ConnectionPanelProps) {
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [port, setPort] = useState(22);
  const [authType, setAuthType] = useState<"key" | "password">("key");
  const [privateKey, setPrivateKey] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [rememberKeys, setRememberKeys] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Load saved credentials from localStorage on component mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ssh_explorer_creds");
      if (saved) {
        const parsed = JSON.parse(saved) as SSHCredentials;
        if (parsed.host) setHost(parsed.host);
        if (parsed.username) setUsername(parsed.username);
        if (parsed.port) setPort(parsed.port);
        if (parsed.authType) setAuthType(parsed.authType);
        if (parsed.privateKey) setPrivateKey(parsed.privateKey);
        if (parsed.password) setPassword(parsed.password);
        if (parsed.passphrase) setPassphrase(parsed.passphrase);
      }
    } catch (e) {
      console.error("Failed to load saved credentials", e);
    }
  }, []);

  const getCreds = (): SSHCredentials => {
    return {
      host: host.trim(),
      username: username.trim(),
      port: Number(port) || 22,
      authType,
      privateKey: authType === "key" ? privateKey : undefined,
      password: authType === "password" ? password : undefined,
      passphrase: authType === "key" && passphrase ? passphrase : undefined,
    };
  };

  const handleSaveCredentials = (creds: SSHCredentials) => {
    if (rememberKeys) {
      localStorage.setItem("ssh_explorer_creds", JSON.stringify(creds));
    } else {
      localStorage.removeItem("ssh_explorer_creds");
    }
  };

  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !username) {
      onShowToast("Host and Username are required fields.", "error");
      return;
    }
    if (authType === "key" && !privateKey) {
      onShowToast("Please paste or drop your visual private key (.pem) to connect.", "error");
      return;
    }
    if (authType === "password" && !password) {
      onShowToast("Please enter your SSH password to connect.", "error");
      return;
    }

    const creds = getCreds();
    handleSaveCredentials(creds);
    onConnect(creds);
  };

  const handleTestConnection = async () => {
    if (!host || !username) {
      onShowToast("Please fill in Host and Username before testing.", "error");
      return;
    }
    if (authType === "key" && !privateKey) {
      onShowToast("Please paste or drop a Private Key first.", "error");
      return;
    }
    if (authType === "password" && !password) {
      onShowToast("Please enter a password first.", "error");
      return;
    }

    setIsTesting(true);
    const creds = getCreds();
    
    try {
      const response = await fetch("/api/ssh/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      
      const result = await response.json();
      if (result.success) {
        onShowToast(`Successfully connected! Home directory: ${result.homeDir}`, "success");
        handleSaveCredentials(creds);
      } else {
        onShowToast(result.error || "Connection failed. Verify host details or keys.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message || "Network error. Server might be bootslapping.", "error");
    } finally {
      setIsTesting(false);
    }
  };

  // PEM file upload / drag-and-drop handler
  const handleKeyFile = (file: File) => {
    if (file.size > 200 * 1024) {
      onShowToast("Key file too large. Standard private keys are usually < 10KB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text.includes("PRIVATE KEY")) {
        setPrivateKey(text);
        onShowToast(`Key file "${file.name}" loaded successfully!`, "success");
      } else {
        onShowToast("The file does not seem to contain a valid SSH PEM format (missing PRIVATE KEY boundary).", "error");
      }
    };
    reader.readAsText(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleKeyFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleKeyFile(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4" id="connection-panel-container">
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-100/50 overflow-hidden">
        {/* Header decoration */}
        <div className="bg-slate-900 px-6 py-8 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 bg-slate-800 w-36 h-36 rounded-full opacity-30 blur-2xl"></div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-400/20 rounded-xl text-sky-400">
              <Server className="w-6 h-6" id="server-icon" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight font-sans">SSH Remote Link</h2>
              <p className="text-xs text-slate-400 mt-1">Browse, view & download direct from your host visually</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleConnectSubmit} className="p-6 md:p-8 space-y-6">
          {/* Host, port and username */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 tracking-wider uppercase mb-1.5">
                Host Address IP
              </label>
              <div className="relative">
                <input
                  id="ssh-host-input"
                  type="text"
                  required
                  placeholder="e.g. 192.5.87.201"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
                />
              </div>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-slate-500 tracking-wider uppercase mb-1.5">
                SSH Port
              </label>
              <input
                id="ssh-port-input"
                type="number"
                required
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-slate-500 tracking-wider uppercase mb-1.5">
                Username
              </label>
              <input
                id="ssh-username-input"
                type="text"
                required
                placeholder="e.g. cc"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
              />
            </div>
          </div>

          {/* Authentication switches */}
          <div>
            <label className="block text-xs font-medium text-slate-500 tracking-wider uppercase mb-2">
              Credentials Authentication
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 rounded-lg border border-slate-100">
              <button
                id="auth-type-key"
                type="button"
                onClick={() => setAuthType("key")}
                className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                  authType === "key"
                    ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                PEM Private Key
              </button>
              <button
                id="auth-type-password"
                type="button"
                onClick={() => setAuthType("password")}
                className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                  authType === "password"
                    ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Password Access
              </button>
            </div>
          </div>

          {/* Authentication Type Forms */}
          {authType === "key" ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <span className="block text-xs font-medium text-slate-500 tracking-wider uppercase mb-1.5">
                  Private Key (.pem)
                </span>
                
                {/* PEM Key Dropzone */}
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
                    isDragOver
                      ? "border-sky-500 bg-sky-50/50"
                      : privateKey
                      ? "border-emerald-300 bg-emerald-50/10"
                      : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                  }`}
                >
                  <input
                    type="file"
                    id="pem-file-upload"
                    accept=".pem,.txt,.key,*"
                    onChange={onFileChange}
                    className="hidden"
                  />
                  {privateKey ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="p-2 bg-emerald-100 rounded-full text-emerald-600">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-medium text-slate-800">Private Key loaded successfully</p>
                      <button
                        type="button"
                        onClick={() => setPrivateKey("")}
                        className="text-[11px] text-red-500 hover:underline font-medium mt-1"
                      >
                        Reset / Remove Key
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="pem-file-upload" className="cursor-pointer flex flex-col items-center gap-1.5">
                      <FileKey className="w-8 h-8 text-slate-400" />
                      <p className="text-xs text-slate-600">
                        <span className="font-semibold text-sky-600 hover:underline">Click to upload</span> or drag SSH pem key
                      </p>
                      <p className="text-[10px] text-slate-400">Supports OpenSSH and PEM private key files</p>
                    </label>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-500 tracking-wider uppercase">
                    PEM Text Content (Backup)
                  </label>
                  {!privateKey && (
                    <span className="text-[10px] text-slate-400">Paste PEM block directly here</span>
                  )}
                </div>
                <textarea
                  id="pem-text-textarea"
                  rows={4}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 leading-relaxed bg-slate-50/30"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 tracking-wider uppercase mb-1.5">
                  Key Passphrase (optional)
                </label>
                <input
                  id="passphrase-input"
                  type="password"
                  placeholder="Only if your PEM is encrypted with a passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in" id="password-form-block">
              <div>
                <label className="block text-xs font-medium text-slate-500 tracking-wider uppercase mb-1.5">
                  SSH Connection Password
                </label>
                <input
                  id="password-input"
                  type="password"
                  required
                  placeholder="Enter SSH password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {/* Preferences */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <input
                id="remember-keys"
                type="checkbox"
                checked={rememberKeys}
                onChange={(e) => setRememberKeys(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500/20 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="remember-keys" className="text-xs text-slate-500 font-medium cursor-pointer selection:bg-transparent">
                Keep details saved in browser local storage
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              id="test-connection-btn"
              type="button"
              disabled={isTesting || isConnecting}
              onClick={handleTestConnection}
              className="flex-1 sm:flex-initial px-4 py-2.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 focus:outline-none"
            >
              {isTesting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              )}
              Test Connection
            </button>

            <button
              id="connect-host-btn"
              type="submit"
              disabled={isConnecting || isTesting}
              className="flex-1 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-slate-900/10 focus:outline-none"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                  Linking Secure Session...
                </>
              ) : (
                <>
                  Connect Remote Host
                  <ArrowRight className="w-4 h-4 text-sky-400" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Informative Help Card */}
        <div className="bg-slate-50/50 border-t border-slate-100 p-4 md:p-6 flex gap-3 text-xs text-slate-500">
          <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-slate-700 font-sans">Visual Explorer Workflow</p>
            <p className="leading-relaxed">
              Once linked, you can double-click folders, view file parameters, and press <strong className="text-slate-700">Download</strong> to download complete files or folders directly as <strong className="text-slate-700">.tar.gz archives</strong>. You can also modify files inside the web browser!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
