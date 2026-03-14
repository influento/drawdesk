import { decompressFromBase64, compressToBase64 } from "lz-string";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ExcalidrawData {
  type?: string;
  version?: number;
  elements: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
}

/**
 * Extract Excalidraw JSON from an .excalidraw.md file.
 * Handles both ```json and ```compressed-json formats.
 */
export function parseExcalidrawMd(content: string): { data: ExcalidrawData; compressed: boolean } {
  const jsonRegex = /%%[\s\S]*?```json\s*\n([\s\S]*?)\n\s*```[\s\S]*?%%/;
  const jsonMatch = content.match(jsonRegex);
  if (jsonMatch && jsonMatch[1]) {
    return { data: JSON.parse(jsonMatch[1].trim()), compressed: false };
  }

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
export function buildExcalidrawMd(
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
