/**
 * First-turn assistant reply via dev-server proxy (see vite-plugins/openai-proxy.js).
 * Falls back to mock when API is unavailable — wire a production backend before shipping publicly.
 */

import { getAssistantResponseFromPrompt } from './mockAssistantReply.js'

/** @returns {Promise<ReturnType<typeof getAssistantResponseFromPrompt>>} */
export async function fetchAssistantResponseFromPrompt(raw) {
  const prompt = (raw || '').trim()
  if (!prompt) {
    return getAssistantResponseFromPrompt(raw)
  }

  try {
    const res = await fetch('/api/openai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok || !data.assistant) {
      return getAssistantResponseFromPrompt(raw)
    }
    return data.assistant
  } catch {
    return getAssistantResponseFromPrompt(raw)
  }
}
