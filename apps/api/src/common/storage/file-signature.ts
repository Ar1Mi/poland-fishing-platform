/** Type of a file from its content (magic bytes), not from the name or the declared type. */
export interface DetectedFileType {
  mime: string;
  ext: string;
}

/**
 * `file-type` is ESM-only and the API is compiled to CommonJS: it is loaded with a dynamic
 * `import()`, as @nestjs/common does in its FileTypeValidator.
 */
export async function detectFileType(content: Buffer): Promise<DetectedFileType | undefined> {
  const { fileTypeFromBuffer } = await import('file-type');
  const type = await fileTypeFromBuffer(content);
  return type ? { mime: type.mime, ext: type.ext } : undefined;
}
