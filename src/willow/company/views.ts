import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, type Row } from '../core'
import { addDays, isDate } from '../dates'
import { birthdayMonthDays } from '../profile'
import { audienceOf, currentMembership, matchesAudience } from './audience'
import { latestAnnouncements, latestFolders, preferencesFor } from './store'

function announcement(row: Row, acknowledgedAt: number | null = null) {
  return { id: row.announcement_id, versionId: row.id, version: row.version, title: row.title, body: row.body,
    startsOn: row.starts_on, endsOn: row.ends_on, pinned: !!row.pinned, ackRequired: !!row.ack_required,
    retired: !!row.retired, audience: audienceOf(row), acknowledgedAt }
}

async function foldersView(env: Bindings, rows: Row[]) {
  if (!rows.length) return []
  const versions = await all(env, `SELECT v.*,f.folder_id FROM wl_company_file_versions v JOIN wl_company_files f ON f.id=v.file_id
    WHERE f.folder_id IN (${rows.map(() => '?').join(',')}) ORDER BY v.version DESC`, ...rows.map(row => row.folder_id))
  return rows.map(row => {
    const inFolder = versions.filter(version => version.folder_id === row.folder_id)
    return { id: row.folder_id, versionId: row.id, version: row.version, name: row.name, audience: audienceOf(row), retired: !!row.retired,
      files: [...new Set(inFolder.map(version => version.file_id))].map(id => {
        const history = inFolder.filter(version => version.file_id === id)
        return { id, title: history[0].title, versions: history.map(version => ({ id: version.id, version: version.version, title: version.title,
          filename: version.filename, mediaType: version.media_type, size: version.size, sha256: version.sha256, uploadedAt: version.recorded_at })) }
      }) }
  })
}

function upcoming(month: number, day: number, today: string, after?:string): boolean {
  const end = addDays(today, 30), year = Number(today.slice(0, 4))
  return [year, year + 1].some(y => {
    let date = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if(month===2&&day===29&&!isDate(date))date=`${y}-02-28`
    return isDate(date) && date >= today && date <= end && (!after||date>after)
  })
}

async function celebrationView(env: Bindings, actor: Actor) {
  const [birthdays, anniversaries] = await Promise.all([
    birthdayMonthDays(env, actor.today),
    all(env, `SELECT p.person_id AS person,COALESCE(NULLIF(pe.preferred_name,''),pe.legal_name) AS name,
      p.start_date AS started,CAST(substr(p.start_date,6,2) AS INTEGER) AS month,CAST(substr(p.start_date,9,2) AS INTEGER) AS day
      FROM wl_company_preferences pref JOIN wl_people pe ON pe.id=pref.person_id JOIN wl_periods p ON p.person_id=pe.id
      WHERE pref.anniversary=1 AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?)`, actor.today, actor.today),
  ])
  const names = new Map((birthdays.length ? await all(env, `SELECT id,COALESCE(NULLIF(preferred_name,''),legal_name) AS name FROM wl_people WHERE id IN (${birthdays.map(() => '?').join(',')})`, ...birthdays.map(row => row.person)) : []).map(row => [row.id, row.name as string]))
  return [...birthdays.map(row => ({ person: row.person, name: names.get(row.person)!, kind: 'birthday', month: row.month, day: row.day })),
    ...anniversaries.filter(row=>upcoming(row.month,row.day,actor.today,row.started)).map(row => ({ person: row.person, name: row.name, kind: 'anniversary', month: row.month, day: row.day }))]
    .filter(row => upcoming(row.month, row.day, actor.today)).sort((a,b) => a.month-b.month || a.day-b.day || a.name.localeCompare(b.name))
}

/** Current delivery only. Privileged authoring never changes audience membership. */
export async function companyHome(env: Bindings, actor: Actor) {
  const [membership, publications, folders, preferences, acknowledgements, celebrations] = await Promise.all([
    currentMembership(env, actor), latestAnnouncements(env), latestFolders(env), preferencesFor(env, actor.personId),
    all(env, 'SELECT version_id,at FROM wl_company_acknowledgements WHERE member_id=?', actor.id), celebrationView(env, actor),
  ])
  return {
    announcements: publications.filter(row => !row.retired && row.starts_on <= actor.today && (!row.ends_on || row.ends_on >= actor.today) && matchesAudience(row, membership))
      .sort((a,b) => b.pinned-a.pinned || b.recorded_at-a.recorded_at).map(row => announcement(row, acknowledgements.find(ack => ack.version_id === row.id)?.at ?? null)),
    folders: await foldersView(env, folders.filter(row => !row.retired && matchesAudience(row, membership))),
    celebrations,
    preferences: { birthday: !!preferences?.birthday, anniversary: !!preferences?.anniversary },
  }
}

export async function companyAdmin(env: Bindings, actor: Actor) {
  requirePermission(actor, 'people.manage')
  const [announcements, folders, history, folderHistory, receipts, locations, departments] = await Promise.all([
    latestAnnouncements(env), latestFolders(env), all(env, 'SELECT * FROM wl_company_announcement_versions ORDER BY version DESC'),
    all(env, 'SELECT * FROM wl_company_folder_versions ORDER BY version DESC'),
    all(env, `SELECT a.version_id AS versionId,a.at,m.id AS member,m.name FROM wl_company_acknowledgements a JOIN wl_members m ON m.id=a.member_id`),
    all(env, 'SELECT id,name FROM wl_locations ORDER BY name'), all(env, 'SELECT id,name FROM wl_departments ORDER BY name'),
  ])
  return { announcements: announcements.map(row => ({ ...announcement(row), history: history.filter(v => v.announcement_id === row.announcement_id).map(v => announcement(v)) })),
    folders: (await foldersView(env, folders)).map(row => ({ ...row, history: folderHistory.filter(v => v.folder_id === row.id).map(v => ({ id:v.id,version:v.version,name:v.name,audience:audienceOf(v),retired:!!v.retired })) })),
    acknowledgements: receipts, locations, departments }
}
