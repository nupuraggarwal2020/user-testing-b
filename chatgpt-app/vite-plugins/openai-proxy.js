/**
 * Dev-server middleware: POST /api/openai/chat → OpenAI Chat Completions.
 * Reads OPENAI_API_KEY (and optional OPENAI_MODEL) from env — never exposed to the browser.
 */

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8')
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function stripJsonFence(text) {
  if (text == null) return ''
  let s = String(text).trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(s)
  if (fence) s = fence[1].trim()
  return s
}

function normalizeAssistantPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  let mode =
    parsed.mode === 'outline' || parsed.mode === 'prose' || parsed.mode === 'bullets'
      ? parsed.mode
      : 'prose'
  if (mode === 'outline' && (!Array.isArray(parsed.sections) || parsed.sections.length === 0)) {
    mode =
      Array.isArray(parsed.bullets) && parsed.bullets.length > 0 ? 'bullets' : 'prose'
  }
  const followUp =
    typeof parsed.followUp === 'string' && parsed.followUp.trim()
      ? parsed.followUp.trim()
      : 'Ask a follow-up below.'

  if (mode === 'outline' && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
    const sections = parsed.sections.map((sec, i) => {
      const baseDesc = String(sec.desc ?? sec.body ?? '').trim()
      // Backward-compat: if a model still emits `points`, fold them into the
      // narrative paragraph so the UI can render a single rich paragraph.
      const folded = Array.isArray(sec.points) && sec.points.length > 0
        ? `${baseDesc}${baseDesc ? ' ' : ''}${sec.points.map((p) => String(p).trim()).filter(Boolean).join('. ')}.`
        : baseDesc
      return {
        num: typeof sec.num === 'number' ? sec.num : i + 1,
        title: String(sec.title ?? `Section ${i + 1}`).trim().slice(0, 200),
        desc: folded.slice(0, 1200),
      }
    })
    return { mode: 'outline', sections, followUp }
  }
  if (mode === 'bullets' && Array.isArray(parsed.bullets) && parsed.bullets.length > 0) {
    return {
      mode: 'bullets',
      bullets: parsed.bullets.map((b) => String(b)).slice(0, 24),
      followUp,
    }
  }
  const prose =
    typeof parsed.prose === 'string' && parsed.prose.trim()
      ? parsed.prose.trim()
      : typeof parsed.content === 'string'
        ? parsed.content.trim()
        : ''
  if (!prose) return null
  return { mode: 'prose', prose, followUp }
}

const SYSTEM_PROMPT = `You are ChatGPT (OpenAI's assistant): helpful, accurate, and conversational.

The user's message will appear in a product UI that only understands structured JSON for the first reply.

Respond with a single JSON object only (no markdown code fences, no text before or after the JSON):
{
  "mode": "outline" | "prose" | "bullets",
  "sections": [optional, required when mode is outline] — array of objects, each:
    { "num": number, "title": string, "desc": string }
    Use 6–10 sections for presentation/deck/outline requests.
    "title" is the slide name only (3–6 words, no numbering).
    "desc" is a rich, narrative paragraph of 2–4 full sentences (about 40–80 words) that
    reads like real slide body copy a presenter would actually use. Reference the user's
    company, audience, product, or topic by name when they appear in the prompt.
    Do NOT use bullet points, numbered lists, or "points:" — write flowing prose only.
  "prose": string — use when mode is prose (paragraphs; Markdown inline like **bold** is OK).
  "bullets": string[] — use when mode is bullets.
  "followUp": string — one short line suggesting what the user can do next in chat.
}

Style example for an outline section (match this voice and depth):
{ "num": 1,
  "title": "Introduction & Context",
  "desc": "Byte is a technology company dedicated to helping businesses use data and automation to achieve smarter, more efficient operations. We have worked across multiple industries, combining innovation and strategy to deliver measurable results. Today, we're here to show how our technology can help Realty First strengthen its position in the property market, enhance customer engagement, and unlock new opportunities for growth." }

Rules:
- Use mode "outline" when the user asks for slides, deck, presentation structure, talk outline, or similar.
- Use "bullets" for brainstorming lists or when bullets fit best.
- Otherwise use "prose".
- Match the user's language if they write in a non-English language.
- Do not include harmful content; refuse briefly inside prose if needed.`

export function openaiProxyPlugin(env) {
  const apiKey = env.OPENAI_API_KEY || ''
  const model = env.OPENAI_MODEL || 'gpt-4o-mini'

  return {
    name: 'openai-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/openai/chat') || req.method !== 'POST') {
          return next()
        }

        res.setHeader('Content-Type', 'application/json')

        if (!apiKey) {
          res.statusCode = 503
          res.end(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY is not set', code: 'NO_KEY' }))
          return
        }

        let body
        try {
          body = await readJsonBody(req)
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
          return
        }

        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        if (!prompt) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Missing prompt' }))
          return
        }

        try {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              // Some newer models (e.g. gpt-5.3-chat-latest) only accept the
              // default temperature, so we leave it unset and let the API
              // pick. Older models default to ~1.0 which is also fine here.
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
              ],
            }),
          })

          const data = await r.json().catch(() => ({}))
          if (!r.ok) {
            const msg =
              data?.error?.message ||
              (typeof data?.error === 'string' ? data.error : null) ||
              `OpenAI HTTP ${r.status}`
            res.statusCode = r.status >= 400 && r.status < 600 ? r.status : 502
            res.end(JSON.stringify({ ok: false, error: msg, code: 'OPENAI_ERROR' }))
            return
          }

          const rawContent = data?.choices?.[0]?.message?.content
          let parsed
          try {
            parsed = JSON.parse(stripJsonFence(rawContent))
          } catch {
            res.statusCode = 502
            res.end(JSON.stringify({ ok: false, error: 'Model returned invalid JSON', code: 'PARSE' }))
            return
          }

          const assistant = normalizeAssistantPayload(parsed)
          if (!assistant) {
            res.statusCode = 502
            res.end(JSON.stringify({ ok: false, error: 'Could not normalize assistant payload', code: 'NORMALIZE' }))
            return
          }

          res.statusCode = 200
          res.end(JSON.stringify({ ok: true, assistant }))
        } catch (e) {
          res.statusCode = 502
          res.end(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : 'Request failed',
              code: 'NETWORK',
            })
          )
        }
      })
    },
  }
}
