/** How long the downloaded copy stays addressable; the browser reads it right after the click. */
const REVOKE_AFTER_MS = 60_000;

/** Offers `blob` to the user as a download named `fileName`. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  // Some browsers (Safari, older Firefox) ignore a click on a link outside the document, and
  // may still be reading the object URL when an immediate revoke would cut it off.
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
