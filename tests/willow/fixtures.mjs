// Documented-shape fixtures for the BambooHR kit, with invented people only.
// The employee report uses BambooHR's documented API field names
// (documentation.bamboohr.com "List of field names", read 2026-10-11): id,
// employeeNumber, firstName, lastName, preferredName, workEmail, homeEmail,
// mobilePhone, address1, city, state, zipcode, country, dateOfBirth,
// hireDate, terminationDate, status, employmentStatus, jobTitle, department,
// location, supervisorEId, payRate, payType, paidPer. The balance CSV and the
// documents manifest are Willow's documented shapes (IMPORTING.md); BambooHR
// documents no single file for them. Real export fidelity is an owner trial.
import { deflateRawSync, crc32 } from 'node:zlib'

const csv = rows => rows.map(row => row.map(value => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(',')).join('\r\n') + '\r\n'

export const HEADERS = ['id', 'employeeNumber', 'firstName', 'lastName', 'preferredName', 'workEmail', 'homeEmail', 'mobilePhone', 'address1', 'city', 'state', 'zipcode', 'country', 'dateOfBirth', 'hireDate', 'terminationDate', 'status', 'employmentStatus', 'jobTitle', 'department', 'location', 'supervisorEId', 'payRate', 'payType', 'paidPer']

/** Rows: three active, one former, a repeated id, a missing hireDate, a conflict with an existing Willow person, an inactive row without a date. */
export function employeesCsv({ conflictingEmail }) {
  return csv([HEADERS,
    ['101', 'E101', 'Rowan', 'Hale', '', 'rowan.hale@example.com', 'rowan.home@example.com', '0400 000 101', '1 Example Street', 'Sydney', 'NSW', '2000', 'Australia', '1985-04-02', '2019-03-04', '', 'Active', 'Full-Time', 'Operations Lead', 'Warehouse', 'Parramatta', '', '98000.00 AUD', 'Salary', 'Year'],
    ['102', 'E102', 'Tamsin', 'Vale', 'Tam', 'tamsin.vale@example.com', '', '', '', '', '', '', '', '', '2021-07-12', '', 'Active', 'Part-Time', 'Support Specialist', 'Warehouse', 'Parramatta', '101', '38.50 AUD', 'Hourly', 'Hour'],
    ['103', 'E103', 'Idris', 'Penn', '', 'idris.penn@example.com', '', '', '', '', '', '', '', '', '2023-01-09', '', 'Active', 'Casual', 'Warehouse Assistant', 'Warehouse', 'Parramatta', '101', '', '', ''],
    ['104', 'E104', 'Juno', 'Ashby', '', 'juno.ashby@example.com', '', '', '', '', '', '', '', '', '2017-05-01', '2022-11-30', 'Inactive', 'Terminated', 'Accountant', 'Finance', 'Parramatta', '101', '85000.00 AUD', 'Salary', 'Year'],
    ['103', 'E103', 'Idris', 'Penn', '', 'idris.penn@example.com', '', '', '', '', '', '', '', '', '2023-01-09', '', 'Active', 'Casual', 'Warehouse Lead', 'Warehouse', 'Parramatta', '101', '', '', ''],
    ['105', 'E105', 'Marlo', 'Quist', '', 'marlo.quist@example.com', '', '', '', '', '', '', '', '', '', '', 'Active', 'Full-Time', 'Designer', 'Warehouse', 'Parramatta', '', '', '', ''],
    ['106', 'E106', 'Kit', 'Double', '', conflictingEmail, '', '', '', '', '', '', '', '', '2020-02-02', '', 'Active', 'Full-Time', 'Driver', 'Warehouse', 'Parramatta', '', '', '', ''],
    ['107', 'E107', 'Ola', 'Stray', '', 'ola.stray@example.com', '', '', '', '', '', '', '', '', '2018-02-02', '', 'Inactive', 'Full-Time', 'Picker', 'Warehouse', 'Parramatta', '', '', '', ''],
  ])
}

export const balancesCsv = csv([
  ['id', 'timeOffType', 'balance', 'units', 'asOf'],
  ['101', 'Annual Leave', '112.5', 'hours', '2026-06-30'],
  ['102', 'Annual Leave', '40', 'hours', '2026-06-30'],
  ['103', 'Annual Leave', '3', 'days', '2026-06-30'],
  ['102', 'Sick Leave', '20', 'hours', '2026-06-30'],
])

export const contractPdf = Buffer.from('%PDF-1.4\n% Employment contract for an invented person\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

function zip(files) {
  const locals = [], centrals = []
  let offset = 0
  for (const [name, text] of files) {
    const data = Buffer.from(text), packed = deflateRawSync(data), nameBytes = Buffer.from(name), crc = crc32(data)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, packed); centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + packed.length
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export function documentsZip({ extra = [] } = {}) {
  return zip([
    ['export/manifest.csv', csv([['file', 'id', 'category', 'title'], ['contract-101.pdf', '101', 'Employment contract', 'Employment contract'], ['id-102.pdf', '102', 'Passport scans', 'Passport']])],
    ['export/contract-101.pdf', contractPdf],
    ['export/id-102.pdf', contractPdf],
    ...extra,
  ])
}

export const pdf = (text) => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`)
