/**
 * Pure parsing for bulk knowledge import (runs in the browser and in tests).
 *
 * Accepted inputs
 *   .md / .txt  one document; the first "# Heading" is the title (else the file
 *               name). A file with two or more top-level "# " headings is split
 *               into one document per heading.
 *   .csv        header row with `title` and `content`; optional `type`
 *               (procedure | faq | guide). Quoted fields may contain commas,
 *               doubled quotes and line breaks.
 *
 * Nothing here trusts the content: it is only split and measured. Validation
 * limits are enforced again on the server.
 */
import { DOCUMENT_TYPES, type DocumentType } from '@/lib/db/case-categories';

export const IMPORT_MAX_DOCUMENTS = 200;
export const IMPORT_MAX_CONTENT_CHARS = 50_000;
export const IMPORT_MAX_TITLE_CHARS = 255;

export type ParsedDocument = {
  title: string;
  type: DocumentType;
  content: string;
  source: string;
  /** Set when the document cannot be imported as-is. */
  problem?: string;
};

function clean(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function baseName(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim();
}

function finish(
  title: string,
  type: DocumentType,
  content: string,
  source: string
): ParsedDocument {
  const doc: ParsedDocument = {
    title: title.trim(),
    type,
    content: content.trim(),
    source
  };
  if (!doc.title) doc.problem = 'Missing title';
  else if (doc.title.length > IMPORT_MAX_TITLE_CHARS)
    doc.problem = `Title longer than ${IMPORT_MAX_TITLE_CHARS} characters`;
  else if (!doc.content) doc.problem = 'Empty content';
  else if (doc.content.length > IMPORT_MAX_CONTENT_CHARS)
    doc.problem = `Content longer than ${IMPORT_MAX_CONTENT_CHARS} characters`;
  return doc;
}

export function parseTextDocument(
  fileName: string,
  raw: string,
  defaultType: DocumentType
): ParsedDocument[] {
  const text = clean(raw);
  const lines = text.split('\n');
  const headingIndexes: number[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (!inFence && /^# +\S/.test(line)) headingIndexes.push(index);
  });

  if (headingIndexes.length >= 2) {
    return headingIndexes.map((start, i) => {
      const end = headingIndexes[i + 1] ?? lines.length;
      const title = lines[start].replace(/^# +/, '');
      return finish(
        title,
        defaultType,
        lines.slice(start + 1, end).join('\n'),
        `${fileName} §${i + 1}`
      );
    });
  }

  if (
    headingIndexes.length === 1 &&
    lines.slice(0, headingIndexes[0]).every((l) => !l.trim())
  ) {
    const start = headingIndexes[0];
    const title = lines[start].replace(/^# +/, '');
    return [finish(title, defaultType, lines.slice(start + 1).join('\n'), fileName)];
  }

  return [finish(baseName(fileName), defaultType, text, fileName)];
}

/** RFC 4180-style CSV into rows of fields. */
export function parseCsvRows(raw: string): string[][] {
  const text = clean(raw);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function parseCsvDocuments(
  fileName: string,
  raw: string,
  defaultType: DocumentType
): ParsedDocument[] {
  const rows = parseCsvRows(raw);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const titleCol = header.indexOf('title');
  const contentCol = header.indexOf('content');
  const typeCol = header.indexOf('type');
  if (titleCol === -1 || contentCol === -1) {
    return [
      {
        title: baseName(fileName),
        type: defaultType,
        content: '',
        source: fileName,
        problem: 'CSV needs a header row with "title" and "content" columns'
      }
    ];
  }
  return rows.slice(1).map((cells, i) => {
    const wanted = (cells[typeCol] ?? '').trim().toLowerCase();
    const type = (DOCUMENT_TYPES as readonly string[]).includes(wanted)
      ? (wanted as DocumentType)
      : defaultType;
    return finish(
      cells[titleCol] ?? '',
      type,
      cells[contentCol] ?? '',
      `${fileName} row ${i + 2}`
    );
  });
}

export function parseImportFile(
  fileName: string,
  raw: string,
  defaultType: DocumentType
): ParsedDocument[] {
  return /\.csv$/i.test(fileName)
    ? parseCsvDocuments(fileName, raw, defaultType)
    : parseTextDocument(fileName, raw, defaultType);
}
