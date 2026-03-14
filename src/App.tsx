import { useState, useCallback, useRef, useEffect } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readFile, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { type ExcalidrawData, parseExcalidrawMd, buildExcalidrawMd } from "./excalidraw-md";
import { IMAGE_EXTENSIONS, imageToDataURL, mimeTypeForPath } from "./image";
import { getSystemTheme, themeAppState } from "./theme";
import "./App.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

function App() {
  const [excalidrawData, setExcalidrawData] = useState<ExcalidrawData | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isMdFormat, setIsMdFormat] = useState(false);
  const [wasCompressed, setWasCompressed] = useState(false);
  const [originalMdContent, setOriginalMdContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(getSystemTheme);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const currentDataRef = useRef<ExcalidrawData | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingImageRef = useRef<string | null>(null);

  // Follow system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const loadFile = useCallback(async (path: string) => {
    const content = await readTextFile(path);
    setError(null);

    const isMd = path.endsWith(".excalidraw.md");
    setIsMdFormat(isMd);

    let data: ExcalidrawData;
    if (isMd) {
      setOriginalMdContent(content);
      const result = parseExcalidrawMd(content);
      data = result.data;
      setWasCompressed(result.compressed);
    } else if (path.endsWith(".excalidraw")) {
      data = JSON.parse(content);
      setWasCompressed(false);
    } else {
      throw new Error("Not an Excalidraw file. Supported formats: .excalidraw, .excalidraw.md");
    }

    const tState = themeAppState(getSystemTheme());
    data.appState = { ...data.appState, ...tState };

    setFilePath(path);
    setExcalidrawData(data);
    currentDataRef.current = data;
  }, []);

  const openFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Excalidraw", extensions: ["excalidraw", "excalidraw.md"] }],
    });
    if (!selected) return;
    try {
      await loadFile(selected);
    } catch (e: any) {
      setError(e.message || "Failed to open file");
    }
  }, [loadFile]);

  const insertImageToCanvas = useCallback(async (uint8: Uint8Array, mimeType: string) => {
    const api = excalidrawApiRef.current;
    if (!api) return;

    const { dataUrl, width, height } = await imageToDataURL(uint8, mimeType);
    const fileId = crypto.randomUUID();

    api.addFiles([{
      id: fileId as any,
      dataURL: dataUrl as any,
      mimeType: "image/png" as any,
      created: Date.now(),
    }]);

    const appState = api.getAppState();
    const centerX = (-appState.scrollX + appState.width / 2) / appState.zoom.value;
    const centerY = (-appState.scrollY + appState.height / 2) / appState.zoom.value;

    api.updateScene({
      elements: [
        ...api.getSceneElements(),
        {
          type: "image",
          id: crypto.randomUUID(),
          fileId,
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
          angle: 0,
          strokeColor: "transparent",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          roundness: null,
          seed: Math.floor(Math.random() * 2e9),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2e9),
          isDeleted: false,
          groupIds: [],
          boundElements: null,
          link: null,
          locked: false,
          status: "saved",
          scale: [1, 1],
          crop: null,
        } as any,
      ],
    });
  }, []);

  // CLI startup: load file and/or queue image for insertion
  useEffect(() => {
    const init = async () => {
      const [path, imagePath] = await Promise.all([
        invoke<string | null>("get_cli_file"),
        invoke<string | null>("get_cli_image"),
      ]);

      if (imagePath) {
        pendingImageRef.current = imagePath;
      }

      if (path) {
        try {
          await readTextFile(path);
          try { await loadFile(path); } catch (e: any) { setError(e.message || "Failed to parse file"); }
        } catch {
          const blank: ExcalidrawData = { elements: [], appState: themeAppState(getSystemTheme()), files: {} };
          setFilePath(path);
          setIsMdFormat(path.endsWith(".excalidraw.md"));
          setOriginalMdContent("");
          setExcalidrawData(blank);
          currentDataRef.current = blank;
        }
      } else if (imagePath) {
        const blank: ExcalidrawData = { elements: [], appState: themeAppState(getSystemTheme()), files: {} };
        setOriginalMdContent("");
        setExcalidrawData(blank);
        currentDataRef.current = blank;
      }
    };
    init();
  }, [loadFile]);

  // Insert pending image once Excalidraw API is ready
  useEffect(() => {
    const imagePath = pendingImageRef.current;
    if (!imagePath || !apiReady) return;

    pendingImageRef.current = null;
    const doInsert = async () => {
      const uint8 = await readFile(imagePath);
      const mimeType = mimeTypeForPath(imagePath) || "image/png";
      await insertImageToCanvas(uint8, mimeType);
    };
    doInsert();
  }, [apiReady, insertImageToCanvas]);

  const newDrawing = useCallback(() => {
    const blank: ExcalidrawData = { elements: [], appState: themeAppState(getSystemTheme()), files: {} };
    setExcalidrawData(blank);
    setFilePath(null);
    setIsMdFormat(false);
    setOriginalMdContent("");
    currentDataRef.current = blank;
  }, []);

  const saveFile = useCallback(async () => {
    if (!currentDataRef.current) return;

    let targetPath = filePath;
    if (!targetPath) {
      const savePath = await save({
        filters: [{ name: "Excalidraw", extensions: ["excalidraw", "excalidraw.md"] }],
      });
      if (!savePath) return;
      targetPath = savePath;
      setFilePath(targetPath);
      setIsMdFormat(targetPath.endsWith(".excalidraw.md"));
    }

    const data = currentDataRef.current;
    let content: string;
    if (isMdFormat || targetPath.endsWith(".excalidraw.md")) {
      content = buildExcalidrawMd(originalMdContent, data, wasCompressed);
      setOriginalMdContent(content);
    } else {
      content = JSON.stringify(data, null, 2);
    }
    await writeTextFile(targetPath, content);
  }, [filePath, isMdFormat, wasCompressed, originalMdContent]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveFile(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "o") { e.preventDefault(); openFile(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); newDrawing(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveFile, openFile, newDrawing]);

  // Intercept paste: if clipboard text is an image file path, insert it
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!excalidrawData) return;

      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      const mimeType = mimeTypeForPath(text);
      if (!mimeType) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const resolvedPath = text.startsWith("~")
        ? await join(await homeDir(), text.slice(2))
        : text;
      if (!(await exists(resolvedPath))) return;

      const uint8 = await readFile(resolvedPath);
      await insertImageToCanvas(uint8, mimeType);
    };

    document.addEventListener("paste", handlePaste, { capture: true });
    return () => document.removeEventListener("paste", handlePaste, { capture: true });
  }, [excalidrawData, insertImageToCanvas]);

  const handleChange = useCallback(
    (elements: readonly any[], appState: Record<string, any>, files: Record<string, any>) => {
      currentDataRef.current = {
        type: "excalidraw",
        version: 2,
        elements: [...elements],
        appState: {
          gridSize: appState.gridSize,
          gridStep: appState.gridStep,
          viewBackgroundColor: appState.viewBackgroundColor,
          theme: appState.theme,
        },
        files,
      };

      if (filePath) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => saveFile(), 5000);
      }
    },
    [filePath, saveFile]
  );

  if (!excalidrawData) {
    return (
      <div className="welcome-screen">
        <h1>drawdesk</h1>
        <p>Excalidraw viewer/editor for .excalidraw and .excalidraw.md files</p>
        <div className="welcome-buttons">
          <button className="welcome-open-btn" onClick={newDrawing}>New Drawing</button>
          <button className="welcome-open-btn" onClick={openFile}>Open File</button>
        </div>
        <p>Ctrl+N / Ctrl+O</p>
        {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => { excalidrawApiRef.current = api; setApiReady(true); }}
          initialData={{
            elements: excalidrawData.elements,
            appState: { ...excalidrawData.appState, theme } as any,
            files: excalidrawData.files as any,
          }}
          onChange={handleChange as any}
          theme={theme}
          renderTopRightUI={() => (
            <div className="toolbar-inline">
              <button className="toolbar-btn" onClick={newDrawing}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New
              </button>
              <button className="toolbar-btn" onClick={openFile}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Open
              </button>
            </div>
          )}
        />
      </div>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}
      {filePath && <div className="file-path-indicator">{filePath}</div>}
    </div>
  );
}

export default App;
