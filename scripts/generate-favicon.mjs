import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourceFile = path.join(projectRoot, 'src/favicon.svg');
const icoFile = path.join(projectRoot, 'src/favicon.ico');
const source = await readFile(sourceFile);

const png256 = await sharp(source).resize(256, 256).png().toBuffer();

// ICO supports PNG-compressed frames. A single 256px frame provides a sharp,
// compact fallback for browsers and crawlers that request /favicon.ico.
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Image type: icon
icoHeader.writeUInt16LE(1, 4); // Image count
icoHeader.writeUInt8(0, 6); // 0 represents 256px
icoHeader.writeUInt8(0, 7);
icoHeader.writeUInt8(0, 8); // No palette
icoHeader.writeUInt8(0, 9);
icoHeader.writeUInt16LE(1, 10); // Color planes
icoHeader.writeUInt16LE(32, 12); // Bits per pixel
icoHeader.writeUInt32LE(png256.length, 14);
icoHeader.writeUInt32LE(icoHeader.length, 18);

await writeFile(icoFile, Buffer.concat([icoHeader, png256]));

console.log('Generated transparent-mark favicon.ico.');
