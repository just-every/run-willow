// Keep each stateful public-door journey intact; CI runs independent groups in parallel.
const groups = {
  'records-people': [
    'regression-transactions', 'people', 'employee-export', 'employee-bundle',
    'custom-fields', 'record-tables',
  ],
  'records-work': [
    'work-followup', 'workflows', 'change-requests', 'date-alerts', 'self-service',
  ],
  'records-policy': [
    'open-billing', 'custom-reports', 'leave-policies', 'company-home',
    'compensation', 'surveys',
  ],
}
const selected = process.argv[2]
if (process.argv.length > 3 || (selected && !Object.hasOwn(groups, selected))) {
  throw new Error('Select a registered Willow regression group')
}
for (const [group, journeys] of Object.entries(groups)) {
  if (selected && selected !== group) continue
  const groupStarted = performance.now()
  for (const journey of journeys) {
    const started = performance.now()
    try {
      await import(`./${journey}.mjs`)
    } finally {
      console.log(`TIMING ${group} ${journey}: ${(performance.now() - started).toFixed(0)} ms`)
    }
  }
  console.log(`TIMING ${group} total: ${(performance.now() - groupStarted).toFixed(0)} ms`)
}
