import { insist } from '../core'
import type { FieldDefinition, FieldIdentity, FieldValue, SelectOption } from './types'

function object(value: unknown): Record<string, unknown> {
  insist(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid_field_definition')
  return value as Record<string, unknown>
}
function only(value: Record<string, unknown>, keys: string[]) {
  insist(Object.keys(value).every(key => keys.includes(key)), 'unexpected_field_property')
}
function text(value: unknown, max = 200): string {
  insist(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'invalid_field_text')
  return value
}

/** Strict Gregorian calendar date, independent of timezone and Date's rollover behaviour. */
export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return year > 0 && month >= 1 && month <= 12 && day >= 1 &&
    day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

/** Normalize decimal spelling using strings only; JSON numbers and exponents are refused. */
export function canonicalDecimal(value: unknown): string {
  insist(typeof value === 'string' && value.length <= 1024 && /^-?\d+(\.\d+)?$/.test(value), 'invalid_field_number')
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const integer = whole.replace(/^0+(?=\d)/, '')
  const decimals = fraction.replace(/0+$/, '')
  const unsigned = integer + (decimals ? `.${decimals}` : '')
  return negative && unsigned !== '0' ? `-${unsigned}` : unsigned
}

/** Exact comparison; accepts decimal strings and never passes their magnitude through Number. */
export function compareDecimal(left: string, right: string): number {
  const a = canonicalDecimal(left), b = canonicalDecimal(right)
  const negative = a.startsWith('-'), otherNegative = b.startsWith('-')
  if (negative !== otherNegative) return negative ? -1 : 1
  const [ai, af = ''] = (negative ? a.slice(1) : a).split('.')
  const [bi, bf = ''] = (otherNegative ? b.slice(1) : b).split('.')
  const size = Math.max(af.length, bf.length)
  const ap = af.padEnd(size, '0'), bp = bf.padEnd(size, '0')
  const order = ai.length !== bi.length ? Math.sign(ai.length - bi.length) : ai !== bi ? (ai < bi ? -1 : 1) : ap === bp ? 0 : ap < bp ? -1 : 1
  return negative ? -order : order
}

export function validateCustomField(input: unknown): FieldIdentity {
  const value = object(input)
  only(value, ['key', 'classification'])
  insist(typeof value.key === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.key), 'invalid_field_key')
  insist(value.classification === 'general' || value.classification === 'hr' || value.classification === 'payroll', 'invalid_field_classification')
  return { key: value.key, classification: value.classification }
}

/** One definition parser for native writes, import plans, reports and export mappings. */
export function validateFieldDefinition(input: unknown): FieldDefinition {
  const value = object(input), rules = object(value.validation)
  only(value, ['effectiveFrom', 'label', 'type', 'required', 'employeeRead', 'managerRead', 'retired', 'validation'])
  insist(isISODate(value.effectiveFrom), 'invalid_field_date')
  for (const flag of ['required', 'employeeRead', 'managerRead', 'retired']) insist(typeof value[flag] === 'boolean', 'invalid_field_flag')
  const base = { effectiveFrom: value.effectiveFrom, label: text(value.label), required: value.required as boolean,
    employeeRead: value.employeeRead as boolean, managerRead: value.managerRead as boolean, retired: value.retired as boolean }
  switch (value.type) {
    case 'text': {
      only(rules, ['minLength', 'maxLength'])
      insist(Number.isSafeInteger(rules.maxLength) && Number(rules.maxLength) >= 1 && Number(rules.maxLength) <= 10000, 'invalid_field_length')
      insist(rules.minLength === undefined || (Number.isSafeInteger(rules.minLength) && Number(rules.minLength) >= 0 && Number(rules.minLength) <= Number(rules.maxLength)), 'invalid_field_length')
      return { ...base, type: 'text', validation: { maxLength: rules.maxLength as number, ...(rules.minLength === undefined ? {} : { minLength: rules.minLength as number }) } }
    }
    case 'number': case 'date': {
      only(rules, ['min', 'max'])
      const bound = (v: unknown) => { if (value.type === 'number') return canonicalDecimal(v); insist(isISODate(v), 'invalid_field_date'); return v }
      const min = rules.min === undefined ? undefined : bound(rules.min), max = rules.max === undefined ? undefined : bound(rules.max)
      insist(min === undefined || max === undefined || (value.type === 'number' ? compareDecimal(min, max) <= 0 : min <= max), 'invalid_field_bounds')
      return { ...base, type: value.type, validation: { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) } }
    }
    case 'boolean': only(rules, []); return { ...base, type: 'boolean', validation: {} }
    case 'select': {
      only(rules, ['options'])
      insist(Array.isArray(rules.options) && rules.options.length > 0 && rules.options.length <= 200, 'invalid_field_options')
      const options: SelectOption[] = rules.options.map(raw => {
        const option = object(raw); only(option, ['value', 'label'])
        return { value: text(option.value), label: text(option.label) }
      })
      insist(new Set(options.map(option => option.value)).size === options.length, 'duplicate_field_option')
      return { ...base, type: 'select', validation: { options } }
    }
    default: insist(false, 'invalid_field_type')
  }
}

/** Pass the exact stored definition version. Retirement never invalidates historical values. */
export function validateFieldValue(definition: FieldDefinition, input: unknown): FieldValue {
  const { effectiveFrom, label, type, required, employeeRead, managerRead, retired, validation } = definition
  const field = validateFieldDefinition({ effectiveFrom, label, type, required, employeeRead, managerRead, retired, validation })
  const empty = input === null || input === undefined || (typeof input === 'string' && input.trim() === '')
  insist(!field.required || !empty, 'required_field_value')
  if (empty) return null
  switch (field.type) {
    case 'text': {
      insist(typeof input === 'string', 'invalid_field_text')
      const length = Array.from(input).length
      insist(length >= (field.validation.minLength ?? 0) && length <= field.validation.maxLength, 'invalid_field_length')
      return input
    }
    case 'number': {
      const value = canonicalDecimal(input), { min, max } = field.validation
      insist((min === undefined || compareDecimal(value, min) >= 0) && (max === undefined || compareDecimal(value, max) <= 0), 'field_value_out_of_bounds')
      return value
    }
    case 'date': {
      insist(isISODate(input), 'invalid_field_date')
      const { min, max } = field.validation
      insist((min === undefined || input >= min) && (max === undefined || input <= max), 'field_value_out_of_bounds')
      return input
    }
    case 'boolean': insist(typeof input === 'boolean', 'invalid_field_boolean'); return input
    case 'select':
      insist(typeof input === 'string' && field.validation.options.some(option => option.value === input), 'invalid_field_option')
      return input
  }
}
