import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveFile, resolveFiles, resolveFileUrl, resolveFileBase64 } from '../../src/lib/upload.js';

const tmpDir = path.join(os.tmpdir(), 'signwell-upload-test-' + Date.now());

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('upload', () => {
  it('resolves a URL input', async () => {
    const result = await resolveFile('https://example.com/contract.pdf');
    expect(result.file_url).toBe('https://example.com/contract.pdf');
    expect(result.name).toBe('contract.pdf');
    expect(result.file_base64).toBeUndefined();
  });

  it('resolves a local file', async () => {
    const filePath = path.join(tmpDir, 'test.pdf');
    fs.writeFileSync(filePath, 'fake pdf content');
    const result = await resolveFile(filePath);
    expect(result.name).toBe('test.pdf');
    expect(result.file_base64).toBeDefined();
    expect(result.file_url).toBeUndefined();
  });

  it('throws for non-existent file', async () => {
    await expect(resolveFile('/nonexistent/file.pdf')).rejects.toThrow('File not found');
  });

  it('resolveFileUrl returns file_url', async () => {
    const result = await resolveFileUrl('https://example.com/doc.pdf');
    expect(result.file_url).toBe('https://example.com/doc.pdf');
    expect(result.name).toBe('doc.pdf');
  });

  it('resolveFileBase64 reads base64 from file', async () => {
    const b64Path = path.join(tmpDir, 'encoded.txt');
    fs.writeFileSync(b64Path, 'SGVsbG8gV29ybGQ=');
    const result = await resolveFileBase64(b64Path, 'document.pdf');
    expect(result.name).toBe('document.pdf');
    expect(result.file_base64).toBe('SGVsbG8gV29ybGQ=');
  });

  it('resolveFileBase64 throws for non-existent file', async () => {
    await expect(resolveFileBase64('/nonexistent.txt', 'doc.pdf')).rejects.toThrow('Base64 file not found');
  });

  it('resolveFiles throws when no files provided', async () => {
    await expect(resolveFiles()).rejects.toThrow('At least one file is required');
  });

  it('resolveFiles handles multiple local files', async () => {
    const file1 = path.join(tmpDir, 'a.pdf');
    const file2 = path.join(tmpDir, 'b.pdf');
    fs.writeFileSync(file1, 'content1');
    fs.writeFileSync(file2, 'content2');
    const result = await resolveFiles([file1, file2]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('a.pdf');
    expect(result[1].name).toBe('b.pdf');
  });

  it('resolveFiles handles mixed local and URL', async () => {
    const file1 = path.join(tmpDir, 'local.pdf');
    fs.writeFileSync(file1, 'content');
    const result = await resolveFiles([file1], ['https://example.com/remote.pdf']);
    expect(result).toHaveLength(2);
    expect(result[0].file_base64).toBeDefined();
    expect(result[1].file_url).toBeDefined();
  });
});
