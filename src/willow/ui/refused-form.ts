import type { Input } from '../input'

/** Redisplay only controls the current member is still allowed to see. Values
 * stay in this response, rather than a redirect URL or durable draft. */
export function refusedForm(response: Response, action: string, input: Input): Response {
  const values = input.formValues(), offsets = new Map<string, number>()
  const scope = `form[action="/app/do/${action}"]`
  let selection: string[] | undefined
  const rewrite = new HTMLRewriter()
    .on(scope, { element() { offsets.clear(); selection = undefined } })
    .on(`${scope} input`, { element(element) {
      const name = element.getAttribute('name'), type = element.getAttribute('type')
      if (!name || type === 'hidden' || type === 'file' || !values.has(name)) return
      const entered = values.get(name)!
      if (type === 'checkbox' || type === 'radio') {
        if (entered.includes(element.getAttribute('value') ?? 'on')) element.setAttribute('checked', '')
        else element.removeAttribute('checked')
      } else {
        const offset = offsets.get(name) ?? 0
        element.setAttribute('value', entered[offset] ?? '')
        offsets.set(name, offset + 1)
      }
    } })
    .on(`${scope} textarea`, { element(element) {
      const name = element.getAttribute('name')
      if (name && values.has(name)) element.setInnerContent(values.get(name)![0])
    } })
    .on(`${scope} select`, { element(element) {
      selection = values.get(element.getAttribute('name') ?? '')
    } })
    .on(`${scope} option`, { element(element) {
      if (!selection) return
      if (selection.includes(element.getAttribute('value') ?? '')) element.setAttribute('selected', '')
      else element.removeAttribute('selected')
    } })
  return rewrite.transform(response)
}
