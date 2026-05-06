import fs from 'node:fs';
import path from 'node:path';
import { lookup } from 'mime-types';
import { FileError } from './errors.js';
import type { DocumentFile } from '../types/api.js';

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.apple.pages',
  'application/vnd.apple.keynote',
  'application/vnd.apple.numbers',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
  'text/html',
]);

export function validateFileType(filePath: string): void {
  const mime = lookup(filePath);
  if (mime && !SUPPORTED_MIMES.has(mime)) {
    throw new FileError(
      `Unsupported file type: ${mime} for ${filePath}. Supported: PDF, DOC, DOCX, PAGES, PPT, PPTX, KEY, XLS, XLSX, NUMBERS, JPG, JPEG, PNG, TIFF, TIF, WEBP, HTML, HTM`,
    );
  }
}

export async function resolveFile(input: string): Promise<DocumentFile> {
  // URL input
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return {
      name: path.basename(new URL(input).pathname) || 'document',
      file_url: input,
    };
  }

  // Local file
  if (!fs.existsSync(input)) {
    throw new FileError(`File not found: ${input}`);
  }

  const stat = fs.statSync(input);
  if (!stat.isFile()) {
    throw new FileError(`Not a file: ${input}`);
  }
  if (stat.size === 0) {
    throw new FileError(`File is empty: ${input}`);
  }

  validateFileType(input);

  const buffer = fs.readFileSync(input);
  const base64 = buffer.toString('base64');

  return {
    name: path.basename(input),
    file_base64: base64,
  };
}

export async function resolveFileUrl(url: string): Promise<DocumentFile> {
  return {
    name: path.basename(new URL(url).pathname) || 'document',
    file_url: url,
  };
}

export async function resolveFileBase64(filePath: string, fileName: string): Promise<DocumentFile> {
  if (!fs.existsSync(filePath)) {
    throw new FileError(`Base64 file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    throw new FileError(`Base64 file is empty: ${filePath}`);
  }

  return {
    name: fileName,
    file_base64: content,
  };
}

export async function resolveFiles(
  files?: string[],
  fileUrls?: string[],
  fileB64?: string,
  fileB64Name?: string,
): Promise<DocumentFile[]> {
  const resolved: DocumentFile[] = [];

  if (files) {
    for (const f of files) {
      resolved.push(await resolveFile(f));
    }
  }

  if (fileUrls) {
    for (const url of fileUrls) {
      resolved.push(await resolveFileUrl(url));
    }
  }

  if (fileB64 && fileB64Name) {
    resolved.push(await resolveFileBase64(fileB64, fileB64Name));
  }

  if (resolved.length === 0) {
    throw new FileError('At least one file is required (--file, --file-url, or --file-b64)');
  }

  return resolved;
}
