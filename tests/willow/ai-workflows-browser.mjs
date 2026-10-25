import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { evidenceDirectory } from './evidence.mjs'

// This journey submits the actual request, distinct signoff, impact review and
// publication forms. API calls only introduce a changed source connection or
// inspect the final durable outcome; they do not substitute for those controls.
export async function workflowScreens(h, owner, staff, inputs) {
  if (process.env.WILLOW_PHASE2_BROWSER !== '1' && process.env.WILLOW_AI_BROWSER !== '1') return
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  const contexts = []
  const actorPage = async cookie => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true }); contexts.push(context)
    await context.addCookies(cookie.split('; ').map(value => ({ name: value.slice(0, value.indexOf('=')), value: value.slice(value.indexOf('=') + 1), url: h.origin })))
    return context.newPage()
  }
  try {
    const hr = await actorPage(owner), it = await actorPage(staff.managerb.cookie), payroll = await actorPage(staff.payroll.cookie)
    const pages = [hr, it, payroll]
    let localSource = inputs.localSource
    const capture = async (page, name, width) => {
      await page.evaluate(() => document.fonts.ready)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`)
      await page.screenshot({ path: join(evidenceDirectory, `workflow-${name}-${width}.png`), fullPage: true })
    }
    const submit = async (page, button) => {
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), button.click()])
      assert.ok(!(await page.getByRole('alert').allTextContents()).some(text => /internal error|not found/i.test(text)))
    }
    const requestWorkflow = async (source, request) => {
      await hr.goto(h.origin + '/app/proposals')
      const form = hr.locator('form[action="/app/do/workflow.draft"]')
      await form.getByLabel('Source template', { exact: true }).selectOption(source)
      await form.getByLabel('Workflow request', { exact: true }).fill(request)
      await form.getByLabel('Impact date', { exact: true }).fill(inputs.asOf)
      await submit(hr, form.getByRole('button', { name: 'Draft workflow', exact: true }))
      const id = new URL(hr.url()).searchParams.get('workflow')
      assert.ok(id, 'The submitted form opens its stored workflow')
      await hr.getByRole('heading', { name: 'Review workflow change', exact: true }).waitFor()
      return id
    }
    for (const width of [1440, 390]) {
      await Promise.all(pages.map(page => page.setViewportSize({ width, height: 1000 })))
      const workflow = await requestWorkflow(localSource, inputs.request)
      await hr.getByRole('heading', { name: 'Privileged step approvals', exact: true }).waitFor()
      assert.equal(await hr.getByRole('button', { name: 'Approve and publish workflow', exact: true }).count(), 0)
      await capture(hr, 'pending', width)
      for (const [page, label, name] of [[it, 'Approve IT step 1', 'it-approval'], [payroll, 'Approve payroll step 2', 'payroll-approval']]) {
        await page.goto(`${h.origin}/app/workflow-approvals?workflow=${workflow}`)
        const button = page.getByRole('button', { name: label, exact: true })
        await button.waitFor(); await button.focus()
        assert.equal(await page.getByText('Per-person impact', { exact: false }).count(), 0)
        await capture(page, name, width)
        await submit(page, button)
        assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 0)
      }
      await hr.reload()
      await submit(hr, hr.getByRole('button', { name: 'Review final workflow', exact: true }))
      await hr.getByRole('heading', { name: `Per-person impact · ${inputs.asOf}`, exact: true }).waitFor()
      await submit(hr, hr.getByRole('button', { name: 'Approve and publish workflow', exact: true }))
      const published = await h.api(`ai-workflows/${workflow}`, owner)
      assert.equal(published.status, 'published'); localSource = published.template
      assert.equal(await hr.getByRole('button', { name: 'Approve and publish workflow', exact: true }).count(), 0)
      await capture(hr, 'published', width)

      const stale = await requestWorkflow(localSource, inputs.request)
      await it.goto(`${h.origin}/app/workflow-approvals?workflow=${stale}`)
      await submit(it, it.getByRole('button', { name: 'Approve IT step 1', exact: true }))
      await h.api('connections.notices', owner, { enabled: width === 1440 })
      await hr.reload()
      assert.ok((await hr.getByRole('alert').allTextContents()).some(text => /source template or connection snapshot has changed/i.test(text)))
      assert.equal(await hr.getByRole('button', { name: 'Approve and publish workflow', exact: true }).count(), 0)
      await capture(hr, 'stale', width)
      await payroll.goto(`${h.origin}/app/workflow-approvals?workflow=${stale}`)
      assert.equal(await payroll.getByRole('button', { name: 'Approve payroll step 2', exact: true }).count(), 0)

      const unresolved = await requestWorkflow(inputs.connectorSource, 'For everyone, assign task 1 to it due 0 days after start using source connector.\nFor everyone, assign task 2 to payroll due 0 days after start after task 1.')
      await hr.getByRole('heading', { name: 'Publication gaps', exact: true }).waitFor()
      assert.equal((await h.api(`ai-workflows/${unresolved}`, owner)).status, 'blocked')
      assert.equal(await hr.getByRole('button', { name: 'Approve and publish workflow', exact: true }).count(), 0)
      await capture(hr, 'unresolved', width)
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()))
    await browser.close()
  }
}
