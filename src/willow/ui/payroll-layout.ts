import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { CSV_COLUMNS } from '../payroll'
import { ADP_GUIDE, layoutView } from '../payroll-layout'
import { payrollCustomColumnOptions, type PayrollColumn } from '../payroll-custom-fields'
import { checks, field, form, h, hidden, select, table } from './html'

export async function payrollLayoutSection(env: Bindings, actor: Actor) {
  const layout = await layoutView(env, actor), m = layout?.mapping ?? {}
  const [policies, customFields] = await Promise.all([
    all(env, 'SELECT id,name FROM wl_leave_policies ORDER BY name'),
    actor.owner ? payrollCustomColumnOptions(env, actor) : Promise.resolve([]),
  ])
  const columns: PayrollColumn[] = layout?.format === 'generic' ? m.columns : CSV_COLUMNS.map(source => ({ source, heading: source }))
  const standardRows = columns.flatMap((column, index) => CSV_COLUMNS.includes(column.source) ? [[
    h`${column.source.replaceAll('_', ' ')}${hidden('columnSource', column.source)}`,
    field('Heading for ' + column.source.replaceAll('_', ' '), 'columnHeading', { value: column.heading }),
    field('Order for ' + column.source.replaceAll('_', ' '), 'columnOrder', { type: 'number', value: index + 1 }),
  ]] : [])
  const selected = columns.map(column => column.source)
  const customRows = customFields.map((option, index) => {
    const configured = columns.find(column => column.source === option.source)
    return [checks('Include ' + option.label, 'customColumn', [{ value: option.source, label: option.label }], selected),
      field('Heading for ' + option.label, `heading.${option.source}`, { required: false, value: configured?.heading ?? option.source.slice(7) }),
      field('Order for ' + option.label, `order.${option.source}`, { type: 'number', required: false, value: configured ? columns.indexOf(configured) + 1 : columns.length + index + 1 })]
  })
  return h`<section class="card"><h2>Export layout</h2><p>${layout ? `Selected: ${layout.format === 'generic' ? 'Generic change CSV' : 'ADP RUN Time Sheet Import'}` : 'The owner must explicitly select a layout before a file can be previewed or exported.'}</p><p>Employee identifiers come from each employment period's payroll identifier. Units are hours. Calculation, tax and payments remain with your provider.</p>
${actor.owner ? h`<details><summary>Owner layout mapping</summary>${form('payroll.layout','/app/payroll',[hidden('format','generic'),table(['Willow field','Target column heading','Column order'], standardRows),
customRows.length ? h`<h3>Optional employee fields</h3><p>Choose general fields to include in the generic CSV. Values are taken at the pay period end. Each reader must have current access to the selected fields for every person in the file.</p>${table(['Include field','Target column heading','Column order'], customRows)}` : '',
h`<p>Generic CSV includes every reconciled start, end, terms, leave and reversal change with its effective dates and provider identifier.</p>`],'Select generic change CSV')}
${form('payroll.layout','/app/payroll',[hidden('format','adp-run'),field('Company code (IID or branch + ADP code)','company',{value:m.company??''}),select('Pay frequency','frequency',[{value:'W',label:'Weekly'},{value:'B',label:'Biweekly'},{value:'S',label:'Semimonthly'},{value:'M',label:'Monthly'},{value:'Q',label:'Quarterly'}],m.frequency??''),select('Rate code','rateCode',['BASE','RATE_2','RATE_3','RATE_4','RATE_5','HRLY4SLRY1'].map(value=>({value,label:value})),m.rateCode??''),field('Separate check (0–9)','separateCheck',{type:'number',value:m.separateCheck??''}),field('Worked department (optional numeric code)','department',{required:false,value:m.department??''}),table(['Leave policy','ADP earnings code'],policies.map(p=>[h`${p.name}${hidden('policy',p.id)}`,field('Earnings code for '+p.name,'earning',{required:false,value:m.earnings?.[p.id]??''})])),h`<p>Use your ADP Earnings Codes and Department Numbers reports. Confirm all Employee IDs and the single pay frequency with your provider.</p>`],'Select ADP hours layout')}</details>` : ''}
<p>ADP's <a href="${ADP_GUIDE}">Time Sheet Import guide, payroll-assigned identifier layout (pages 4–7)</a> defines the version row, eleven columns, MM/DD/YYYY dates and hour units. Starts, ends, terms and reversals require the generic layout. No live account conformance is claimed.</p></section>`
}
