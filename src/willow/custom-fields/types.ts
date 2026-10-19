/** Classification belongs to the stable identity; visibility flags are data, not authority. */
export type FieldClassification = 'general' | 'hr' | 'payroll'
export interface FieldIdentity { key: string; classification: FieldClassification }
export interface Recorded { recordedAt: number; recordedBy: string }
export interface CustomField extends FieldIdentity, Recorded { id: string }

export interface SelectOption { value: string; label: string }
export interface TextValidation { minLength?: number; maxLength: number }
/** Decimal strings are canonical: no exponent, leading zeros, trailing fractional zeros or -0. */
export interface NumberValidation { min?: string; max?: string }
export interface DateValidation { min?: string; max?: string }
export interface SelectValidation { options: SelectOption[] }

interface DefinitionBase {
  effectiveFrom: string
  label: string
  required: boolean
  employeeRead: boolean
  managerRead: boolean
  retired: boolean
}
export type FieldDefinition = DefinitionBase & (
  | { type: 'text'; validation: TextValidation }
  | { type: 'number'; validation: NumberValidation }
  | { type: 'date'; validation: DateValidation }
  | { type: 'boolean'; validation: Record<string, never> }
  | { type: 'select'; validation: SelectValidation }
)
/** A definition edit (including retirement) appends a complete version. */
export type FieldDefinitionVersion = FieldDefinition & Recorded & {
  id: string
  fieldId: string
  version: number
}
/** null explicitly clears an optional value; numbers remain decimal strings. */
export type FieldValue = string | boolean | null
export interface FieldValueRevision extends Recorded {
  id: string
  personId: string
  fieldId: string
  definitionVersionId: string
  effectiveFrom: string
  /** Orders corrections deterministically, including those recorded in the same millisecond. */
  sequence: number
  value: FieldValue
  correctsId: string | null
  origin: 'native' | 'import'
  /** Native change token or import target revision, fenced by guarded undo. */
  revision: string
}

/** Persist JSON.stringify(definition.validation) and JSON.stringify(revision.value). */
export interface FieldDefinitionRow {
  id: string; field_id: string; version: number; effective_from: string; label: string
  type: FieldDefinition['type']; required: 0 | 1; employee_read: 0 | 1; manager_read: 0 | 1
  validation_json: string; retired: 0 | 1; recorded_at: number; recorded_by: string
}
export interface FieldValueRow {
  id: string; person_id: string; field_id: string; definition_version_id: string
  effective_from: string; sequence: number; value_json: string; corrects_id: string | null
  origin: 'native' | 'import'; revision: string; recorded_at: number; recorded_by: string
}
