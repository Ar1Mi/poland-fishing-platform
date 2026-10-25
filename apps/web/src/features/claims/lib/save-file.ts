/** Offers `blob` to the user as a download named `fileName`. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // The click has started the download; the object URL is no longer needed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
