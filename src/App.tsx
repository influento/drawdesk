import { useState, useCallback, useRef, useEffect } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { decompressFromBase64, compressToBase64 } from "lz-string";
import "./App.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ExcalidrawData {
  type?: string;
  version?: number;
  elements: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
}

type MdFormat = "json" | "compressed" | null;

/**
 * Extract Excalidraw JSON from an .excalidraw.md file.
 * Handles both ```json and ```compressed-json formats.
 * Returns the data and whether it was compressed.
 */
function parseExcalidrawMd(content: string): { data: ExcalidrawData; compressed: boolean } {
  // Try uncompressed first
  const jsonRegex = /%%[\s\S]*?```json\s*\n([\s\S]*?)\n\s*```[\s\S]*?%%/;
  const jsonMatch = content.match(jsonRegex);
  if (jsonMatch && jsonMatch[1]) {
    return { data: JSON.parse(jsonMatch[1].trim()), compressed: false };
  }

  // Try compressed
  const compressedRegex = /%%[\s\S]*?```compressed-json\s*\n([\s\S]*?)\n\s*```[\s\S]*?%%/;
  const compressedMatch = content.match(compressedRegex);
  if (compressedMatch && compressedMatch[1]) {
    const decompressed = decompressFromBase64(compressedMatch[1].trim());
    if (!decompressed) throw new Error("Failed to decompress LZ-string data");
    return { data: JSON.parse(decompressed), compressed: true };
  }

  throw new Error("Not a valid .excalidraw.md file");
}

/**
 * Re-wrap Excalidraw JSON into the .excalidraw.md format.
 * Preserves the original compression format.
 */
function buildExcalidrawMd(
  originalContent: string,
  data: ExcalidrawData,
  compressed: boolean
): string {
  const jsonStr = JSON.stringify(data, null, 2);
  const codeBlock = compressed
    ? `\`\`\`compressed-json\n${compressToBase64(jsonStr)}\n\`\`\``
    : `\`\`\`json\n${jsonStr}\n\`\`\``;

  const textElements = (data.elements as Array<{ type: string; text?: string; id?: string; isDeleted?: boolean }>)
    .filter((el) => el.type === "text" && !el.isDeleted && el.text)
    .map((el) => `${el.text} ^${el.id}`)
    .join("\n\n");

  const textSection = textElements ? `\n${textElements}\n` : "";

  // If original content has the markdown structure, replace the code block
  const anyCodeBlockRegex = /%%[\s\S]*?```(?:compressed-)?json\s*\n[\s\S]*?\n\s*```[\s\S]*?%%/;
  if (anyCodeBlockRegex.test(originalContent)) {
    const updatedContent = originalContent.replace(
      anyCodeBlockRegex,
      `%%\n## Drawing\n${codeBlock}\n%%`
    );
    const textSectionRegex = /## Text Elements\n[\s\S]*?(?=\n%%)/;
    if (textSectionRegex.test(updatedContent)) {
      return updatedContent.replace(
        textSectionRegex,
        `## Text Elements${textSection}`
      );
    }
    return updatedContent;
  }

  return `---
excalidraw-plugin: parsed
tags: [excalidraw]
---
==⚠  Switch to EXCALIDRAW VIEW in Obsidian...⚠==

# Excalidraw Data

## Text Elements${textSection}
%%
## Drawing
${codeBlock}
%%`;
}

function App() {
  const [excalidrawData, setExcalidrawData] = useState<ExcalidrawData | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isMdFormat, setIsMdFormat] = useState(false);
  const [wasCompressed, setWasCompressed] = useState(false);
  const [originalMdContent, setOriginalMdContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const currentDataRef = useRef<ExcalidrawData | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    if (data.appState) {
      data.appState.theme = "dark";
    } else {
      data.appState = { theme: "dark" };
    }

    setFilePath(path);
    setExcalidrawData(data);
    currentDataRef.current = data;
  }, []);

  const openFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Excalidraw",
          extensions: ["excalidraw", "excalidraw.md"],
        },
      ],
    });

    if (!selected) return;
    try {
      await loadFile(selected);
    } catch (e: any) {
      setError(e.message || "Failed to open file");
    }
  }, [loadFile]);

  // Check for CLI file argument on startup
  useEffect(() => {
    invoke<string | null>("get_cli_file").then(async (path) => {
      if (!path) return;
      try {
        // Try reading first — if it fails, file doesn't exist
        const content = await readTextFile(path);
        // File exists — try to parse it
        try {
          await loadFile(path);
        } catch (e: any) {
          setError(e.message || "Failed to parse file");
        }
      } catch {
        // File doesn't exist — create a new drawing with save path pre-set
        const blank: ExcalidrawData = {
          elements: [],
          appState: { theme: "dark" },
          files: {},
        };
        setFilePath(path);
        setIsMdFormat(path.endsWith(".excalidraw.md"));
        setOriginalMdContent("");
        setExcalidrawData(blank);
        currentDataRef.current = blank;
      }
    });
  }, [loadFile]);

  const newDrawing = useCallback(() => {
    setExcalidrawData({
      elements: [],
      appState: { theme: "dark" },
      files: {},
    });
    setFilePath(null);
    setIsMdFormat(false);
    setOriginalMdContent("");
    currentDataRef.current = { elements: [], appState: { theme: "dark" }, files: {} };
  }, []);

  const saveFile = useCallback(async () => {
    if (!currentDataRef.current) return;

    let targetPath = filePath;

    if (!targetPath) {
      const savePath = await save({
        filters: [
          {
            name: "Excalidraw",
            extensions: ["excalidraw", "excalidraw.md"],
          },
        ],
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

  // Ctrl+S and Ctrl+O handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        openFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        newDrawing();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveFile, openFile, newDrawing]);

  const handleChange = useCallback(
    (
      elements: readonly any[],
      appState: Record<string, any>,
      files: Record<string, any>
    ) => {
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

      // Debounced auto-save (5 seconds after last change)
      if (filePath) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          saveFile();
        }, 5000);
      }
    },
    [filePath, saveFile]
  );

  // Welcome screen when no file is loaded
  if (!excalidrawData) {
    return (
      <div className="welcome-screen">
        <h1>drawdesk</h1>
        <p>Excalidraw viewer/editor for .excalidraw and .excalidraw.md files</p>
        <div className="welcome-buttons">
          <button className="welcome-open-btn" onClick={newDrawing}>
            New Drawing
          </button>
          <button className="welcome-open-btn" onClick={openFile}>
            Open File
          </button>
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
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
            excalidrawApiRef.current = api;
          }}
          initialData={{
            elements: excalidrawData.elements,
            appState: {
              ...excalidrawData.appState,
              theme: "dark",
            } as any,
            files: excalidrawData.files as any,
          }}
          onChange={handleChange as any}
          theme="dark"
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
