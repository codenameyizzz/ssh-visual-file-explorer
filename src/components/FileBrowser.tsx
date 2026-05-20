import React, { useEffect, useRef, useState } from "react";
import { SSHCredentials, FileItem } from "../types";
import { 
  Folder, File, Download, Edit, Trash2, LogOut, RefreshCw, 
  Search, FolderPlus, FilePlus, ChevronRight, Home, HardDrive, Upload, 
  ArrowUp, AlertCircle, Calendar, Shield, Cpu, Loader, AlertTriangle
} from "lucide-react";

interface FileBrowserProps {
  credentials: SSHCredentials;
  initialPath: string;
  onDisconnect: () => void;
  onEditFile: (filePath: string, fileName: string) => void;
  onShowToast: (message: string, type: "success" | "error" | "info") => void;
}

const MAX_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024;

export default function FileBrowser({ credentials, initialPath, onDisconnect, onEditFile, onShowToast }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "folders" | "files">("all");
  
  // Create File / Folder States
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Delete File States
  const [deleteCandidate, setDeleteCandidate] = useState<FileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Buffer for raw path editing
  const [manualPath, setManualPath] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const base64Payload = result.split(",")[1];
        if (!base64Payload) {
          reject(new Error("Failed to read the selected file."));
          return;
        }
        resolve(base64Payload);
      };
      reader.onerror = () => reject(new Error("Failed to read the selected file."));
      reader.readAsDataURL(file);
    });

  const loadDirectory = async (targetPath: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/ssh/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials, path: targetPath }),
      });
      
      const result = await response.json();
      if (result.success) {
        setFiles(result.files);
        setCurrentPath(result.currentPath);
        setManualPath(result.currentPath);
        // Toast if it is a fresh directory load
        if (targetPath && targetPath !== currentPath) {
          onShowToast(`Loaded: ${result.currentPath}`, "success");
        }
      } else {
        onShowToast(result.error || "Failed to load directory files.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message || "Failed to communicate with remote host files.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadDirectory(initialPath);
  }, []);

  // Format Helper: Size conversion
  const formatBytes = (bytes: number) => {
    if (!bytes && bytes !== 0) return "--";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Format Helper: Date conversion
  const formatDate = (ms: number) => {
    if (!ms) return "--";
    return new Date(ms).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Directory traversal helpers
  const handleFolderClick = (item: FileItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path);
    }
  };

  const handleGoUp = () => {
    if (currentPath === "/" || !currentPath) return;
    const parts = currentPath.split("/");
    parts.pop();
    const upPath = parts.join("/") || "/";
    loadDirectory(upPath);
  };

  const handleBreadcrumbClick = (index: number, segments: string[]) => {
    const targetPath = "/" + segments.slice(0, index + 1).join("/");
    loadDirectory(targetPath);
  };

  const handleManualPathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPath.trim()) {
      loadDirectory(manualPath.trim());
    }
  };

  // CREATE FOLDER Action
  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsCreating(true);
    
    // Resolve absolute path for new folder
    const targetFolder = currentPath === "/" ? `/${newFolderName.trim()}` : `${currentPath}/${newFolderName.trim()}`;
    
    try {
      const response = await fetch("/api/ssh/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials, path: targetFolder }),
      });
      const result = await response.json();
      if (result.success) {
        onShowToast(`Folder "${newFolderName}" created successfully!`, "success");
        setNewFolderName("");
        setShowNewFolderModal(false);
        loadDirectory(currentPath);
      } else {
        onShowToast(result.error || "Failed to create remote directory folder.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message, "error");
    } finally {
      setIsCreating(false);
    }
  };

  // CREATE FILE Action
  const handleCreateFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    setIsCreating(true);
    
    // Resolve absolute path for new file
    const targetFile = currentPath === "/" ? `/${newFileName.trim()}` : `${currentPath}/${newFileName.trim()}`;
    
    try {
      const response = await fetch("/api/ssh/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials, path: targetFile, content: "" }), // empty initial content
      });
      const result = await response.json();
      if (result.success) {
        onShowToast(`File "${newFileName}" created successfully!`, "success");
        setNewFileName("");
        setShowNewFileModal(false);
        loadDirectory(currentPath);
        
        // Auto open the newly created file in the editor
        onEditFile(targetFile, newFileName.trim());
      } else {
        onShowToast(result.error || "Failed to create remote file.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message, "error");
    } finally {
      setIsCreating(false);
    }
  };

  // DELETE Action
  const handleDeleteConfirm = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/ssh/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials,
          path: deleteCandidate.path,
          isDirectory: deleteCandidate.isDirectory,
        }),
      });
      const result = await response.json();
      if (result.success) {
        onShowToast(`"${deleteCandidate.name}" deleted successfully.`, "success");
        setDeleteCandidate(null);
        loadDirectory(currentPath);
      } else {
        onShowToast(result.error || "Failed to delete file/folder.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // DOWNLOAD Action (Highly optimized visual download workflow)
  const handleDownloadItem = async (e: React.MouseEvent, item: FileItem) => {
    e.stopPropagation(); // Prevent folder double click
    onShowToast(`Preparing download for "${item.name}"...`, "info");
    
    try {
      // 1. Get temporary ticket token
      const response = await fetch("/api/ssh/download-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials,
          path: item.path,
          isDirectory: item.isDirectory,
        }),
      });
      const result = await response.json();
      
      if (result.success && result.token) {
        // 2. Trigger native download by creating invisible frame or linking anchor
        const downloadUrl = `/api/ssh/download?token=${result.token}`;
        
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.setAttribute("download", item.isDirectory ? `${item.name}.tar.gz` : item.name);
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        
        onShowToast(
          item.isDirectory 
            ? `Download started! Zipping "${item.name}" to .tar.gz format.` 
            : `Download of "${item.name}" initiated. Check your browser down-tray.`, 
          "success"
        );
      } else {
        onShowToast(result.error || "Failed to fetch download ticket.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message || "Failed to download item.", "error");
    }
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    e.target.value = "";

    if (!selectedFile) return;

    if (selectedFile.size === 0) {
      onShowToast("Selected file is empty.", "error");
      return;
    }

    if (selectedFile.size > MAX_UPLOAD_SIZE_BYTES) {
      onShowToast("Upload limit is 3 MB per file on this build.", "error");
      return;
    }

    const targetPath = currentPath === "/" ? `/${selectedFile.name}` : `${currentPath}/${selectedFile.name}`;
    const existingEntry = files.find((item) => item.path === targetPath);
    if (existingEntry && !window.confirm(`"${selectedFile.name}" already exists in this directory. Overwrite it?`)) {
      return;
    }

    setIsUploading(true);
    onShowToast(`Uploading "${selectedFile.name}" to remote host...`, "info");

    try {
      const contentBase64 = await readFileAsBase64(selectedFile);
      const response = await fetch("/api/ssh/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials,
          path: targetPath,
          fileName: selectedFile.name,
          contentBase64,
        }),
      });
      const result = await response.json();

      if (result.success) {
        onShowToast(`"${selectedFile.name}" uploaded successfully!`, "success");
        await loadDirectory(currentPath);
      } else {
        onShowToast(result.error || "Failed to upload file.", "error");
      }
    } catch (err: any) {
      onShowToast(err.message || "Failed to upload file.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  // Filter & search computation
  const filteredFiles = files.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = 
      filterType === "all" 
        ? true 
        : filterType === "folders" 
        ? item.isDirectory 
        : !item.isDirectory;
    return matchesSearch && matchesFilter;
  });

  // Calculate breadcrumbs paths
  const pathSegments = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans" id="file-browser-container">
      {/* Top Banner Control Rail */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">
                Connected: {credentials.username}@{credentials.host}
              </h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-mono border border-slate-200">
                PORT {credentials.port}
              </span>
            </div>
            <p className="text-slate-400 text-xs font-mono select-all mt-0.5" id="remote-path-summary">
              Current Directory: {currentPath}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            id="refresh-dir-btn"
            disabled={isLoading}
            onClick={() => loadDirectory(currentPath)}
            className="p-2 border border-slate-200 hover:border-slate-300 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh current directory"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-sky-500" : ""}`} />
          </button>

          <button
            id="create-folder-btn"
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-emerald-500" />
            New Folder
          </button>

          <button
            id="create-file-btn"
            onClick={() => setShowNewFileModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5 text-blue-500" />
            New File
          </button>

          <input
            ref={uploadInputRef}
            type="file"
            onChange={handleUploadFileChange}
            className="hidden"
          />

          <button
            id="upload-file-btn"
            onClick={handleUploadClick}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Upload a local file into the current remote directory"
          >
            {isUploading ? (
              <Loader className="w-3.5 h-3.5 animate-spin text-sky-500" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-sky-500" />
            )}
            Upload File
          </button>

          <button
            id="disconnect-host-btn"
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100/70 border border-red-200 rounded-lg text-xs font-semibold tracking-wide transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {/* Path Input Box & Filters */}
      <div className="bg-slate-100 px-6 py-2 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        <form onSubmit={handleManualPathSubmit} className="flex-1 flex gap-2">
          <button
            type="button"
            onClick={handleGoUp}
            disabled={currentPath === "/" || isLoading}
            className="px-2.5 bg-white border border-slate-200/80 hover:bg-slate-50 rounded-lg text-slate-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Go up one directory level"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          
          <input
            id="manual-path-box"
            type="text"
            placeholder="Type path (e.g. /home/cc/Faults_Playground)"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white border border-slate-200/80 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-white font-medium rounded-lg text-xs cursor-pointer"
          >
            Go Path
          </button>
        </form>

        <div className="flex items-center gap-2">
          {/* Quick status bar search filter */}
          <div className="min-w-[150px] relative">
            <input
              id="directory-search-input"
              type="text"
              placeholder="Filter names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200/80 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <div className="bg-white border border-slate-200/80 rounded-lg p-0.5 flex gap-1 text-[11px] font-medium shrink-0">
            <button
              onClick={() => setFilterType("all")}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filterType === "all" ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType("folders")}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filterType === "folders" ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Folders
            </button>
            <button
              onClick={() => setFilterType("files")}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filterType === "files" ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Files
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation segments */}
      <div className="bg-white px-6 py-2 border-b border-slate-200 shrink-0">
        <div className="flex items-center flex-wrap gap-1 text-xs text-slate-500 fill-slate-500 selection:bg-transparent">
          <button
            onClick={() => loadDirectory("/")}
            className="flex items-center gap-1 hover:text-sky-600 transition-colors font-medium p-1 rounded cursor-pointer"
          >
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-600">Root</span>
          </button>

          {pathSegments.map((segment, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <button
                onClick={() => handleBreadcrumbClick(index, pathSegments)}
                className={`hover:text-sky-600 transition-colors py-1 px-1.5 rounded cursor-pointer font-mono ${
                  index === pathSegments.length - 1 ? "text-slate-900 font-semibold bg-slate-50" : "text-slate-500"
                }`}
              >
                {segment}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main Table / Directory List Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-32 text-slate-450 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin"></div>
            </div>
            <p className="text-xs font-mono tracking-widest text-slate-500 uppercase">Synchronizing directory metadata...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="bg-white border border-slate-205 rounded-2xl p-20 text-center shadow-md animate-fade-in max-w-2xl mx-auto mt-8">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-800 tracking-tight">No directory elements matching specifications</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed">
              {searchQuery ? "Try altering your typing query filter" : "No folders or files were located in this remote directory path."}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/30 overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-550 text-[10px] font-bold tracking-wider uppercase select-none">
                    <td className="w-11 text-center py-4"></td>
                    <td className="py-4 px-4 font-sans tracking-wider">Name</td>
                    <td className="py-4 px-4 font-sans hidden sm:table-cell tracking-wider">Size</td>
                    <td className="py-4 px-4 font-sans hidden md:table-cell tracking-wider">Last Modified</td>
                    <td className="py-4 px-4 font-sans font-mono hidden xl:table-cell tracking-wider">Perms</td>
                    <td className="py-4 px-4 font-sans text-right pr-8 tracking-wider">Quick Tools</td>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 animate-fade-in">
                  {filteredFiles.map((item) => (
                    <tr
                      key={item.path}
                      onClick={() => item.isDirectory && handleFolderClick(item)}
                      className={`hover:bg-slate-50/50 transition-all duration-150 group text-xs text-slate-650 ${
                        item.isDirectory ? "cursor-pointer" : ""
                      }`}
                    >
                      {/* Icon */}
                      <td className="px-5 text-center">
                        {item.isDirectory ? (
                          <Folder className="w-4 h-4 text-amber-500 fill-amber-400 group-hover:scale-110 transition-transform duration-200" />
                        ) : (
                          <File className="w-4 h-4 text-slate-405 group-hover:scale-110 transition-transform duration-200" />
                        )}
                      </td>

                      {/* Name */}
                      <td className="py-4 px-4 font-mono font-semibold text-slate-800 tracking-tight select-all truncate max-w-[200px] md:max-w-xs">
                        {item.name}
                        {item.isSymlink && (
                          <span className="text-[10px] text-sky-500 italic font-sans ml-1.5 select-none">(Symlink)</span>
                        )}
                      </td>

                      {/* File Size */}
                      <td className="py-4 px-4 text-slate-500 font-mono hidden sm:table-cell select-none">
                        {item.isDirectory ? (
                          <span className="text-slate-400 italic text-[10px] bg-slate-100 border border-slate-200/60 px-2.5 py-0.5 rounded-lg font-sans">Folder</span>
                        ) : (
                          formatBytes(item.size)
                        )}
                      </td>

                      {/* Modified Date */}
                      <td className="py-4 px-4 text-slate-450 hidden md:table-cell select-none">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-350" />
                          <span className="font-sans font-light text-slate-500">{formatDate(item.mtime)}</span>
                        </div>
                      </td>

                      {/* Permissions octal representation */}
                      <td className="py-4 px-4 text-slate-450 font-mono hidden xl:table-cell select-none">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-slate-355" />
                          <span className="font-light">{item.permissions || "---"}</span>
                        </div>
                      </td>

                      {/* Quick File Operations tools */}
                      <td className="py-3.5 px-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 opacity-80 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          
                          {/* DIRECT WEB EDITING (Only for files) */}
                          {!item.isDirectory && (
                            <button
                              onClick={() => onEditFile(item.path, item.name)}
                              className="p-1 px-2 border border-slate-200/80 hover:border-sky-300 hover:text-sky-600 rounded bg-white text-slate-500 transition-colors shadow-sm flex items-center gap-1 cursor-pointer hover:bg-sky-50"
                              title="Edit text file content"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-semibold tracking-wide">Edit</span>
                            </button>
                          )}

                          {/* DOWNLOAD TO LOCAL (Files directly, folder packed recursively) */}
                          <button
                            onClick={(e) => handleDownloadItem(e, item)}
                            className="p-1 px-2 border border-slate-200/80 hover:border-emerald-300 hover:text-emerald-600 rounded bg-white text-slate-500 transition-colors shadow-sm flex items-center gap-1 cursor-pointer hover:bg-emerald-50"
                            title={item.isDirectory ? "Download folder packed as .tar.gz" : "Download file to local"}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold tracking-wide">
                              {item.isDirectory ? "Tarball" : "Download"}
                            </span>
                          </button>

                          {/* DELETE */}
                          <button
                            onClick={() => setDeleteCandidate(item)}
                            className="p-1.5 border border-slate-200/80 hover:border-red-200 hover:bg-red-50 hover:text-red-600 rounded bg-white text-slate-500 transition-colors shadow-sm cursor-pointer"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CREATE NEW FOLDER DIALOG MODAL */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-205 w-full max-w-sm shadow-2xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-emerald-500" />
                Create Folder
              </h3>
              <button
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName("");
                }}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1.5">
                  Folder Namespace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. reproduction_results"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/55 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-950/10 focus:border-slate-800 transition-all"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewFolderModal(false);
                    setNewFolderName("");
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 shadow-md shadow-slate-900/10 transition-colors"
                >
                  {isCreating ? "Creating..." : "Create Folder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW FILE DIALOG MODAL */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-sm shadow-xl animate-scale-in">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <FilePlus className="w-4 h-4 text-blue-500" />
                Create New File
              </h3>
              <button
                onClick={() => {
                  setShowNewFileModal(false);
                  setNewFileName("");
                }}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateFileSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  File Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. index.js or config.json"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewFileModal(false);
                    setNewFileName("");
                  }}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deleteCandidate && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-sm shadow-xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Confirm Deletion</h3>
                <p className="text-[11px] text-slate-400">This action is recursive and cannot be undone</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed font-mono select-all bg-slate-50 p-2.5 rounded border border-slate-100">
              {deleteCandidate.path}
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50"
              >
                No, Keep It
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
