// Older import versions could unpack unmapped ZIP files into FILES without an
// owner row. Unknown loose bytes cannot silently survive an erasure. Known
// native, retained and staged import references remain governed by their class.
import type { Bindings } from '../../auth.server'
import { one } from '../core'

export async function unclaimedFiles(env: Bindings) {
  let cursor: string | undefined, count = 0
  do {
    const page = await env.FILES.list({ prefix: 'sha256/', cursor })
    for (const object of page.objects) {
      const sha = object.key.slice('sha256/'.length)
      const row = await one<{ n: number }>(env, `SELECT
        (SELECT COUNT(*) FROM wl_preboard_signatures WHERE sha256=?1) +
        (SELECT COUNT(*) FROM wl_sign_files WHERE sha256=?1) +
        (SELECT COUNT(*) FROM wl_document_versions WHERE sha256=?1) +
        (SELECT COUNT(*) FROM wl_hiring_resumes WHERE sha256=?1) +
        (SELECT COUNT(*) FROM wl_protected_certifications WHERE sha256=?1) +
        (SELECT COUNT(*) FROM wl_company_file_versions WHERE sha256=?1) +
        (SELECT COUNT(*) FROM wl_change_requests WHERE instr(attachments_json,?1)>0) +
        (SELECT COUNT(*) FROM wl_retained_records WHERE instr(row_json,?1)>0) +
        (SELECT COUNT(*) FROM wl_erasure_blobs WHERE sha256=?1 AND deleted=0) +
        (SELECT COUNT(*) FROM ik_jobs WHERE instr(plan_json,?1)>0) +
        (SELECT COUNT(*) FROM ik_d1_plan_chunks WHERE instr(body,?1)>0) +
        (SELECT COUNT(*) FROM ik_targets WHERE instr(value_json,?1)>0) AS n`, sha)
      if (!row!.n) count++
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return count
}
