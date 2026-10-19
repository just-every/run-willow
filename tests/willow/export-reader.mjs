// Read a downloaded stored ZIP using its central directory, independent of the writer.
import assert from 'node:assert/strict'
import { crc32 } from 'node:zlib'
export function readZip(bytes) {
  const files = new Map(), end = bytes.length - 22
  assert.equal(bytes.readUInt32LE(end), 0x06054b50)
  const count = bytes.readUInt16LE(end + 10)
  let at = bytes.readUInt32LE(end + 16)
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(at), 0x02014b50)
    assert.equal(bytes.readUInt16LE(at + 10), 0)
    const size = bytes.readUInt32LE(at + 24), nameSize = bytes.readUInt16LE(at + 28)
    const name = bytes.subarray(at + 46, at + 46 + nameSize).toString('utf8')
    const local = bytes.readUInt32LE(at + 42)
    assert.equal(bytes.readUInt32LE(local), 0x04034b50)
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const data = bytes.subarray(start, start + size)
    assert.equal(data.length, size)
    assert.equal(crc32(data), bytes.readUInt32LE(at + 16), `ZIP checksum: ${name}`)
    assert.ok(!files.has(name), `unique entry: ${name}`)
    files.set(name, data)
    at += 46 + nameSize + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
  }
  assert.equal(at, end)
  return files
}
