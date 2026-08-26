#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(directory, '../assets/bestprice-logo.svg');
const output = path.join(directory, 'bestprice-mcp-logo-1024.png');

const mark = await sharp(source)
  .resize({ width: 592, height: 384, fit: 'contain' })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: '#ffffff',
  },
})
  .composite([{ input: mark, gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile(output);

const metadata = await sharp(output).metadata();
if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.format !== 'png') {
  throw new Error('Generated portal logo is not a 1024x1024 PNG');
}

console.log(output);
