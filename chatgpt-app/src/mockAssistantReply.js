/**
 * Mock first-turn assistant output from the home prompt (replace with model/API in production).
 */

function truncate(s, max) {
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trim()}…`
}

function extractTopic(text) {
  const patterns = [
    /(?:about|for|on|regarding|titled)\s+["']?([^."'\n]+?)["']?(?:\s*[.!?]|$)/i,
    /(?:outline|deck|presentation)\s+(?:for|of|about)\s+["']?([^."'\n]+?)["']?(?:\s*[.!?]|$)/i,
    /(?:create|make|build|draft)\s+(?:a\s+)?(?:presentation|deck|slides?)\s+(?:about|for|on)\s+["']?([^."'\n]+?)["']?(?:\s*[.!?]|$)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const v = m[1].trim()
      if (v.length > 1) return v
    }
  }
  return null
}

function wantsPresentationOutline(lower, text) {
  const hasDeckish =
    /\b(outline|structure|sections?|slide\s*s?|deck|presentation|pitch|keynote)\b/i.test(lower)
  const hasAction =
    /\b(create|make|build|generate|draft|write|give|need|want|help\s+me|show\s+me)\b/i.test(lower)
  const explicit =
    /\bpresentation\s+outline\b/i.test(lower) ||
    /\bdeck\s+outline\b/i.test(lower) ||
    /\bslides?\s+outline\b/i.test(lower) ||
    /\boutline\s+(for|of|about)\b/i.test(lower) ||
    /\bslide\s+outline\b/i.test(lower)
  return explicit || (hasDeckish && hasAction)
}

function buildEmailDraft(userText, topicHint) {
  const subject = topicHint ? `Re: ${truncate(topicHint, 50)}` : 'Quick note'
  return `**Subject:** ${subject}\n\nHi,\n\nI wanted to follow up on ${topicHint ? `"${truncate(topicHint, 60)}"` : 'our last conversation'}.\n\n• Main point one — add specifics here.\n• Main point two — what you need from them.\n• Clear ask and timeline.\n\nThanks,\n[Your name]\n\n—\n*Template only. In production, personalize from thread context.*`
}

function defaultProseBody(lower) {
  if (/\b(how\s+do\s+i|how\s+to)\b/.test(lower)) {
    return 'Here is a practical sequence: define the goal, list constraints, sketch steps, then iterate. Say which part you want expanded first.'
  }
  if (/\b(what\s+is|explain|define)\b/.test(lower)) {
    return 'In short: start with a one-line definition, then add why it matters, a concrete example, and a common misconception. Ask for depth on any layer.'
  }
  return 'Here is a concise take you can refine: lead with the outcome your reader cares about, support with two pieces of evidence or steps, then end with one clear next action.'
}

/**
 * @param {string} raw
 * @returns {{
 *   mode: 'outline' | 'prose' | 'bullets',
 *   sections?: Array<{ num: number, title: string, desc: string, points: string[] }>,
 *   prose?: string,
 *   bullets?: string[],
 *   followUp: string,
 * }}
 */
export function getAssistantResponseFromPrompt(raw) {
  const text = (raw || '').trim() || 'your request'
  const lower = text.toLowerCase()
  const topic = extractTopic(text)

  if (wantsPresentationOutline(lower, text)) {
    const label = topic || 'your presentation'
    return {
      mode: 'outline',
      sections: [
        {
          num: 1,
          title: `Cover — ${truncate(label, 48)}`,
          desc: `Opening slide that names the topic and sets context for ${truncate(label, 40)}.`,
          points: ['Title & subtitle', 'Speaker or team', 'Date / audience'],
        },
        {
          num: 2,
          title: 'Agenda',
          desc: 'Preview sections so listeners know what to expect.',
          points: ['3–5 sections mapped to your story', 'Optional timing hints'],
        },
        {
          num: 3,
          title: 'Problem / context',
          desc: 'Why this matters now — pain, gap, or opportunity.',
          points: ['Current state', 'Stakeholder impact', 'Why act now'],
        },
        {
          num: 4,
          title: 'Approach or solution',
          desc: 'Your answer: product, plan, or recommendation.',
          points: ['Core idea', 'How it works', 'Differentiators'],
        },
        {
          num: 5,
          title: 'Proof & depth',
          desc: 'Evidence, demo, data, or case that builds confidence.',
          points: ['Metrics or examples', 'Risks & mitigations', 'Roadmap or scope'],
        },
        {
          num: 6,
          title: 'Next steps',
          desc: 'Specific ask: decision, pilot, follow-up, or resources.',
          points: ['Single primary CTA', 'Owner & timeline', 'How to stay in touch'],
        },
      ],
      followUp:
        'Refine the outline above or ask for changes. When you are ready, choose how you would like to create your deck.',
    }
  }

  if (/\b(email|e-mail)\b/.test(lower) && /\b(write|draft|compose)\b/.test(lower)) {
    return {
      mode: 'prose',
      prose: buildEmailDraft(text, topic),
      followUp: 'Adjust tone (shorter, more formal) or swap the ask in chat.',
    }
  }

  if (/\b(summarize|summary|tl;dr|tldr|recap)\b/.test(lower)) {
    return {
      mode: 'prose',
      prose: `Based on “${truncate(text, 90)}”:\n\n**Bottom line:** State the main outcome in one sentence.\n\n**Supporting points:** (1) Key fact or argument, (2) implication for the reader, (3) recommended action.\n\n*In production this would use your pasted doc or thread context.*`,
      followUp: 'Ask for a one-paragraph version, bullets, or an executive-style opener.',
    }
  }

  if (/\b(brainstorm|ideas\s+for|suggest\s+ideas|give\s+me\s+ideas|creative\s+ideas)\b/.test(lower)) {
    const seed = topic || truncate(text, 50)
    return {
      mode: 'bullets',
      bullets: [
        `Lead with a story or stat tied to “${seed}”.`,
        'Contrast “status quo vs. bold alternative” in one visual.',
        'Audience participation: one question or quick poll moment.',
        'Close with one memorable phrase and a single next step.',
      ],
      followUp: 'Tell me which idea to turn into slide titles or a full outline.',
    }
  }

  if (/\b(code|function|bug|error|react|javascript|python)\b/.test(lower)) {
    return {
      mode: 'prose',
      prose: `For “${truncate(text, 100)}”:\n\n1. **Clarify** — input/output, environment, and what you have already tried.\n2. **Minimal repro** — smallest snippet that shows the issue.\n3. **Next** — I would suggest a pattern or fix once those are pinned down.\n\n*Wire this UI to your tool that returns real code.*`,
      followUp: 'Paste code or logs in chat for a concrete patch.',
    }
  }

  return {
    mode: 'prose',
    prose: `You asked: “${truncate(text, 120)}”\n\n${defaultProseBody(lower)}`,
    followUp: 'Ask a follow-up, or say you want a presentation outline and I will structure slides for you.',
  }
}
