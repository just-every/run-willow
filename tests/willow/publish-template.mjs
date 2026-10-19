// Exercise the complete publication flow through the real JSON doors.
export async function publishTemplate(h, cookie, body) {
  const template = await h.api('template.create', cookie, body)
  const review = await h.api('template.preview', cookie, { template: template.id })
  await h.api('template.publish', cookie, { review: review.id })
  return template
}
