import { useState } from "react";
import { Check, Info, Terminal, X } from "lucide-react";
import FileBrowser from "./components/FileBrowser";
import ConnectionPanel from "./components/ConnectionPanel";
import FileEditor from "./components/FileEditor";
import TerminalPanel from "./components/TerminalPanel";
import { SSHCredentials } from "./types";

export default function App() {
  const [currentView, setCurrentView] = useState<"connect" | "browser" | "editor" | "terminal">("connect");
  const [credentials, setCredentials] = useState<SSHCredentials | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [initialPath, setInitialPath] = useState("");
  const [terminalPath, setTerminalPath] = useState("");
  const [activeFilePath, setActiveFilePath] = useState("");
  const [activeFileName, setActiveFileName] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "error" | "info" }>>([]);

  const addToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleConnect = async (creds: SSHCredentials) => {
    setIsConnecting(true);
    addToast("Initializing secure handshake with SSH server...", "info");

    try {
      const response = await fetch("/api/ssh/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const result = await response.json();

      if (result.success) {
        setCredentials(creds);
        setInitialPath(result.homeDir || "");
        setTerminalPath(result.homeDir || "");
        setCurrentView("browser");
        addToast("SSH session established. Launching directory browser!", "success");
      } else {
        addToast(result.error || "Handshake rejected. Verify server hostname, user credentials, and key boundaries.", "error");
      }
    } catch (err: any) {
      addToast(err.message || "Failed to establish tunnel. Remote server may not be listening on port 22.", "error");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setCredentials(null);
    setInitialPath("");
    setTerminalPath("");
    setCurrentView("connect");
    addToast("SSH link dismantled. Connection closed.", "info");
  };

  const startEditingFile = (filePath: string, fileName: string) => {
    setActiveFilePath(filePath);
    setActiveFileName(fileName);
    setCurrentView("editor");
  };

  const finishEditingFile = () => {
    setCurrentView("browser");
  };

  const openTerminal = (startPath: string) => {
    setTerminalPath(startPath || initialPath);
    setCurrentView("terminal");
  };

  const closeTerminal = () => {
    setCurrentView("browser");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 selection:bg-sky-500/10">
      <header className="bg-slate-900 border-b border-slate-800 text-white px-6 py-4 flex items-center justify-between shrink-0 selection:bg-white/10 select-none">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-sky-500/10 border border-sky-400/20 rounded-lg text-sky-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide">SSH Visual File Explorer</h1>
            <p className="text-[10px] text-slate-400 tracking-wider font-mono">REMOTE SFTP DIRECTORY LINK</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          {credentials && (
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/50 text-[11px] text-slate-300">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="font-mono">{credentials.username}@{credentials.host}</span>
            </div>
          )}
          <span className="text-slate-500 text-[10px] font-mono hidden md:inline">LOCAL SSH FILE BROWSER</span>
        </div>
      </header>

      <main className="flex-1 relative min-h-0">
        {currentView === "connect" && (
          <div className="py-6">
            <ConnectionPanel
              onConnect={handleConnect}
              isConnecting={isConnecting}
              onShowToast={addToast}
            />
          </div>
        )}

        {credentials && (
          <div className={currentView === "browser" ? "block animate-fade-in" : "hidden"}>
            <FileBrowser
              credentials={credentials}
              initialPath={initialPath}
              onDisconnect={handleDisconnect}
              onEditFile={startEditingFile}
              onOpenTerminal={openTerminal}
              onShowToast={addToast}
            />
          </div>
        )}

        {currentView === "editor" && credentials && (
          <div className="animate-fade-in">
            <FileEditor
              credentials={credentials}
              filePath={activeFilePath}
              fileName={activeFileName}
              onClose={finishEditingFile}
              onShowToast={addToast}
            />
          </div>
        )}

        {credentials && (
          <div className={currentView === "terminal" ? "block animate-fade-in h-full" : "hidden"}>
            <TerminalPanel
              credentials={credentials}
              initialPath={terminalPath || initialPath}
              onBack={closeTerminal}
              onShowToast={addToast}
            />
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-slate-200 bg-white/90 px-6 py-2 text-center text-[11px] text-slate-500">
        &copy; Yizreel Schwartz Sipahutar 2026
      </footer>

      <div className="fixed bottom-5 right-5 space-y-2 z-50 pointer-events-none max-w-sm w-full font-sans">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-4 rounded-xl shadow-lg border text-white font-medium text-xs flex items-center justify-between gap-3 pointer-events-auto transition-transform ${
              toast.type === "success"
                ? "bg-emerald-600 border-emerald-500 shadow-emerald-600/10"
                : toast.type === "error"
                ? "bg-red-650 border-red-600 shadow-red-600/10"
                : "bg-slate-800 border-slate-700 shadow-slate-900/10"
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === "success" && (
                <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
                  <Check className="w-3 h-3" />
                </div>
              )}
              {toast.type === "error" && (
                <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0">
                  !
                </div>
              )}
              {toast.type === "info" && (
                <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
                  <Info className="w-3 h-3" />
                </div>
              )}
              <p className="leading-relaxed tracking-tight">{toast.message}</p>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-white/60 hover:text-white text-xs font-bold shrink-0 cursor-pointer p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
