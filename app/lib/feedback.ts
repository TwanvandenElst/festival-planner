'use server'

import { sendTelegramMessage, escapeHtml } from './telegram'

/**
 * Sends user feedback to the owner via Telegram (best-effort). `from` is the
 * sender's email/name when known, otherwise the message is marked "Anonymous".
 * Reuses the existing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID setup.
 */
export async function submitFeedback(
  rawText: string,
  rawFrom: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = rawText.trim()
  const from = rawFrom.trim()
  if (!text) return { ok: false, error: 'Please enter some feedback.' }
  if (text.length > 4000) return { ok: false, error: 'That message is too long.' }

  const message =
    `💡 <b>New feedback!</b>\n\n` +
    `From: ${from ? escapeHtml(from) : 'Anonymous'}\n\n` +
    escapeHtml(text)

  await sendTelegramMessage(message)
  return { ok: true }
}
