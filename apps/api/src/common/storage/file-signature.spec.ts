import { detectFileType } from './file-signature';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

describe('detectFileType', () => {
  it('recognises a PDF and a PNG by their content', async () => {
    await expect(detectFileType(PDF)).resolves.toEqual({ mime: 'application/pdf', ext: 'pdf' });
    await expect(detectFileType(PNG)).resolves.toEqual({ mime: 'image/png', ext: 'png' });
  });

  it('returns undefined for plain text, whatever the file is called', async () => {
    await expect(detectFileType(Buffer.from('just text, not a document'))).resolves.toBeUndefined();
  });
});
