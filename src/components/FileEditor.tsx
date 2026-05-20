import React, { useState, useEffect } from "react";
import { SSHCredentials } from "../types";
import { FileCode, Save, X, RotateCcw, AlertTriangle, Check, Loader, FileText, HelpCircle } from "lucide-react";

interface FileEditorProps {
  credentials: SSHCredentials;
  filePath: string;
  fileName: string;
  onClose: () => void;
  onShowToast: (message: string, type: "success" | "error" | "info") => void;
}

export default function FileEditor({ credentials, filePath, fileName, onClose, onShowToast }: FileEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Load file contents
  useEffect(() => {
    const fetchFileContent = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/ssh/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentials, path: filePath }),
        });
        const result = await response.json();
        
        if (result.success) {
          setContent(result.content);
          setOriginalContent(result.content);
          
          // Count initial lines
          const lines = result.content.split("\n").length;
          setLineCount(lines || 1);
          
          onShowToast(`Opened: ${fileName}`, "info");
        } else {
          onShowToast(result.error || "Failed to read file content.", "error");
          onClose();
        }
      } catch (err: any) {
        onShowToast(err.message || "Failed to fetch file contents.", "error");
        onClose();
      } finally {
        setIsLoading(false);
      }
    };

    fetchFileContent();
  }, [filePath]);

  // Sync line numbers whenever content changes
  useEffect(() => {
    const lines = content.split("\n").length;
    setLineCount(lines || 1);
  }, [content]);

  const hasUnsavedChanges = content !== originalContent;

  // Handle Save File contents back to SSH server
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/ssh/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials,
          path: filePath,
          content,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setOriginalContent(content);
        onShowToast(`"${fileName}" saved successfully to host!`, "success");
      } else {
        onShowToast(result.error || "Failed to write changes to remote file.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Close and check unsaved changes
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  // Reset content back to original
  const handleReset = () => {
    if (window.confirm("Are you sure you want to discard all your edits and revert to the saved file?")) {
      setContent(originalContent);
      onShowToast("Edits reverted to last saved state.", "info");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-slate-400 space-y-4">
        <Loader className="w-8 h-8 animate-spin text-sky-400" />
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-200">Retrieving File Stream</p>
          <p className="text-[11px] font-mono text-slate-500 max-w-sm px-4 truncate mt-1">{filePath}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans relative" id="file-editor-container">
      {/* Editor Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-lg text-sky-400">
            <FileCode className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-slate-100">{fileName}</h3>
              {hasUnsavedChanges ? (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-md font-medium border border-amber-500/20">
                  Unsaved Changes
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-md font-medium border border-emerald-500/20 flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <p className="text-slate-500 text-[10px] font-mono tracking-tight select-all truncate max-w-md md:max-w-xl mt-0.5">
              Remote: {filePath}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasUnsavedChanges && (
            <button
              id="revert-file-btn"
              onClick={handleReset}
              className="px-3 py-1.5 border border-slate-700 hover:border-slate-600 hover:bg-slate-800 text-xs text-slate-300 font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Discard custom modifications"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Revert
            </button>
          )}

          <button
            id="save-file-btn"
            disabled={isSaving || !hasUnsavedChanges}
            onClick={handleSave}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-md shadow-sky-650/10 focus:outline-none"
          >
            {isSaving ? (
              <>
                <Loader className="w-3.5 h-3.5 animate-spin" />
                Writing...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save to Host
              </>
            )}
          </button>

          <button
            id="close-editor-btn"
            onClick={handleCloseAttempt}
            className="p-1 px-2 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors rounded-lg cursor-pointer"
            title="Close Editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Main Content with Line Numbers & Code Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-[#0d1117] relative">
        {/* Line Numbers column */}
        <div className="w-12 bg-slate-900 border-r border-slate-800 select-none py-4 text-right pr-3 font-mono text-xs text-slate-500 leading-6 overflow-hidden hidden sm:block">
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className="h-6">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area Code Inputs */}
        <textarea
          id="visual-code-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="flex-1 p-4 bg-transparent resize-none font-mono text-xs text-slate-300 leading-6 border-0 focus:outline-none focus:ring-0 overflow-y-auto selection:bg-slate-800 select-all"
          placeholder="File content is empty. Type stuff here as you please..."
          style={{ whiteSpace: "pre", tabSize: 4 }}
        />
      </div>

      {/* Code Editor Footer stats */}
      <div className="bg-slate-900 border-t border-slate-800 px-6 py-2.5 text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <span>LINES: {lineCount}</span>
          <span className="text-slate-700">|</span>
          <span>SIZE: {content.length} characters</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-600">UTF-8 File Content</span>
          <span className="text-slate-700">|</span>
          <span className="text-sky-500 font-semibold uppercase">Local Session</span>
        </div>
      </div>

      {/* EXIT WARNING CONFIRM DIALOG OVERLAY */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-500">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-slate-100">Unsaved Modification Detected</h3>
                <p className="text-[11px] text-slate-400">Do you wish to exit without saving file modifications?</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed bg-slate-950 p-2.5 rounded border border-slate-850 font-mono">
              Changes to "{fileName}" will be discarded.
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="px-3 py-1.5 border border-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Go Back to Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  onClose();
                }}
                className="px-3 py-1.5 bg-red-650 hover:bg-red-600 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-md shadow-red-950/25"
              >
                Discard & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
