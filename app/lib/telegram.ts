const API_BASE = 'https://api.telegram.org'

/** Escapes the characters Telegram's HTML parse mode treats as markup. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Sends a message via the Telegram Bot API (HTML parse mode).
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the environment. If either
 * is missing it logs a warning and returns — notifications are best-effort and
 * must never crash a scrape run. Network/API errors are logged, not thrown.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification.')
    return
  }

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[telegram] sendMessage failed: HTTP ${res.status} — ${body.slice(0, 300)}`)
    }
  } catch (err) {
    console.error('[telegram] Network error sending message:', err)
  }
}
