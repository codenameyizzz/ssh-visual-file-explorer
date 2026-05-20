import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Loader, Play, RefreshCw, TerminalSquare } from "lucide-react";
import type { SSHCredentials } from "../types";

interface TerminalPanelProps {
  credentials: SSHCredentials;
  initialPath: string;
  onBack: () => void;
  onShowToast: (message: string, type: "success" | "error" | "info") => void;
}

interface TerminalEntry {
  id: string;
  command: string;
  cwd: string;
  nextCwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const PRESET_COMMANDS = [
  { label: "pwd", command: "pwd" },
  { label: "ls -la", command: "ls -la" },
  { label: "gemini", command: 'gemini -p "Summarize the current project folder."' },
  { label: "codex", command: 'codex "Summarize the current project folder."' },
];

export default function TerminalPanel({ credentials, initialPath, onBack, onShowToast }: TerminalPanelProps) {
  const [cwd, setCwd] = useState(initialPath || "");
  const [command, setCommand] = useState("");
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCwd(initialPath || "");
  }, [initialPath]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [entries, isRunning]);

  const runCommand = async (forcedCommand?: string) => {
    const nextCommand = (forcedCommand ?? command).trim();
    if (!nextCommand || isRunning) return;

    setIsRunning(true);
    onShowToast(`Running: ${nextCommand}`, "info");

    try {
      const response = await fetch("/api/ssh/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials,
          command: nextCommand,
          cwd,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false && typeof result.stdout === "undefined") {
        throw new Error(result.error || "Failed to run remote command.");
      }

      const entry: TerminalEntry = {
        id: Math.random().toString(36).slice(2),
        command: result.command || nextCommand,
        cwd: result.cwd || cwd,
        nextCwd: result.nextCwd || cwd,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      };

      setEntries((prev) => [...prev, entry]);
      setCwd(entry.nextCwd);
      setCommand("");
      setHistory((prev) => (prev[prev.length - 1] === nextCommand ? prev : [...prev, nextCommand]));
      setHistoryIndex(null);

      if (entry.exitCode === 0 || entry.exitCode === null) {
        onShowToast("Command completed.", "success");
      } else {
        onShowToast(`Command finished with exit code ${entry.exitCode}.`, "error");
      }
    } catch (err: any) {
      onShowToast(err.message || "Failed to run remote command.", "error");
    } finally {
      setIsRunning(false);
      inputRef.current?.focus();
    }
  };

  const handleHistoryNav = (direction: "up" | "down") => {
    if (!history.length) return;

    if (direction === "up") {
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex]);
      return;
    }

    if (historyIndex === null) return;
    const nextIndex = historyIndex + 1;
    if (nextIndex >= history.length) {
      setHistoryIndex(null);
      setCommand("");
      return;
    }

    setHistoryIndex(nextIndex);
    setCommand(history[nextIndex]);
  };

  const clearOutput = () => {
    setEntries([]);
    onShowToast("Terminal output cleared.", "info");
  };

  const outputSummary = useMemo(() => {
    if (!entries.length) {
      return "No commands executed yet.";
    }
    return `${entries.length} command(s) executed in this session`;
  }, [entries]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex flex-col gap-4 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-800 text-sky-400">
              <TerminalSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-wide">Remote Command Terminal</h3>
              <p className="text-[11px] text-slate-400 font-mono">{credentials.username}@{credentials.host}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearOutput}
              className="px-3 py-1.5 border border-slate-700 hover:border-slate-600 hover:bg-slate-800 rounded-lg text-xs text-slate-300"
            >
              Clear Output
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 border border-slate-700 hover:border-slate-600 hover:bg-slate-800 rounded-lg text-xs text-slate-300 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Browser
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-2">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400">Current Working Directory</label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="/home/cc"
            />
          </div>
          <div className="text-[11px] text-slate-500 font-mono">{outputSummary}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESET_COMMANDS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setCommand(preset.command)}
              className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-slate-600 hover:bg-slate-800 text-[11px] text-slate-300 flex items-center gap-1"
            >
              {preset.label === "gemini" || preset.label === "codex" ? <Bot className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runCommand();
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                handleHistoryNav("up");
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                handleHistoryNav("down");
              }
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-sm font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder='Type a command, for example: gemini -p "Explain this folder"'
          />
          <button
            type="button"
            disabled={isRunning || !command.trim()}
            onClick={() => runCommand()}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1.5"
          >
            {isRunning ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run
          </button>
        </div>
      </div>

      <div ref={outputRef} className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-xs bg-[#0d1117]">
        {entries.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-xl p-6 text-slate-500 leading-relaxed">
            Use this panel for semi-interactive SSH commands. It is well suited for `gemini -p "..."`, `codex "..."`, `git status`, `ls -la`, and other one-shot CLI commands.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-900 px-4 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="text-slate-200 break-all">$ cd {entry.cwd} && {entry.command}</div>
                <div className={`text-[11px] ${entry.exitCode === 0 || entry.exitCode === null ? "text-emerald-400" : "text-red-400"}`}>
                  exit {entry.exitCode ?? "?"} • next cwd {entry.nextCwd}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {entry.stdout && (
                  <pre className="whitespace-pre-wrap break-words text-slate-200">{entry.stdout}</pre>
                )}
                {entry.stderr && (
                  <pre className="whitespace-pre-wrap break-words text-red-300">{entry.stderr}</pre>
                )}
                {!entry.stdout && !entry.stderr && (
                  <div className="text-slate-500">(No output)</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
