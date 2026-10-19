/** Quote every field and guard formula markers even behind whitespace/control characters. */
export function employeeCsv(rows: string[][]): string {
  return rows.map(row => row.map(value => {
    const safe = /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(value)
      || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
}

const encoder = new TextEncoder();
const spreadsheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationshipNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function cellText(value: string): string {
  // Escape literal OOXML escape sequences before encoding XML-forbidden controls.
  return value.replace(/_x[0-9a-f]{4}_/gi, match => `_x005F_${match.slice(1)}`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,
      char => `_x${char.charCodeAt(0).toString(16).padStart(4, '0')}_`)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r/g, '&#13;');
}

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + (n - 1) % 26) + name;
  }
  return name;
}

/** A genuine XLSX workbook: every supplied value is an inline string, never a formula. */
export function employeeXlsx(rows: string[][]): Uint8Array {
  if (rows.length > 1_048_576 || rows.some(row => row.length > 16_384)) {
    throw new RangeError('Employee export exceeds Excel worksheet dimensions');
  }
  const sheet = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) =>
    `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${cellText(value)}</t></is></c>`
  ).join('')}</row>`).join('');
  return zip([
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${relationshipNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<workbook xmlns="${spreadsheetNs}" xmlns:r="${relationshipNs}">`
      + '<sheets><sheet name="Employees" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="${relationshipNs}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${spreadsheetNs}"><sheetData>${sheet}</sheetData></worksheet>`],
  ]);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Store-only ZIP with standard local headers, central directory and CRC32 checksums. */
function zip(files: [string, string][]): Uint8Array {
  const entries = files.map(([name, xml]) => {
    const data = encoder.encode(declaration + xml);
    return { name: encoder.encode(name), data, crc: crc32(data), offset: 0 };
  });
  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
  const directorySize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  if (localSize + directorySize + 22 > 0xffffffff) throw new RangeError('Employee workbook exceeds ZIP size limit');
  const bytes = new Uint8Array(localSize + directorySize + 22);
  const view = new DataView(bytes.buffer);
  let position = 0;
  const u16 = (value: number) => { view.setUint16(position, value, true); position += 2; };
  const u32 = (value: number) => { view.setUint32(position, value, true); position += 4; };
  const write = (value: Uint8Array) => { bytes.set(value, position); position += value.length; };
  for (const entry of entries) {
    entry.offset = position;
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(0); u16(33);
    u32(entry.crc); u32(entry.data.length); u32(entry.data.length);
    u16(entry.name.length); u16(0); write(entry.name); write(entry.data);
  }
  for (const entry of entries) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(0); u16(33);
    u32(entry.crc); u32(entry.data.length); u32(entry.data.length);
    u16(entry.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(entry.offset);
    write(entry.name);
  }
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length);
  u32(directorySize); u32(localSize); u16(0);
  return bytes;
}
