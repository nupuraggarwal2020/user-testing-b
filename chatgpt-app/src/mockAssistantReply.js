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

function wantsPresentationOutline(lower) {
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
 * Capitalise just the first character (sentence case) — preserves any
 * existing capitalisation later in the string (e.g. "AI startups").
 */
function capitalize(s) {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

/** Title-Case Each Word — used for the card-header "<Topic> Presentation" line. */
export function titleCase(s) {
  if (!s) return s
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Naive plural→singular reducer, good enough for the prototype's "what is a
 * <singular>?" slide (e.g. "sheep detectives" → "sheep detective"). Topics
 * that don't end in 's' are returned untouched so uncountable nouns
 * ("biology") don't get mangled.
 */
function singularize(noun) {
  if (!noun) return noun
  const w = noun.trim()
  if (/ies$/i.test(w)) return w.replace(/ies$/i, 'y')
  if (/(sses|ches|shes|xes|zes)$/i.test(w)) return w.replace(/es$/i, '')
  if (/s$/i.test(w) && !/ss$/i.test(w)) return w.replace(/s$/i, '')
  return w
}

/**
 * Sales/business detector. The keywords below mirror the spec's list — when
 * any of them shows up in the prompt we route to the existing 8-slide sales
 * template instead of the generic 10-slide informational template.
 */
function isBusinessPrompt(text) {
  return /\b(pitch|sales|investor|proposal|Q[1-4]|quarter|roadmap|pricing|customer|revenue|enterprise|b2b|gtm)\b/i.test(
    text
  )
}

/** The original 8-section sales/business template, extracted so both
 *  `getAssistantResponseFromPrompt` and `synthesizeOutlineFromTopic` can
 *  share it. Kept verbatim from the previous implementation. */
function buildSalesOutlineSections(label) {
  return [
    {
      num: 1,
      title: 'Introduction & Context',
      desc: `This deck sets the stage for ${label} so the audience understands who is in the room, what we set out to do, and why it matters today. We anchor the story in the customer, the market moment, and the outcome we are working toward together. Use this slide to introduce the team, frame the goal, and earn permission to keep going.`,
    },
    {
      num: 2,
      title: 'The opportunity',
      desc: `Markets are shifting fast and customer expectations are climbing. There is a clear opening to lead with smarter operations, sharper insight, and more personalized experiences for ${label}. This section reframes the moment as an opportunity rather than a threat, and shows what is now possible that was not possible before.`,
    },
    {
      num: 3,
      title: 'Strategic approach',
      desc: `We bring together people, process, and technology so ${label} can move from disconnected tools to a single, calm system of record. The approach focuses on quick wins in the first 30 days, deeper integration in the first quarter, and durable change in the first year. Each step is sequenced so the team is never left without value.`,
    },
    {
      num: 4,
      title: 'Solution overview',
      desc: `Here we walk through the product or program at a glance — the core capabilities, the workflows it unlocks, and how it slots into the day-to-day for ${label}. We keep it concrete: what people see, what they click, and what changes for them on Monday morning. Differentiators are highlighted, not exhaustively listed.`,
    },
    {
      num: 5,
      title: 'Proof & customer story',
      desc: `Confidence comes from evidence. We share two or three short proof points — a metric, a customer quote, and a before-and-after — that show this approach already works in the wild. Where relevant, we draw a direct line from a similar customer's challenge to the result they achieved with us.`,
    },
    {
      num: 6,
      title: 'Roadmap & rollout',
      desc: `The next ninety days are mapped into pragmatic milestones: pilot, expand, and operationalize. Each phase has named owners on both sides, clear success metrics, and a check-in cadence. The roadmap is built to flex if priorities shift, but firm enough to commit to.`,
    },
    {
      num: 7,
      title: 'Pricing & investment',
      desc: `We outline what is included, how the commercial model works, and what the total investment looks like for ${label} over the term. The goal is to make the value-to-cost trade transparent — what is fixed, what scales with usage, and where the team can ramp up or down.`,
    },
    {
      num: 8,
      title: 'Next steps & ask',
      desc: `We close with a single, specific ask: align on a pilot scope this week, confirm the executive sponsor, and book the working session for next Tuesday. Clear owners, clear dates, and a one-page recap will follow within 24 hours so momentum carries into the next conversation.`,
    },
  ]
}

/**
 * 10-slide informational template. The titles are interpolated so the deck
 * actually reads about the topic (e.g. "what is a sheep detective?"); the
 * bodies stay short, friendly, and slightly topic-flavored. Body strings are
 * intentionally space-joined phrases — that matches the screenshot voice
 * ("Strong group awareness Excellent memory for faces Sensitive to changes
 * in environment").
 */
function buildInformationalOutlineSections(topic) {
  const lower = topic.trim().toLowerCase()
  const singular = singularize(lower)
  // "what is a X?" reads naturally for plural nouns; for uncountable / single
  // nouns we drop the article so we don't say "what is a marketing?".
  const definitionTitle = /s$/i.test(lower) && !/ss$/i.test(lower)
    ? `what is a ${singular}?`
    : `what is ${lower}?`
  // The sheep-detective demo gets a domain-specific verb; everything else
  // falls back to the generic process slide.
  const howTitle = /detective/i.test(lower)
    ? 'how they solve mysteries'
    : `how ${lower} works`

  return [
    {
      num: 1,
      title: 'title',
      desc: `${capitalize(lower)} A friendly walk-through you can share with your team`,
    },
    {
      num: 2,
      title: definitionTitle,
      desc: `A ${singular} is a curious player in the world of ${lower} Brings patience and attention to detail Quietly notices what others miss`,
    },
    {
      num: 3,
      title: `why ${lower}?`,
      desc: `Hidden depth and unexpected stories Patterns that reward careful observation A growing community of curious minds`,
    },
    {
      num: 4,
      title: 'tools of the trade',
      desc: `Sharp observation Steady note-taking Trusted references Time set aside for reflection`,
    },
    {
      num: 5,
      title: 'common cases',
      desc: `Everyday puzzles worth a second look Recurring patterns to investigate Surprising one-off mysteries Small details that turn out to matter`,
    },
    {
      num: 6,
      title: howTitle,
      desc: `Observe first, act later Compare what is normal vs unusual Follow the trails and signs Work with others to confirm a hunch`,
    },
    {
      num: 7,
      title: 'a day in the life',
      desc: `Morning prep and warm-up Midday focus on the main task Evening review of what was learned`,
    },
    {
      num: 8,
      title: 'tips for getting started',
      desc: `Start small with one clear question Take notes everywhere Talk to people who already know the field Be patient with the learning curve`,
    },
    {
      num: 9,
      title: 'challenges',
      desc: `Information overload Misleading clues Limited time and energy Knowing when to stop`,
    },
    {
      num: 10,
      title: 'conclusion',
      desc: `Even small details can matter Every mystery has clues if you look closely`,
    },
  ]
}

/**
 * Two-paragraph footer copy that appears at the bottom of the chat-thread
 * outline card (matches the screenshot wording exactly). Stored on the
 * outline object as `followUp` so the existing renderer wiring keeps
 * working — the chat-outline branch just splits on blank lines into
 * separate paragraphs.
 */
const OUTLINE_FOLLOW_UP = `I’ve created a simple slide structure you can drop straight into Canva.\n\nIf you want, I can turn this into a more styled version (with visual ideas, layouts, or Canva-specific components like page-by-page design suggestions).`

/**
 * Always returns a `mode: 'outline'` response, regardless of how the input
 * reads. Used (a) by the chat reply when the prompt asks for a deck, and
 * (b) by the Review-outline overlay as a fallback so the user always has
 * something to review even when the chat reply is prose / bullets / email.
 *
 * @param {string} rawText
 * @returns {{ mode: 'outline', topic: string, sections: Array<{num:number,title:string,desc:string}>, followUp: string }}
 */
export function synthesizeOutlineFromTopic(rawText) {
  const text = (rawText || '').trim() || 'your topic'
  const detected = extractTopic(text)
  const topic = (detected && detected.length > 1 ? detected : 'your topic').trim()
  const business = isBusinessPrompt(text)
  const sections = business
    ? buildSalesOutlineSections(truncate(topic, 80))
    : buildInformationalOutlineSections(topic)

  return {
    mode: 'outline',
    topic,
    sections,
    followUp: OUTLINE_FOLLOW_UP,
  }
}

/**
 * @param {string} raw
 * @returns {{
 *   mode: 'outline' | 'prose' | 'bullets',
 *   sections?: Array<{ num: number, title: string, desc: string }>,
 *   topic?: string,
 *   prose?: string,
 *   bullets?: string[],
 *   followUp: string,
 * }}
 */
export function getAssistantResponseFromPrompt(raw) {
  const text = (raw || '').trim() || 'your request'
  const lower = text.toLowerCase()
  const topic = extractTopic(text)

  if (wantsPresentationOutline(lower)) {
    // Single source of truth: the chat reply and the Review-outline fallback
    // both go through `synthesizeOutlineFromTopic` so titles + bodies stay
    // in sync. Business prompts still get the original 8-slide sales
    // template; everything else gets the new 10-slide informational deck.
    return synthesizeOutlineFromTopic(text)
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
