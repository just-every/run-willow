import { mkdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'

export const evidenceDirectory = resolve(process.env.WILLOW_EVIDENCE_DIR ?? join(tmpdir(), 'willow-evidence'))
const inside = relative(process.cwd(), evidenceDirectory)
if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) throw new Error('WILLOW_EVIDENCE_DIR must be outside the checkout')
await mkdir(evidenceDirectory, { recursive: true })
