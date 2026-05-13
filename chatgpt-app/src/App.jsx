import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import './App.css'
import HomeView from './components/HomeView.jsx'
import CanvaWidgetPlaceholder from './components/CanvaWidgetPlaceholder.jsx'
import StyleSelectionWidget from './components/StyleSelectionWidget.jsx'
import { CHATGPT_APP_SHELL_NAME } from './shellConfig.js'
import { getAssistantResponseFromPrompt } from './mockAssistantReply.js'
import { fetchAssistantResponseFromPrompt } from './assistantClient.js'

/**
 * Brand-refresh v2 experiment (reversible).
 *
 * Set to `false` to fully revert to the original "Unlinked Brand Templates" +
 * refresh-icon "Change reference" behavior. All gated changes read this flag —
 * no other code path is touched, so flipping it back is a one-line rollback.
 *
 * What it enables when `true`:
 *  - The `'none'` brand kit is labeled "All Brand Templates" instead of
 *    "Unlinked Brand Templates", and selecting it surfaces every brand
 *    template in the team (linked + unlinked) in one carousel.
 *  - The "Change reference" button uses a sliders/more-options icon instead
 *    of the refresh icon, which several reviewers were reading as "shuffle".
 */
const BRAND_REFRESH_V2 = true

/**
 * Brand-switcher A/B variant resolver.
 *
 * Reads `?variant=a|b` from the URL once at boot. Both variants live in the
 * same build so testers can compare them by swapping a single query param;
 * everything else in the app (loading state, chat shell, final design,
 * generation animation) is identical across variants.
 *
 *  - 'a' (control)  : current production-ish flow — main brand-kit pill +
 *                     "Change reference" flyout with Apply Brand / Use recent /
 *                     Surprise me tabs. Two switchers (main + flyout-internal).
 *  - 'b' (treatment): single field-label brand-kit selector; clicking it opens
 *                     a unified kit + brand-template picker. "Use a recent
 *                     design" and "Surprise me" become inline alternatives.
 *                     No "Change reference" button (Tali / Rach feedback).
 *                     Addresses Carrie (disconnected switchers), Rach (field-
 *                     label pattern), Emma (BT discoverability inside switcher).
 *
 * Default is 'a' so opening the bare URL keeps the control variant.
 */
/**
 * Resolve the active brand variant.
 *
 * Resolution order:
 *   1. Build-time `VITE_BRAND_VARIANT` env var (bakes the variant into a
 *      deployment so a shared link doesn't need ?variant=, and end users
 *      can't flip variants by editing the URL). Set with:
 *        VITE_BRAND_VARIANT=b npm run build:all
 *   2. Runtime `?variant=a|b` query string (used in local dev).
 *   3. Default to 'a' (control).
 */
function resolveBrandVariant() {
  const envV = (import.meta.env.VITE_BRAND_VARIANT || '').toLowerCase()
  if (envV === 'a' || envV === 'b') return envV
  if (typeof window === 'undefined') return 'a'
  try {
    const v = new URLSearchParams(window.location.search).get('variant')
    return (v || '').toLowerCase() === 'b' ? 'b' : 'a'
  } catch {
    return 'a'
  }
}
const BRAND_VARIANT = resolveBrandVariant()

/**
 * Variant B-only: swap the "Design Experience" brand kit slot for an
 * "OpenAI" kit, and default the user into it with the OpenAI GKO deck
 * pre-selected as the brand template. Lets testers see the picker land
 * on a realistic state instead of an empty Canva default.
 *
 * Variant A is untouched — the Design Experience kit + Canva default
 * still render exactly as before.
 *
 * The thumb paths reuse the existing slide PNGs in /public; only the
 * names + kit attribution change. The first item (GKO) is intentionally
 * the one we pre-select.
 */
const OPENAI_BRAND_KIT = {
  id: 'openai',
  name: 'OpenAI',
  logo: '/brand-kits/openai.svg',
}
const OPENAI_TEMPLATE_THUMBS = [
  '/1_11-469a37db-93e8-4db4-b2d4-80a3f42cbc2d.png',
  '/2_27-8faad275-6d33-4458-8a13-03095e59b2a5.png',
  '/3_11-f9537c15-0d69-4c0b-9813-b003d87375a4.png',
  '/4_11-7dd24973-69bd-46a5-9e32-4090069af5e4.png',
  '/5_2-6c6967d6-dc40-42f3-94ba-e090d041eb7a.png',
  '/6_2-bf271a23-8671-4194-b699-1bd22e1224fe.png',
]
const OPENAI_TEMPLATES = OPENAI_TEMPLATE_THUMBS.map((thumb, i) => ({
  id: `oai-${i + 1}`,
  name: [
    'OpenAI GKO',
    'OpenAI Quarterly Review',
    'OpenAI Research Update',
    'OpenAI Product Launch',
    'OpenAI All-Hands',
    'OpenAI Investor Brief',
  ][i],
  type: 'Brand template',
  thumb,
  pages: Array.from({ length: 12 }, (_, p) => ({
    id: p + 1,
    label: `Page ${p + 1}`,
    thumb: OPENAI_TEMPLATE_THUMBS[p % OPENAI_TEMPLATE_THUMBS.length],
  })),
}))
/** Kit list passed to StyleSelectionWidget when variant B is active.
 *  Same shape as the widget's DEFAULT_BRAND_KITS but with 'design-experience'
 *  replaced by 'openai'. Variant A passes no override so DEFAULT_BRAND_KITS
 *  (with DX) keeps rendering unchanged. */
const BRAND_KITS_VARIANT_B = [
  { id: 'canva', name: 'Canva Brand Kit', logo: '/brand-kits/canva.svg' },
  OPENAI_BRAND_KIT,
  { id: 'affinity', name: 'Affinity', logo: '/brand-kits/affinity.svg' },
  { id: 'none', name: 'Unlinked Brand Templates', logo: '/brand-kits/none.svg' },
]

function App() {
  const [prompt, setPrompt] = useState('')
  const [outlinePrompt, setOutlinePrompt] = useState('')
  const [submittedPrompt, setSubmittedPrompt] = useState('') // Prompt user submitted - shown on next screen
  const [capturePrompt, setCapturePrompt] = useState('')
  const [showHomeScreen, setShowHomeScreen] = useState(true)
  const [homeEntryPrompt, setHomeEntryPrompt] = useState('')
  /** First assistant turn after home submit — content matches prompt intent (outline vs other). */
  const [homeAssistantReply, setHomeAssistantReply] = useState(null)
  const [assistantFirstTurnLoading, setAssistantFirstTurnLoading] = useState(false)
  const [screen, setScreen] = useState('home') // 'home' | 'next' - ready for next screen
  const [flowStep, setFlowStep] = useState('outline') // 'outline' | 'options' | 'create-from-existing'
  const [widgetStep, setWidgetStep] = useState('options') // 'options' | 'create-from-existing' | 'generate-from-scratch' | 'generating' | 'remix' | 'brand-autofill' | 'style-selection'
  /** Brand template chosen as the design style for the Canva style-selection widget.
   *  Variant B boots with the OpenAI GKO deck pre-committed so testers see the
   *  widget land on a populated, realistic state. Variant A keeps the original
   *  empty default. */
  const [selectedStyleTemplate, setSelectedStyleTemplate] = useState(
    BRAND_VARIANT === 'b' ? OPENAI_TEMPLATES[0] : null
  )
  const [selectedBrandKitId, setSelectedBrandKitId] = useState(
    BRAND_VARIANT === 'b' ? 'openai' : 'canva'
  )
  const [reviewOutlineOpen, setReviewOutlineOpen] = useState(false)
  const [loadedSlideCount, setLoadedSlideCount] = useState(0) // slides loaded in generating view
  const [mainPreviewUnblurred, setMainPreviewUnblurred] = useState(false)
  const [visiblePageSlotsCount, setVisiblePageSlotsCount] = useState(0) // page slots shown below (loading states)
  const [generatingPhaseIndex, setGeneratingPhaseIndex] = useState(0) // 0..3 — rotates the live status copy line
  /**
   * Visual stage of the generating widget (Figma 3358:51230 → 51980).
   *  0 = hero only (milestone 1)
   *  1 = + inner design frame (milestone 2)
   *  2 = + text-line skeletons (milestone 3)
   *  3 = + image rectangle (milestone 4)
   *  4 = end state — real hero + Open in Canva + real slide thumbs
   */
  const [generatingStage, setGeneratingStage] = useState(0)
  const [preSelectedDesign, setPreSelectedDesign] = useState(null) // legacy / outline navigation
  const [createExistingItem, setCreateExistingItem] = useState(null) // selected template or design in create-from-existing flow
  /** 'preserve' | 'condense' — how to treat source content when generating from an existing design */
  const [createExistingContentMode, setCreateExistingContentMode] = useState('preserve')
  const [createExistingPickerOpen, setCreateExistingPickerOpen] = useState(false)
  const createExistingPickerRef = useRef(null)
  const chatScrollRef = useRef(null)
  const canvaLatestSegmentRef = useRef(null)
  const [pickerSearchQuery, setPickerSearchQuery] = useState('')
  const [secondaryPanelLoading, setSecondaryPanelLoading] = useState(false)
  const [secondaryLoadPhaseIndex, setSecondaryLoadPhaseIndex] = useState(0)
  const secondaryLoadTimerRef = useRef(null)
  const SECONDARY_LOAD_MESSAGES = ['Calling the tool', 'Called the tool', 'Talked to canva']
  /** ~2.5s total before widget + Canva header appear (three phased lines). */
  const SECONDARY_LOAD_PHASE_MS = 850
  const SECONDARY_PANEL_LOAD_MS = SECONDARY_LOAD_PHASE_MS * SECONDARY_LOAD_MESSAGES.length
  const [canvaThread, setCanvaThread] = useState([]) // { id, type: 'chooser' | 'widget', variant?, cfeSnapshot?, outlineToneSnap?, remixSnap? }

  useEffect(() => {
    document.title = `${CHATGPT_APP_SHELL_NAME} · App template`
  }, [])
  const [createTab, setCreateTab] = useState('brand-template') // 'brand-template' | 'your-designs' | 'search'
  const SHOW_SEARCH_BY_URL_TAB = false // Set to true to restore Search by URL tab
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState(false) // true when user pressed Search or Enter
  const [searchByNameNoMatch, setSearchByNameNoMatch] = useState(false) // user asked for design by name, 0 results
  const [urlSearchQuery, setUrlSearchQuery] = useState('')
  const [previewItem, setPreviewItem] = useState(null)
  const [previewFromPicker, setPreviewFromPicker] = useState(false)
  const [noUserBrandTemplates, setNoUserBrandTemplates] = useState(false)
  const [remixItem, setRemixItem] = useState(null) // design selected for Edit with AI
  const [chooseSlidesItem, setChooseSlidesItem] = useState(null) // design for choose-slides fullscreen
  const [selectedPageIds, setSelectedPageIds] = useState(new Set()) // page IDs selected in choose-slides
  const [editDocumentFullscreenOpen, setEditDocumentFullscreenOpen] = useState(false)
  const USE_INLINE_EDIT_DOCUMENT = false // Set true to restore inline Enhance flow
  const [remixContent, setRemixContent] = useState(`Deploy 2026 — Pitch Deck

Cover
Opening slide with event branding, date, and venue. Establish the Deploy 2026 identity and set the tone for the entire presentation. Event logo and tagline, date and location, presenter name and title.

Agenda
Outline the main themes so the audience knows what to expect and can follow along. Problem statement and market context, solution and product overview, product demo and key features, team traction and ask.

Problem — Market opportunity
Address the challenges and gaps in the current landscape. Articulate the pain points your target audience faces and the market opportunity that exists. Current state and pain points, market size and growth potential, why now — timing and trends, competitive landscape gaps.

Solution — Product overview
Introduce your offering and how it solves the identified problems. Position your solution clearly and differentiate from alternatives. Product vision and value proposition, core capabilities and benefits, target customer and use cases, key differentiators.

Product demo — Key features
Walk through the most important capabilities and differentiators. Show, don't tell — demonstrate how the product works in practice. Feature highlights with screenshots or mockups, user flow and key workflows, integration and ecosystem, roadmap preview.

Team — Leadership & expertise
Highlight the people behind the vision and their relevant experience. Build trust and credibility through the team's track record. Founder and key leadership bios, relevant experience and achievements, advisors and board, why this team can execute.

Traction — Metrics & milestones
Share progress, validation, and proof points to build credibility. Use concrete numbers and milestones to demonstrate momentum. Key metrics — users, revenue, growth. Customer logos and testimonials, partnerships and milestones, recognition and awards.

Ask — Next steps & call to action
Clear recommendations and what you need from the audience. Make the ask specific, actionable, and easy to say yes to. Funding amount and use of funds if applicable, partnership or pilot opportunities, next meeting or follow-up, contact information.`)

  // Clear search only when user clicks a tab (not when we navigate from prompt)
  const handleTabClick = (tab) => {
    setSearchQuery('')
    setSearchSubmitted(false)
    setSearchByNameNoMatch(false)
    setCreateTab(tab)
  }
  const [urlSearchResult, setUrlSearchResult] = useState(null)
  const [outlineTone, setOutlineTone] = useState(null) // 'casual' | 'balanced' | 'playful' | null = none selected

  // Outline built out for Generate from scratch - matches Figma node 810-7610
  const generateFromScratchOutline = [
    { num: 1, title: 'Cover', desc: 'Deploy 2026 — Opening slide with event branding and key messaging.' },
    { num: 2, title: 'Agenda', desc: 'Key topics overview. Outline the main themes and structure of the presentation for the audience.' },
    { num: 3, title: 'Problem', desc: 'Market opportunity. Address the challenges and gaps in the current landscape that your solution addresses.' },
    { num: 4, title: 'Solution', desc: 'Product overview. Introduce your offering and how it solves the identified problems.' },
    { num: 5, title: 'Product demo', desc: 'Key features. Walk through the most important capabilities and differentiators of your product.' },
    { num: 6, title: 'Team', desc: 'Leadership & expertise. Highlight the people behind the vision and their relevant experience.' },
    { num: 7, title: 'Traction', desc: 'Metrics & milestones. Share progress, validation, and proof points to build credibility.' },
    { num: 8, title: 'Ask', desc: 'Next steps & call to action. Clear recommendations and what you need from the audience.' },
  ]

  const slideThumbs = [
    '/1_11-469a37db-93e8-4db4-b2d4-80a3f42cbc2d.png',
    '/2_27-8faad275-6d33-4458-8a13-03095e59b2a5.png',
    '/3_11-f9537c15-0d69-4c0b-9813-b003d87375a4.png',
    '/4_11-7dd24973-69bd-46a5-9e32-4090069af5e4.png',
    '/5_2-6c6967d6-dc40-42f3-94ba-e090d041eb7a.png',
    '/6_2-bf271a23-8671-4194-b699-1bd22e1224fe.png',
    '/9_2-ee403aef-a49b-42a9-b934-d8e6b088eb3c.png',
    '/10_2-8fd1956e-89ba-46b7-9d18-7dd891609b0d.png',
    '/11_2-596350c9-9861-48ba-8ec6-6d2b04c4ee8b.png',
    '/12_2-bea7aaf0-c97c-4a08-80fd-7c6e6a74ba72.png',
    '/13_2-8ac943e7-4348-4fb9-8d77-0beee2db9e9b.png',
    '/14_2-fbd1bd84-8cd0-4e59-be35-85597c9c2e64.png',
  ]
  const createPages = (count = 12) => Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    label: `Page ${i + 1}`,
    thumb: slideThumbs[i % slideThumbs.length]
  }))

  const brandTemplates = [
    { id: 1, name: 'OpenAI GKO Brand template', type: 'Brand template', thumb: slideThumbs[0], pages: createPages() },
    { id: 2, name: 'Partner Brand template', type: 'Brand template', thumb: slideThumbs[1], pages: createPages() },
    { id: 3, name: 'Startup Brand Kit', type: 'Brand template', thumb: slideThumbs[2], pages: createPages() },
    { id: 4, name: 'Corporate Identity', type: 'Brand template', thumb: slideThumbs[3], pages: createPages() },
    { id: 5, name: 'Creative Agency Template', type: 'Brand template', thumb: slideThumbs[4], pages: createPages() },
  ]

  // Per-kit brand template lists. Each kit has its own distinct first template so
  // switching brand kits on the main widget visibly changes the auto-selected template.
  // Legacy: the 'none' (Unlinked Brand Templates) kit only reused the brandTemplates list.
  // v2 (BRAND_REFRESH_V2): the 'none' slot becomes "All Brand Templates" and returns
  // every BT across every BK in one carousel — matching product terminology Emma + Tali
  // confirmed ("All Brand Templates" = all BTs across all BKs, linked or not).
  const canvaBrandKitTemplates = [
    { id: 'cbk-1', name: 'Design Summit Poster', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/01_poster_a4_design_summit.png', pages: createPages() },
    { id: 'cbk-2', name: 'Brand Kits Poster', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/02_poster_a4_brand_kits.png', pages: createPages() },
    { id: 'cbk-3', name: 'Create Event Flyer', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/03_flyer_create_event.png', pages: createPages() },
    { id: 'cbk-4', name: 'Team Workshop Flyer', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/04_flyer_team_workshop.png', pages: createPages() },
    { id: 'cbk-5', name: 'Homepage Hero Banner', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/05_banner_homepage_hero.png', pages: createPages() },
    { id: 'cbk-6', name: 'Campaign Launch Banner', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/06_banner_campaign_launch.png', pages: createPages() },
    { id: 'cbk-7', name: 'Newsletter Email Header', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/07_email_header_newsletter.png', pages: createPages() },
    { id: 'cbk-8', name: 'Product Update Email', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/08_email_header_product_update.png', pages: createPages() },
    { id: 'cbk-9', name: 'Intro Slide', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/09_slide_169_intro.png', pages: createPages() },
    { id: 'cbk-10', name: 'Chapter Slide', type: 'Brand template', thumb: '/canva-templates/canva-brand-kit/10_slide_169_chapter.png', pages: createPages() },
  ]

  const designExperienceTemplates = [
    { id: 'dx-1', name: 'DX Principles Poster', type: 'Brand template', thumb: '/canva-templates/design-experience/01_poster_a4_dx_principles.png', pages: createPages() },
    { id: 'dx-2', name: 'Research Week Poster', type: 'Brand template', thumb: '/canva-templates/design-experience/02_poster_a4_research_week.png', pages: createPages() },
    { id: 'dx-3', name: 'Pattern Library Flyer', type: 'Brand template', thumb: '/canva-templates/design-experience/03_flyer_pattern_library.png', pages: createPages() },
    { id: 'dx-4', name: 'Critique Invite Flyer', type: 'Brand template', thumb: '/canva-templates/design-experience/04_flyer_critique_invite.png', pages: createPages() },
    { id: 'dx-5', name: 'DX Hero Banner', type: 'Brand template', thumb: '/canva-templates/design-experience/05_banner_dx_hero.png', pages: createPages() },
    { id: 'dx-6', name: 'Hiring Banner', type: 'Brand template', thumb: '/canva-templates/design-experience/06_banner_hiring.png', pages: createPages() },
    { id: 'dx-7', name: 'DX Digest Email', type: 'Brand template', thumb: '/canva-templates/design-experience/07_email_header_dx_digest.png', pages: createPages() },
    { id: 'dx-8', name: 'Offsite Email', type: 'Brand template', thumb: '/canva-templates/design-experience/08_email_header_offsite.png', pages: createPages() },
    { id: 'dx-9', name: 'DX Intro Slide', type: 'Brand template', thumb: '/canva-templates/design-experience/09_slide_169_dx_intro.png', pages: createPages() },
    { id: 'dx-10', name: 'DX Chapter Slide', type: 'Brand template', thumb: '/canva-templates/design-experience/10_slide_169_dx_chapter.png', pages: createPages() },
  ]

  const affinityTemplates = [
    { id: 'af-1', name: 'Affinity Poster', type: 'Brand template', thumb: '/canva-templates/affinity/01_poster_a4_affinity_v3.png', pages: createPages() },
    { id: 'af-2', name: 'Studio Event Poster', type: 'Brand template', thumb: '/canva-templates/affinity/02_poster_a4_studio_event.png', pages: createPages() },
    { id: 'af-3', name: 'Designer Launch Flyer', type: 'Brand template', thumb: '/canva-templates/affinity/03_flyer_designer_launch.png', pages: createPages() },
    { id: 'af-4', name: 'Publisher Flyer', type: 'Brand template', thumb: '/canva-templates/affinity/04_flyer_publisher.png', pages: createPages() },
    { id: 'af-5', name: 'Affinity Hero Banner', type: 'Brand template', thumb: '/canva-templates/affinity/05_banner_affinity_hero.png', pages: createPages() },
    { id: 'af-6', name: 'Education Banner', type: 'Brand template', thumb: '/canva-templates/affinity/06_banner_education.png', pages: createPages() },
    { id: 'af-7', name: 'Release Notes Email', type: 'Brand template', thumb: '/canva-templates/affinity/07_email_header_release_notes.png', pages: createPages() },
    { id: 'af-8', name: 'Community Email', type: 'Brand template', thumb: '/canva-templates/affinity/08_email_header_community.png', pages: createPages() },
    { id: 'af-9', name: 'Keynote Slide', type: 'Brand template', thumb: '/canva-templates/affinity/09_slide_169_keynote.png', pages: createPages() },
    { id: 'af-10', name: 'Workflow Slide', type: 'Brand template', thumb: '/canva-templates/affinity/10_slide_169_workflow.png', pages: createPages() },
  ]

  const getTemplatesForKit = (kitId) => {
    switch (kitId) {
      case 'canva':
        return canvaBrandKitTemplates
      case 'design-experience':
        return designExperienceTemplates
      case 'openai':
        // Variant B-only kit; safe to expose regardless because variant A's
        // kit list doesn't surface this id, so it can never be requested there.
        return OPENAI_TEMPLATES
      case 'affinity':
        return affinityTemplates
      case 'none':
      default:
        // v2: "All Brand Templates" — every BT across every BK + the unlinked ones.
        // Ordering puts the previously-unlinked templates first so users still see
        // them prominently, then the kit-scoped templates after. Variant B swaps
        // Design Experience for OpenAI in the merged list to match the kit list.
        return BRAND_REFRESH_V2
          ? [
              ...brandTemplates,
              ...canvaBrandKitTemplates,
              ...(BRAND_VARIANT === 'b' ? OPENAI_TEMPLATES : designExperienceTemplates),
              ...affinityTemplates,
            ]
          : brandTemplates
    }
  }
  const styleSelectionTemplates = getTemplatesForKit(selectedBrandKitId)

  const yourDesigns = [
    { id: 1, name: 'Q4 Pitch Deck', type: 'Presentation', thumb: slideThumbs[0], pages: createPages() },
    { id: 2, name: 'Brand Guidelines 2024', type: 'Document', thumb: slideThumbs[1], pages: createPages() },
    { id: 3, name: 'Marketing Banner', type: 'Social post', thumb: slideThumbs[2], pages: createPages(4) },
    { id: 4, name: 'Product Overview', type: 'Presentation', thumb: slideThumbs[3], pages: createPages() },
    { id: 5, name: 'Team Handbook', type: 'Document', thumb: slideThumbs[4], pages: createPages() },
  ]

  const allItems = [...brandTemplates, ...yourDesigns]
  const isSearching = searchSubmitted && searchQuery.trim().length > 0

  // Shared logic: process prompt for template/design request, returns { foundDesign, foundInBrandTemplates, explicitName, askedForBrandTemplate }
  const processTemplateDesignPrompt = (text) => {
    const allDesigns = [...brandTemplates, ...yourDesigns]
    let foundDesign = null
    let foundInBrandTemplates = false
    const textLower = text.toLowerCase()
    const askedForBrandTemplate = /\bbrand\s*template\b/i.test(text) || (/\btemplate\b/i.test(text) && !/\bdesign\b/i.test(text))
    const askedForDesign = /\bdesign\b/i.test(text) && !/\bbrand\s*template\b/i.test(text)

    // Extract name: prioritize "brand template" phrases so tab/counter work correctly
    const templateMatch =
      text.match(/\bbrand\s+template\s+(?:called|named)?\s*['"]?([^'",.!?\s]+(?:\s+[^'",.!?\s]+)*)['"]?/i) ||
      text.match(/use\s+(?:my\s+)?(?:the\s+)?(?:brand\s+)?(?:template|design)\s+(?:called|named)?\s*['"]?([^'",.!?\s]+(?:\s+[^'",.!?\s]+)*)['"]?/i) ||
      text.match(/(?:with|using|from)\s+(?:my\s+)?(?:brand\s+)?(?:template|design)\s+([^.,!?]+)/i) ||
      text.match(/(?:brand\s+)?template\s+(?:called|named)?\s*['"]?([^'",.!?\s]+(?:\s+[^'",.!?\s]+)*)['"]?/i) ||
      text.match(/(?:my\s+)?design\s+(?:called|named)?\s*['"]?([^'",.!?\s]+(?:\s+[^'",.!?\s]+)*)['"]?/i) ||
      text.match(/generate\s+(?:a\s+)?(?:design\s+)?using\s+(?:my\s+)?(?:brand\s+)?(?:template|design)\s+([^.,!?]+)/i) ||
      text.match(/\b(?:create|make|build|generate)\s+(?:a\s+)?(?:presentation|deck|slides?)\s+(?:with|using|from)\s+my\s+design\s+([^.,!?]+)/i)
    let explicitName = templateMatch ? templateMatch[1].trim() : null
    if (!explicitName && /\bmy\s+design\b/i.test(text)) {
      const tail = text.match(/\bmy\s+design\s+(?:called|named)?\s*['"]?([^'".,;!?]+?)(?=\s*[.,;!?]|$)/i)
      if (tail) explicitName = tail[1].trim()
    }

    if (explicitName) {
      foundDesign = allDesigns.find(t => t.name.toLowerCase().includes(explicitName.toLowerCase()))
      foundInBrandTemplates = foundDesign ? brandTemplates.some(t => t.id === foundDesign.id) : false
    }
    if (!foundDesign) {
      for (const design of allDesigns) {
        const designNameLower = design.name.toLowerCase()
        if (textLower.includes(designNameLower)) {
          foundDesign = design
          foundInBrandTemplates = brandTemplates.some(t => t.id === design.id)
          break
        }
        const keyParts = designNameLower.split(/\s+/).filter(p => p.length > 2)
        if (keyParts.filter(p => textLower.includes(p)).length >= 2) {
          foundDesign = design
          foundInBrandTemplates = brandTemplates.some(t => t.id === design.id)
          break
        }
      }
    }
    if (!foundDesign && /openai\s*gko|openai gko/i.test(text)) {
      foundDesign = brandTemplates.find(t => /openai\s*gko/i.test(t.name))
      foundInBrandTemplates = !!foundDesign
    }
    const intentUserDesign =
      askedForDesign &&
      !askedForBrandTemplate &&
      !/\bbrand\s*template\b/i.test(textLower) &&
      (/\bmy\s+design\b/.test(textLower) ||
        /\bexisting\s+design\b/.test(textLower) ||
        /\b(use|using|with|from)\s+(?:my\s+)?design\b/.test(textLower))
    return { foundDesign, foundInBrandTemplates, explicitName, askedForBrandTemplate, askedForDesign, intentUserDesign }
  }

  const handleTemplateSearch = (e) => {
    e?.preventDefault?.()
    if (searchQuery.trim()) {
      setSearchSubmitted(true)
    }
  }

  const handleSearchQueryChange = (value) => {
    setSearchQuery(value)
    if (!value.trim()) setSearchSubmitted(false)
    setSearchByNameNoMatch(false)
  }
  const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0)
  // Match if at least 1 word from the search query appears in the design/template name
  const searchResults = isSearching
    ? allItems.filter(item => {
        const nameLower = item.name.toLowerCase()
        return queryWords.some(word => nameLower.includes(word))
      })
    : []

  // Mock designs from Canva that aren't in the user's list
  const canvaOnlyDesigns = [
    { id: 'canva-1', name: 'Modern Pitch Deck', type: 'Presentation', thumb: slideThumbs[5], pages: createPages(), source: 'canva' },
    { id: 'canva-2', name: 'Creative Portfolio', type: 'Document', thumb: slideThumbs[6], pages: createPages(), source: 'canva' },
    { id: 'canva-3', name: 'Social Media Kit', type: 'Social post', thumb: slideThumbs[7], pages: createPages(6), source: 'canva' },
    { id: 'canva-4', name: 'Annual Report 2024', type: 'Document', thumb: slideThumbs[8], pages: createPages(), source: 'canva' },
    { id: 'canva-5', name: 'Product Launch Deck', type: 'Presentation', thumb: slideThumbs[9], pages: createPages(), source: 'canva' },
    { id: 'canva-6', name: 'Team Onboarding', type: 'Presentation', thumb: slideThumbs[10], pages: createPages(8), source: 'canva' },
  ]
  const existingNames = new Set(allItems.map(i => i.name.toLowerCase()))
  const canvaNewResults = isSearching
    ? canvaOnlyDesigns.filter(
        item => queryWords.some(word => item.name.toLowerCase().includes(word)) &&
        !existingNames.has(item.name.toLowerCase())
      )
    : []

  // When search has no results, add create option in the active tab (Brand template or Your designs based on user's prompt)
  const searchQueryResult = isSearching && searchResults.length === 0 && canvaNewResults.length === 0
    ? [{
        id: 'search-query-result',
        name: searchQuery.trim(),
        type: createTab === 'brand-template' ? 'Brand template' : 'Presentation',
        thumb: slideThumbs[0],
        pages: createPages(),
        source: 'search'
      }]
    : []

  // Tab-specific search results: brand templates vs your designs (canva designs go to Your designs)
  const brandTemplateSearchResults = searchResults.filter(item => brandTemplates.some(b => b.id === item.id))
  const yourDesignsSearchResults = searchResults.filter(item => yourDesigns.some(d => d.id === item.id))
  const brandTemplateSearchCount = brandTemplateSearchResults.length + (createTab === 'brand-template' ? searchQueryResult.length : 0)
  const yourDesignsSearchCount = yourDesignsSearchResults.length + canvaNewResults.length + (createTab === 'your-designs' ? searchQueryResult.length : 0)

  const brandTemplateCount = preSelectedDesign
    ? (brandTemplates.some(b => b.id === preSelectedDesign.id) ? 1 : 0)
    : (isSearching ? brandTemplateSearchCount : brandTemplates.length)
  const yourDesignsCount = preSelectedDesign
    ? (yourDesigns.some(d => d.id === preSelectedDesign.id) ? 1 : 0)
    : (isSearching ? yourDesignsSearchCount : yourDesigns.length)

  const clearSecondaryLoadTimer = () => {
    if (secondaryLoadTimerRef.current != null) {
      clearTimeout(secondaryLoadTimerRef.current)
      secondaryLoadTimerRef.current = null
    }
  }

  const newCanvaThreadId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const snapshotPreviousTailWidget = (thread) => {
    const idx = [...thread].map((e, i) => (e.type === 'widget' ? i : -1)).filter((i) => i >= 0).pop()
    if (idx == null) return thread
    const w = thread[idx]
    if (w.frozen) return thread
    const next = [...thread]
    const enriched = { ...w, frozen: true }
    if (w.variant === 'create-from-existing' && createExistingItem) {
      enriched.cfeSnapshot = { ...createExistingItem }
      enriched.cfeContentModeSnap = createExistingContentMode
    }
    if (w.variant === 'generate-from-scratch') {
      enriched.outlineToneSnap = outlineTone
    }
    if (w.variant === 'remix' && remixItem) {
      enriched.remixSnap = {
        id: remixItem.id,
        name: remixItem.name,
        thumb: remixItem.thumb,
        type: remixItem.type,
      }
    }
    next[idx] = enriched
    return next
  }

  const runAfterSecondaryLoad = (applySecondaryWidget, { clearRemix = true } = {}) => {
    clearSecondaryLoadTimer()
    if (clearRemix) setRemixItem(null)
    setSecondaryPanelLoading(true)
    secondaryLoadTimerRef.current = window.setTimeout(() => {
      secondaryLoadTimerRef.current = null
      applySecondaryWidget()
      setSecondaryPanelLoading(false)
    }, SECONDARY_PANEL_LOAD_MS)
  }

  useEffect(() => () => clearSecondaryLoadTimer(), [])

  useEffect(() => {
    if (flowStep === 'outline') {
      setCanvaThread([])
      setSecondaryPanelLoading(false)
      setRemixItem(null)
    }
  }, [flowStep])

  useEffect(() => {
    const widgets = canvaThread.filter((e) => e.type === 'widget')
    const tail = widgets[widgets.length - 1]
    if (!tail) {
      if (canvaThread.some((e) => e.type === 'chooser')) setWidgetStep('options')
      return
    }
    if (tail.variant === 'generate-from-scratch') setWidgetStep('generate-from-scratch')
    else if (tail.variant === 'create-from-existing') setWidgetStep('create-from-existing')
    else if (tail.variant === 'generating') setWidgetStep('generating')
    else if (tail.variant === 'remix') setWidgetStep('remix')
    else if (tail.variant === 'brand-autofill') setWidgetStep('brand-autofill')
    else if (tail.variant === 'style-selection') setWidgetStep('style-selection')
  }, [canvaThread])

  useEffect(() => {
    if (!secondaryPanelLoading) {
      setSecondaryLoadPhaseIndex(0)
      return
    }
    setSecondaryLoadPhaseIndex(0)
    const t1 = window.setTimeout(() => setSecondaryLoadPhaseIndex(1), SECONDARY_LOAD_PHASE_MS)
    const t2 = window.setTimeout(() => setSecondaryLoadPhaseIndex(2), SECONDARY_LOAD_PHASE_MS * 2)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [secondaryPanelLoading])

  const navigateToTemplateDesign = (text, { foundDesign, foundInBrandTemplates, explicitName, askedForBrandTemplate, askedForDesign, intentUserDesign }) => {
    const mentionedBrandTemplate = /\bbrand\s*template\b/i.test(text)
    // Detect "my design" use-case: user referenced a design (not a brand template)
    const isMyDesignPrompt = askedForDesign && !askedForBrandTemplate && !mentionedBrandTemplate
    setNoUserBrandTemplates(isMyDesignPrompt)
    // When user said "brand template X" but we found a design in your-designs (e.g. "Brand Guidelines"), respect intent: show brand-template tab with search
    const preferBrandTemplateSearch = explicitName && mentionedBrandTemplate && foundDesign && !foundInBrandTemplates
    if (foundDesign && !preferBrandTemplateSearch) {
      setPreSelectedDesign(null)
      setFlowStep('create-from-existing')
      setCanvaThread([])
      runAfterSecondaryLoad(() => {
        setCreateExistingItem(foundDesign)
        setWidgetStep('create-from-existing')
        setCanvaThread([{ id: newCanvaThreadId(), type: 'widget', variant: 'create-from-existing' }])
        // If no brand templates, force to your-designs tab
        setCreateTab(isMyDesignPrompt ? 'your-designs' : (foundInBrandTemplates ? 'brand-template' : 'your-designs'))
      }, { clearRemix: false })
    } else if (explicitName || preferBrandTemplateSearch || intentUserDesign) {
      const matchByName = explicitName
        ? allItems.find((t) => t.name.toLowerCase().includes(explicitName.toLowerCase()))
        : null
      setPreSelectedDesign(null)
      setFlowStep('create-from-existing')
      setSearchQuery('')
      setSearchSubmitted(false)
      setSearchByNameNoMatch(false)
      setCanvaThread([])
      runAfterSecondaryLoad(() => {
        setCreateExistingItem(foundDesign || matchByName || (isMyDesignPrompt || intentUserDesign ? yourDesigns[0] : brandTemplates[0]))
        setWidgetStep('create-from-existing')
        setCanvaThread([{ id: newCanvaThreadId(), type: 'widget', variant: 'create-from-existing' }])
        setCreateTab(isMyDesignPrompt || intentUserDesign ? 'your-designs' : (mentionedBrandTemplate || askedForBrandTemplate ? 'brand-template' : 'your-designs'))
        if (explicitName && !foundDesign && !matchByName && (isMyDesignPrompt || intentUserDesign)) {
          setSearchQuery(explicitName)
          setSearchSubmitted(true)
        }
      }, { clearRemix: false })
    } else {
      triggerStyleSelectionWidget()
    }
  }

  const handleOutlineSubmit = (e) => {
    e.preventDefault()
    const text = outlinePrompt.trim()
    if (!text) return
    setSubmittedPrompt(text)
    const result = processTemplateDesignPrompt(text)
    const mentionsCanva = /\bcanva\b/i.test(text)
    if (result.foundDesign || result.explicitName || result.intentUserDesign) {
      navigateToTemplateDesign(text, result)
    } else if (mentionsCanva) {
      triggerStyleSelectionWidget()
    } else {
      navigateToTemplateDesign(text, result)
    }
    setOutlinePrompt('')
  }

  /** Trigger the style-selection widget; auto-select the first template of the current brand kit. */
  const triggerStyleSelectionWidget = () => {
    setPreSelectedDesign(null)
    setFlowStep('options')
    setCanvaThread([])
    setSelectedStyleTemplate(getTemplatesForKit(selectedBrandKitId)[0] ?? null)
    runAfterSecondaryLoad(() => {
      setCanvaThread([{ id: newCanvaThreadId(), type: 'widget', variant: 'style-selection' }])
    })
  }

  const handleHomeSubmit = (e) => {
    e.preventDefault()
    const text = capturePrompt.trim()
    if (!text) return
    setHomeEntryPrompt(text)
    setSubmittedPrompt(text)
    const mentionsCanva = /\bcanva\b/i.test(text)

    setHomeAssistantReply(null)
    setAssistantFirstTurnLoading(true)
    fetchAssistantResponseFromPrompt(text)
      .then((reply) => setHomeAssistantReply(reply))
      .finally(() => setAssistantFirstTurnLoading(false))

    if (mentionsCanva) {
      triggerStyleSelectionWidget()
    }
    setShowHomeScreen(false)
  }

  const assistantFirstTurn = useMemo(() => {
    if (assistantFirstTurnLoading) return null
    return homeAssistantReply ?? (homeEntryPrompt ? getAssistantResponseFromPrompt(homeEntryPrompt) : null)
  }, [assistantFirstTurnLoading, homeAssistantReply, homeEntryPrompt])

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = prompt.trim()
    if (!text) return
    setSubmittedPrompt(text)
    const result = processTemplateDesignPrompt(text)
    const mentionsCanva = /\bcanva\b/i.test(text)
    if (result.foundDesign || result.explicitName || result.intentUserDesign) {
      navigateToTemplateDesign(text, result)
    } else if (mentionsCanva) {
      triggerStyleSelectionWidget()
    } else {
      setScreen('next')
    }
    setPrompt('')
  }

  const handleUrlSearch = (e) => {
    e.preventDefault()
    if (urlSearchQuery.trim()) {
      setUrlSearchResult({
        id: 'url-result',
        name: `Design from ${urlSearchQuery.trim()}`,
        type: 'Presentation',
        thumb: slideThumbs[0],
        pages: createPages(),
        source: 'url'
      })
    }
  }

  const popRemixWidgetFromThread = () => {
    setRemixItem(null)
    setEditDocumentFullscreenOpen(false)
    setCanvaThread((t) => {
      const idxs = t.map((e, i) => (e.type === 'widget' && e.variant === 'remix' ? i : -1)).filter((i) => i >= 0)
      const i = idxs[idxs.length - 1]
      if (i == null) return t
      return t.slice(0, i).concat(t.slice(i + 1))
    })
  }

  const handleRemixClick = (item) => {
    setRemixItem(item)
    setPreviewItem(null)
    runAfterSecondaryLoad(() => {
      setCanvaThread((t) => {
        const withSnap = snapshotPreviousTailWidget(t)
        return [...withSnap, { id: newCanvaThreadId(), type: 'widget', variant: 'remix' }]
      })
    }, { clearRemix: false })
  }

  const handleGenerateDesign = () => {
    clearSecondaryLoadTimer()
    setLoadedSlideCount(0)
    setMainPreviewUnblurred(false)
    setVisiblePageSlotsCount(0)
    setGeneratingPhaseIndex(0)
    runAfterSecondaryLoad(() => {
      setCanvaThread((t) => [...t, { id: newCanvaThreadId(), type: 'widget', variant: 'generating' }])
    }, { clearRemix: false })
  }

  /** Template: from generating placeholder, advance to the next widget (remix stub). */
  const advanceFromGeneratingPlaceholder = () => {
    setRemixItem(yourDesigns[0])
    setCanvaThread((t) => {
      const withSnap = snapshotPreviousTailWidget(t)
      return [...withSnap, { id: newCanvaThreadId(), type: 'widget', variant: 'remix' }]
    })
  }

  /**
   * Open the bundled Canva editor app (built from `AI Presentation Canva Templates/`)
   * in a new browser tab. The Canva app is emitted to `<dist>/canva-app/` and is
   * resolved relative to the current Vite base URL so it works in both local dev
   * (`/canva-app/`) and the GitHub Pages deploy (`/prompttodeck/canva-app/`).
   */
  const openCanvaApp = () => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
    // Use the explicit index.html path so Vite's dev server (which doesn't
    // auto-serve `index.html` on bare directory requests in public/) finds the
    // built Canva editor app at chatgpt-app/public/canva-app/. In production
    // (static hosting) this URL also works because the file exists directly.
    //
    // `?from=chatgpt` activates the ChatGPT handoff UI inside the Canva
    // editor: auto-opens the Canva AI side panel (DesignProgressList chat),
    // swaps the bottom preview row for ChatGPTPreviewPanel (slide-by-slide
    // loader), and uses the first stored page as the canvas page.
    window.open(`${base}canva-app/index.html?from=chatgpt`, '_blank', 'noopener,noreferrer')
  }

  const generatingPages = remixItem?.pages || createExistingItem?.pages || createPages()

  // Generating widget animation — Figma nodes 3358:51230 → 3358:51980.
  // ~60s total across 5 milestones (4 phase labels). Phase 0 ("Searching
  // Canva templates") is covered by the secondary loading state that
  // precedes this widget, so we start on phase 1.
  //
  //   t=0     m1  phase="Planning your story", hero mounts
  //   t=2000      slot 1 enters
  //   t=15000 m2  phase="Adding text and images", inner design frame appears
  //   t=17000     slot 2 enters
  //   t=27000 m3  phase="Finalizing design", text-line skeletons appear
  //   t=29000     slot 3 enters
  //   t=39000 m4  image rectangle appears in inner frame
  //   t=41000     slot 4 enters
  //   t=52000 end real hero + "Open in Canva" + slots swap to real thumbs
  //   t=54000     slot 5 enters
  useEffect(() => {
    if (widgetStep !== 'generating') return
    const totalSlides = Math.min(generatingPages.length, 5)

    setGeneratingPhaseIndex(1) // "Planning your story"
    setGeneratingStage(0)
    setLoadedSlideCount(0)
    setMainPreviewUnblurred(false)
    setVisiblePageSlotsCount(0)

    const timeline = [
      // Milestone 1 — hero alone, then slot 1
      { at: 2000, run: () => {
        setVisiblePageSlotsCount((c) => Math.max(c, Math.min(1, totalSlides)))
        setLoadedSlideCount((c) => Math.max(c, 1))
      } },

      // Milestone 2 — inner design frame appears, phase → "Adding text and images"
      { at: 15000, run: () => {
        setGeneratingPhaseIndex(2)
        setGeneratingStage((s) => Math.max(s, 1))
      } },
      { at: 17000, run: () => {
        setVisiblePageSlotsCount((c) => Math.max(c, Math.min(2, totalSlides)))
        setLoadedSlideCount((c) => Math.max(c, 2))
      } },

      // Milestone 3 — text-line skeletons appear, phase → "Finalizing design"
      { at: 27000, run: () => {
        setGeneratingPhaseIndex(3)
        setGeneratingStage((s) => Math.max(s, 2))
      } },
      { at: 29000, run: () => {
        setVisiblePageSlotsCount((c) => Math.max(c, Math.min(3, totalSlides)))
        setLoadedSlideCount((c) => Math.max(c, 3))
      } },

      // Milestone 4 — image rectangle slides in (phase unchanged)
      { at: 39000, run: () => {
        setGeneratingStage((s) => Math.max(s, 3))
      } },
      { at: 41000, run: () => {
        setVisiblePageSlotsCount((c) => Math.max(c, Math.min(4, totalSlides)))
        setLoadedSlideCount((c) => Math.max(c, 4))
      } },

      // End state — real hero + Open in Canva + real slide thumbnails
      { at: 52000, run: () => {
        setGeneratingStage(4)
        setMainPreviewUnblurred(true)
      } },
      { at: 54000, run: () => {
        setVisiblePageSlotsCount((c) => Math.max(c, Math.min(5, totalSlides)))
        setLoadedSlideCount((c) => Math.max(c, 5))
      } },
    ]

    const timeouts = timeline.map(({ at, run }) => window.setTimeout(run, at))

    return () => {
      timeouts.forEach((t) => clearTimeout(t))
    }
  }, [widgetStep, generatingPages.length])

  // Sync generating state to localStorage so Canva editor can pick it up when opened
  useEffect(() => {
    if (widgetStep === 'generating' && generatingPages.length > 0) {
      try {
        localStorage.setItem('canva-from-chatgpt', JSON.stringify({
          pages: generatingPages,
          loadedSlideCount,
          mainPreviewUnblurred,
          visiblePageSlotsCount
        }))
      } catch (_) {}
    }
  }, [widgetStep, generatingPages, loadedSlideCount, mainPreviewUnblurred, visiblePageSlotsCount])

  useEffect(() => {
    if (widgetStep !== 'create-from-existing' && widgetStep !== 'remix') setCreateExistingPickerOpen(false)
  }, [widgetStep])

  useEffect(() => {
    if (!createExistingPickerOpen) setPickerSearchQuery('')
  }, [createExistingPickerOpen])

  useEffect(() => {
    if (!createExistingPickerOpen) return
    const onPointerDown = (e) => {
      if (createExistingPickerRef.current && !createExistingPickerRef.current.contains(e.target)) {
        setCreateExistingPickerOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setCreateExistingPickerOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [createExistingPickerOpen])

  useEffect(() => {
    if (!reviewOutlineOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setReviewOutlineOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [reviewOutlineOpen])

  const FollowUpActions = () => (
    <div className="chatgpt-follow-up-actions">
      <button type="button" className="chatgpt-follow-up-icon" aria-label="Copy">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button type="button" className="chatgpt-follow-up-icon" aria-label="Thumbs up">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
      </button>
      <button type="button" className="chatgpt-follow-up-icon" aria-label="Thumbs down">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>
      </button>
      <button type="button" className="chatgpt-follow-up-icon" aria-label="Share">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </button>
      <button type="button" className="chatgpt-follow-up-icon" aria-label="Regenerate">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </button>
      <button type="button" className="chatgpt-follow-up-icon" aria-label="More">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.25"/><circle cx="12" cy="12" r="1.25"/><circle cx="19" cy="12" r="1.25"/></svg>
      </button>
    </div>
  )

  const ChatGptFollowUp = ({ text }) => (
    <div className="chatgpt-follow-up">
      <p className="chatgpt-follow-up-text">{text}</p>
      <FollowUpActions />
    </div>
  )

  const widgetEntries = canvaThread.filter((e) => e.type === 'widget')
  const lastWidgetEntry = widgetEntries[widgetEntries.length - 1]
  const lastWidgetId = lastWidgetEntry?.id
  const hasChooserInThread = canvaThread.some((e) => e.type === 'chooser')
  const chooserInteractive = hasChooserInThread && !secondaryPanelLoading && !remixItem
  const tailVariant = lastWidgetEntry?.variant

  const chooserFollowUpText = 'Pick an action above or describe what you want in chat.'

  const canvaFollowUpHelperText =
    tailVariant === 'generating'
      ? 'Async tool in progress — offer status or next steps in chat.'
      : tailVariant === 'remix'
        ? 'Refine via chat or the Continue action when ready.'
        : tailVariant === 'generate-from-scratch'
          ? 'Adjust requirements in chat or tap Continue.'
          : tailVariant === 'create-from-existing'
            ? 'Pick assets via your tool; Continue runs the next call.'
            : tailVariant === 'brand-autofill'
              ? 'Autofill UI maps to structuredContent from your MCP tool.'
              : tailVariant === 'style-selection'
                ? 'To generate your design, I have selected this Brand Template to match the style to. Select Change selection to choose a different template, or Generate design to continue.'
                : hasChooserInThread
                  ? chooserFollowUpText
                  : 'Earlier steps are above; continue below.'

  const followUpForLiveWidget = () => 'Ask for changes in chat or use the action above.'

  const followUpForFrozenWidget = () => 'Past tool step — continue in the latest card or in chat.'

  const isGeneratingFromYourDesign =
    widgetStep === 'generating' &&
    noUserBrandTemplates &&
    !!createExistingItem &&
    yourDesigns.some((d) => d.id === createExistingItem.id)

  const selectCreateExistingItem = (item, tab) => {
    setCreateExistingItem(item)
    setCreateTab(tab)
    setCreateExistingPickerOpen(false)
  }

  const showCanvaStack = flowStep !== 'outline' && (secondaryPanelLoading || canvaThread.length > 0)
  const showCanvaFallbackFollowUp = flowStep !== 'outline' && !showCanvaStack
  const canvaScrollKey = `${canvaThread.map((e) => e.id).join('-')}-${lastWidgetId ?? ''}-${secondaryPanelLoading ? 1 : 0}`

  const renderCreateFromExistingInteractive = (past, widgetTitle) => (
    <div className="canva-widget-with-header">
      <div className="options-container">
        <CanvaWidgetPlaceholder
          layout="panel"
          title={widgetTitle}
          subtitle="Map picker and actions to structuredContent from your tool."
          primaryLabel="Continue"
          primaryDisabled={past || secondaryPanelLoading}
          onPrimary={handleGenerateDesign}
        />
      </div>
    </div>
  )

  /** Full widget body for every thread widget; `past` only disables actions — layout stays the same. */
  const renderWidgetInner = (w, idx) => {
    const past = idx < widgetEntries.length - 1
    const dis = past || secondaryPanelLoading
    const title = `Widget ${idx + 2}`

    if (w.variant === 'generating') {
      // Figma 3358:51230 → 51980 — phase labels rotate across the ~60s timeline.
      // Phase 0 ("Searching Canva templates") is shown by the secondary loading
      // state above; this widget starts on phase 1.
      const phaseLabels = [
        'Searching Canva templates',
        'Planning your story',
        'Adding text and images',
        'Finalizing design',
      ]
      const phaseTail = '. Generating designs can take up to 1 minute…'
      // Cap slide ticker at 5 (max for this milestone per design spec).
      const slotCount = Math.min(generatingPages.length, 5)
      const hasMultiplePages = slotCount > 1
      const isReady = mainPreviewUnblurred
      // Variant B treatment: a single static "Live generation in progress" status
      // line with a pulsing dot for the entire animation, plus the "Open in Canva"
      // CTA visible from stage 0 (rather than only at the final stage). Keeps the
      // control variant (A) pixel-identical.
      const isVariantB = BRAND_VARIANT === 'b'
      const showOpenCanvaBtn = isReady || isVariantB
      // Skeleton bars inside the inner frame — widths echo Figma frame 3.
      const skeletonBars = [
        { w: '14%', delay: 0 },
        { w: '44%', delay: 60 },
        { w: '32%', delay: 120 },
        { w: '36%', delay: 180 },
        { w: '20%', delay: 240 },
      ]
      const handleOpenInCanva = () => {
        if (past) return
        openCanvaApp()
        advanceFromGeneratingPlaceholder()
      }
      return (
        <div className="canva-tool-thread-block">
          <div className="canva-widget-with-header">
            <div className="options-container">
              <div
                className={`generating-widget${hasMultiplePages ? '' : ' generating-widget--single'}`}
                data-past={past ? 'true' : undefined}
                data-stage={generatingStage}
              >
                {/* Figma 3358:51394 — Prog copy (gradient phase + grey tail).
                    At end state, swaps to a single static "Design Finalized." line
                    that mirrors the phase typography but drops the gradient + shimmer.
                    Variant B replaces the rotating phase copy with a single static
                    "Live generation in Progress…" line + pulsing dot for the entire
                    ~60s animation, then swaps to its own "Your design is ready…"
                    end-state copy (Figma 3058:8284, NotificationDot 3058:8155). */}
                <header className="generating-status-block">
                  <p
                    className="generating-status-line"
                    role="status"
                    aria-live="polite"
                  >
                    {isVariantB ? (
                      isReady ? (
                        <span className="generating-status-line__done">
                          Your design is ready. Open it in Canva to edit and share.
                        </span>
                      ) : (
                        <span className="generating-status-line__variant-b">
                          <span
                            className="generating-status-line__dot"
                            aria-hidden="true"
                          />
                          <span className="generating-status-line__variant-b-text">
                            Live generation in Progress. Open the design in Canva now to edit and share.
                          </span>
                        </span>
                      )
                    ) : isReady ? (
                      <span className="generating-status-line__done">
                        Design Finalized. Open in Canva now to edit and share
                      </span>
                    ) : (
                      <>
                        <span
                          key={`phase-${generatingPhaseIndex}`}
                          className="generating-status-line__phase"
                        >
                          {phaseLabels[generatingPhaseIndex]}
                        </span>
                        <span className="generating-status-line__tail">{phaseTail}</span>
                      </>
                    )}
                  </p>
                </header>

                {/* Figma 3358:51292 → 51980 — Load visual progresses through
                    pastel hero → inner frame → skeletons → image rect → real hero.
                    Variant B adds a `--variant-b` modifier so the open-in-Canva
                    CTA can render from stage 0 instead of waiting for is-ready. */}
                <div
                  className={`generating-preview-area${isReady ? ' is-ready' : ''}${isVariantB ? ' generating-preview-area--variant-b' : ''}`}
                >
                  <div className="generating-conic-gradient" aria-hidden="true" />
                  <div className="generating-preview-veil" aria-hidden="true" />

                  {/* Inner design canvas (m2+) */}
                  <div
                    className={`generating-inner-frame${generatingStage >= 1 ? ' is-visible' : ''}`}
                    aria-hidden="true"
                  >
                    {/* Text-line skeletons (m3+) */}
                    <div
                      className={`generating-skeletons${generatingStage >= 2 ? ' is-visible' : ''}`}
                      aria-hidden="true"
                    >
                      {skeletonBars.map((bar, i) => (
                        <span
                          key={i}
                          className="generating-skeleton-bar"
                          style={{
                            width: bar.w,
                            animationDelay: `${bar.delay}ms`,
                          }}
                        />
                      ))}
                    </div>
                    {/* Image rectangle (m4+) */}
                    <div
                      className={`generating-image-rect${generatingStage >= 3 ? ' is-visible' : ''}`}
                      aria-hidden="true"
                    />
                  </div>

                  {/* End state — real Deploy 2026 hero image */}
                  {slotCount > 0 ? (
                    <img
                      src={generatingPages[0]?.thumb}
                      alt=""
                      className={`generating-final-hero${isReady ? ' is-visible' : ''}`}
                      aria-hidden={!isReady}
                    />
                  ) : null}

                  {/* End-state bottom darken — Figma 3358:51980 Rectangle 1591333638.
                      linear-gradient(180deg, rgba(60,4,112,0) 0%, rgba(0,0,0,0.8) 100%).
                      Only shown once the real hero is loaded so the loading
                      pastel layers stay clean during the generation animation
                      (applies to both variants). */}
                  <div
                    className={`generating-hero-bottom-fade${isReady ? ' is-visible' : ''}`}
                    aria-hidden="true"
                  />

                  <div className="generating-preview-content">
                    {showOpenCanvaBtn ? (
                      <button
                        type="button"
                        className="generating-open-canva-btn"
                        onClick={handleOpenInCanva}
                        disabled={past}
                      >
                        <img
                          src="/Canva_Icon_logo.png"
                          alt=""
                          width={20}
                          height={20}
                          className="generating-open-canva-btn__icon"
                        />
                        Open in Canva
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Figma 3358:51388 — slide ticker (max 5, enter 1-by-1, swap
                    to real thumbnails at end state). */}
                {hasMultiplePages ? (
                  <div
                    className="generating-slides-row"
                    aria-label={`Generating ${slotCount} slides`}
                  >
                    {Array.from({ length: slotCount }).map((_, i) => {
                      const visible = i < visiblePageSlotsCount
                      const realThumb = generatingPages[i]?.thumb
                      return (
                        <div
                          key={i}
                          className={`generating-slide-slot${visible ? ' is-visible' : ''}${isReady ? ' is-ready' : ''}`}
                          aria-hidden={!visible}
                        >
                          <div className="generating-slide-gradient" />
                          {realThumb ? (
                            <img
                              src={realThumb}
                              alt=""
                              className="generating-slide-thumb"
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (w.variant === 'remix') {
      return (
        <div className="canva-tool-thread-block">
          <div className="canva-widget-with-header">
            <div className="options-container">
              <CanvaWidgetPlaceholder
                layout="panel"
                title={title}
                subtitle="Review or adjust content, then call your next tool from this action."
                primaryLabel="Continue"
                primaryDisabled={dis}
                onPrimary={handleGenerateDesign}
              />
            </div>
          </div>
        </div>
      )
    }
    if (w.variant === 'generate-from-scratch') {
      return (
        <div className="canva-tool-thread-block">
          <div className="canva-widget-with-header">
            <div className="options-container">
              <CanvaWidgetPlaceholder
                layout="panel"
                title={title}
                subtitle="Optional editor UI; sync changes with ui/update-model-context when needed."
                primaryLabel="Continue"
                primaryDisabled={dis}
                onPrimary={handleGenerateDesign}
              />
            </div>
          </div>
        </div>
      )
    }
    if (w.variant === 'brand-autofill') {
      return (
        <div className="canva-tool-thread-block">
          <div className="canva-widget-with-header">
            <div className="options-container">
              <CanvaWidgetPlaceholder
                layout="panel"
                title={title}
                subtitle="Render fields from tool output; keep one clear primary action."
                primaryLabel="Continue"
                primaryDisabled={dis}
                onPrimary={handleGenerateDesign}
              />
            </div>
          </div>
        </div>
      )
    }
    if (w.variant === 'create-from-existing') {
      return (
        <div className="canva-tool-thread-block">
          {renderCreateFromExistingInteractive(past, title)}
        </div>
      )
    }
    if (w.variant === 'style-selection') {
      return (
        <div className="canva-tool-thread-block">
          <div className="canva-widget-with-header">
            <StyleSelectionWidget
              selected={selectedStyleTemplate}
              templates={styleSelectionTemplates}
              getTemplatesForKit={getTemplatesForKit}
              recentDesigns={yourDesigns}
              selectedBrandKitId={selectedBrandKitId}
              brandRefreshV2={BRAND_REFRESH_V2}
              brandVariant={BRAND_VARIANT}
              // Variant B swaps the "Design Experience" kit for an "OpenAI" kit.
              // Variant A leaves this undefined so the widget keeps using its
              // DEFAULT_BRAND_KITS (with DX) — no behavioural change for A.
              brandKits={BRAND_VARIANT === 'b' ? BRAND_KITS_VARIANT_B : undefined}
              onSelectBrandKit={past || secondaryPanelLoading ? undefined : (kit) => {
                setSelectedBrandKitId(kit.id)
                setSelectedStyleTemplate(getTemplatesForKit(kit.id)[0] ?? null)
              }}
              onSelectTemplate={past || secondaryPanelLoading ? undefined : (tpl) => setSelectedStyleTemplate(tpl)}
              onReviewOutline={past ? undefined : () => setReviewOutlineOpen(true)}
              onGenerate={past || secondaryPanelLoading ? undefined : handleGenerateDesign}
              disabled={dis}
            />
          </div>
        </div>
      )
    }
    return null
  }

  useLayoutEffect(() => {
    if (flowStep === 'outline') return
    const el = chatScrollRef.current
    if (!el) return
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight
    }
    scrollToBottom()
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      scrollToBottom()
      raf2 = requestAnimationFrame(scrollToBottom)
    })
    const timeouts = [0, 120, 400, 700].map((ms) => window.setTimeout(scrollToBottom, ms))
    if (!secondaryPanelLoading && tailVariant === 'generating') {
      const seg = canvaLatestSegmentRef.current
      if (seg) {
        requestAnimationFrame(() => {
          seg.scrollIntoView({ block: 'end', behavior: 'smooth' })
        })
      }
    }
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      timeouts.forEach(clearTimeout)
    }
  }, [
    flowStep,
    secondaryPanelLoading,
    widgetStep,
    canvaScrollKey,
    showCanvaStack,
    tailVariant,
    showHomeScreen,
  ])

  return (
    <div className="chatgpt-layout" aria-label={CHATGPT_APP_SHELL_NAME}>
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9006A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9006 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z"/>
          </svg>
        </div>
        <nav className="sidebar-nav">
          <button className="sidebar-item" aria-label="Edit">
            <img src="/svg/startIcon.svg" alt="" width={20} height={20} />
          </button>
          <button className="sidebar-item" aria-label="Search">
            <img src="/svg/startIcon-1.svg" alt="" width={20} height={20} />
          </button>
          <button className="sidebar-item" aria-label="History">
            <img src="/svg/startIcon-2.svg" alt="" width={20} height={20} />
          </button>
        </nav>
      </aside>

      {/* Main content */}
      <main className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-dropdown">
            <span>{CHATGPT_APP_SHELL_NAME}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="header-actions">
            <button className="header-btn share-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Share
            </button>
            <button className="header-btn icon-btn" aria-label="More options">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="6" cy="12" r="1.5"/>
                <circle cx="18" cy="12" r="1.5"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Chat pane */}
        <div className={`chat-pane${showHomeScreen ? ' chat-pane--home' : ''}`}>
          <div className={`chat-inner${showHomeScreen ? ' chat-inner--home' : ''}`} ref={chatScrollRef}>
            {showHomeScreen ? (
              <HomeView
                capturePrompt={capturePrompt}
                onPromptChange={setCapturePrompt}
                onSubmit={handleHomeSubmit}
              />
            ) : null}
            <div className={`conversation${showHomeScreen ? ' conversation--hidden' : ''}`}>
              {/* Outline page - deck outline (from ChatGPT, not Canva). User message from home screen. */}
              {flowStep === 'outline' && (
                <>
                  <div className="message-row user">
                    <div className="message-bubble">
                      <p>{homeEntryPrompt}</p>
                    </div>
                  </div>
                  <div className="app-content outline-response">
                    {assistantFirstTurnLoading ? (
                      <div
                        className="canva-secondary-loading-chat assistant-first-turn-loading"
                        role="status"
                        aria-live="polite"
                        aria-label="Generating response"
                      >
                        <span className="chatgpt-loading-dot" aria-hidden />
                        <span className="canva-secondary-loading-chat-message">Generating response…</span>
                      </div>
                    ) : assistantFirstTurn ? (
                      <div className="outline-container">
                        {assistantFirstTurn.mode === 'outline' && assistantFirstTurn.sections ? (
                          <div className="outline-cards">
                            {assistantFirstTurn.sections.map((sec, idx) => (
                              <article
                                key={sec.num}
                                className={`outline-card${idx === 0 ? ' outline-card--first' : ''}`}
                              >
                                <h3 className="outline-card-title">{sec.title}</h3>
                                <p className="outline-card-desc">
                                  {sec.desc}
                                  {Array.isArray(sec.points) && sec.points.length > 0
                                    ? ` ${sec.points.join('. ')}.`
                                    : ''}
                                </p>
                              </article>
                            ))}
                          </div>
                        ) : null}
                        {assistantFirstTurn.mode === 'prose' && assistantFirstTurn.prose ? (
                          <div className="assistant-prose-body">{assistantFirstTurn.prose}</div>
                        ) : null}
                        {assistantFirstTurn.mode === 'bullets' && assistantFirstTurn.bullets ? (
                          <ul className="assistant-bullet-list">
                            {assistantFirstTurn.bullets.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <ChatGptFollowUp
                    text={
                      assistantFirstTurnLoading
                        ? 'One moment…'
                        : assistantFirstTurn?.followUp ?? 'Ask anything below.'
                    }
                  />
                </>
              )}
              {flowStep !== 'outline' && (submittedPrompt || remixItem) && (
                <div className="message-row user">
                  <div className="message-bubble">
                    <p>{remixItem ? `Edit ${remixItem.name} with AI` : submittedPrompt}</p>
                  </div>
                </div>
              )}

              {/* Canva section - stacked chooser + widgets */}
              {flowStep !== 'outline' && (
              <div className="app-content">
                {showCanvaStack ? (
                <div className="canva-widget-stack">
                  {canvaThread.length === 0 && secondaryPanelLoading ? (
                  <div className="canva-tool-thread-block">
                      <div
                        className="canva-secondary-loading-chat"
                        role="status"
                        aria-live="polite"
                        aria-label={SECONDARY_LOAD_MESSAGES[secondaryLoadPhaseIndex]}
                      >
                        <span className="chatgpt-loading-dot" aria-hidden />
                        <span className="canva-secondary-loading-chat-message">
                          {SECONDARY_LOAD_MESSAGES[secondaryLoadPhaseIndex]}
                        </span>
                      </div>
                  </div>
                  ) : (
                  <>
                  {canvaThread.map((entry) => {
                    if (entry.type === 'chooser') {
                      if (remixItem) return null
                      return (
                  <div key={entry.id} className="canva-thread-segment">
                  <div className="app-attribution">
                    <div className="canva-logo">
                      <img src="/Canva_Icon_logo.png" alt="Canva" width={24} height={24} />
                    </div>
                    <span>Canva</span>
                  </div>
                  <div className="options-container">
                    <CanvaWidgetPlaceholder
                      layout="panel"
                      title="Widget"
                      subtitle="Start from conversation context, a template, or structured tool output."
                      primaryLabel="Continue"
                      primaryDisabled={!chooserInteractive || secondaryPanelLoading}
                      onPrimary={() => {
                        if (!chooserInteractive) return
                        runAfterSecondaryLoad(() => {
                          setCanvaThread((t) => {
                            const withSnap = snapshotPreviousTailWidget(t)
                            return [...withSnap, { id: newCanvaThreadId(), type: 'widget', variant: 'generate-from-scratch' }]
                          })
                          setCreateExistingItem(null)
                        })
                      }}
                    />
                  </div>
                  <div className="chatgpt-follow-up chatgpt-follow-up--post-widget">
                    <p className="chatgpt-follow-up-text">{chooserFollowUpText}</p>
                    <FollowUpActions />
                  </div>
                  </div>
                      )
                    }
                    if (entry.type === 'widget') return null
                    return null
                  })}
                  {widgetEntries.map((w, idx) => {
                    const isLast = idx === widgetEntries.length - 1
                    // Generating widget hides the trailing follow-up + icons
                    // entirely while the design is still being created.
                    // The block reappears at end state with a "design ready" message.
                    const isGeneratingLive = w.variant === 'generating' && isLast
                    const isGeneratingReady = isGeneratingLive && mainPreviewUnblurred
                    const hideFollowUp = isGeneratingLive && !mainPreviewUnblurred

                    const postFollowUpText =
                      isGeneratingReady && isGeneratingFromYourDesign ? (
                        <p className="chatgpt-follow-up-text">
                          I’ve generated your design from{' '}
                          <strong>{createExistingItem?.name}</strong>
                          {' '}— open it in Canva to edit and share. We’ve also saved a brand template for next time.
                        </p>
                      ) : isGeneratingReady ? (
                        <p className="chatgpt-follow-up-text">
                          I’ve generated the design — open it in Canva to edit and share.
                        </p>
                      ) : !isLast ? (
                        <p className="chatgpt-follow-up-text">{followUpForFrozenWidget()}</p>
                      ) : (
                        <p className="chatgpt-follow-up-text">{followUpForLiveWidget()}</p>
                      )

                    return (
                  <div
                    key={w.id}
                    ref={isLast && w.variant === 'generating' ? canvaLatestSegmentRef : undefined}
                    className={`canva-thread-segment${isLast ? ' canva-thread-segment--latest' : ''}`}
                  >
                  <div className="app-attribution">
                    <div className="canva-logo">
                      <img src="/Canva_Icon_logo.png" alt="Canva" width={24} height={24} />
                    </div>
                    <span>Canva</span>
                  </div>
                  {renderWidgetInner(w, idx)}
                  {hideFollowUp ? null : (
                    <div className="chatgpt-follow-up chatgpt-follow-up--post-widget">
                      {postFollowUpText}
                      <FollowUpActions />
                    </div>
                  )}
                  </div>
                    )
                  })}
                  {secondaryPanelLoading &&
                  (widgetEntries.length > 0 || hasChooserInThread) &&
                  widgetEntries[widgetEntries.length - 1]?.variant !== 'generating' ? (
                  <div className="canva-tool-thread-block">
                      <div
                        className="canva-secondary-loading-chat"
                        role="status"
                        aria-live="polite"
                        aria-label={SECONDARY_LOAD_MESSAGES[secondaryLoadPhaseIndex]}
                      >
                        <span className="chatgpt-loading-dot" aria-hidden />
                        <span className="canva-secondary-loading-chat-message">
                          {SECONDARY_LOAD_MESSAGES[secondaryLoadPhaseIndex]}
                        </span>
                      </div>
                  </div>
                  ) : null}
                  </>
                )}
                </div>
                ) : null}
                {showCanvaFallbackFollowUp ? (
                  <ChatGptFollowUp text={canvaFollowUpHelperText} />
                ) : null}
              </div>
              )}
            </div>
          </div>

          {/* Composer - outline prompt or main chat (hidden on home screen; HomeView has its own composer) */}
          {!showHomeScreen ? (
          <div className="composer-wrapper">
            {flowStep === 'outline' ? (
              <form className="composer" onSubmit={handleOutlineSubmit}>
                <div className="composer-content">
                  <div className="composer-value">
                    <input
                      type="text"
                      className="composer-input"
                      placeholder="Ask anything"
                      value={outlinePrompt}
                      onChange={(e) => setOutlinePrompt(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="composer-actions">
                  <div className="composer-left">
                    <button type="button" className="composer-icon-btn" aria-label="Add">
                      <img src="/svg/Icon.svg" alt="" width={20} height={20} />
                    </button>
                    <div className="canva-tag">
                      <img src="/Canva_Icon_logo.png" alt="" className="canva-tag-icon" width={16} height={16} />
                      <span>Canva</span>
                      <button type="button" className="canva-tag-close" aria-label="Remove">
                        <img src="/svg/close.svg" alt="" width={16} height={16} />
                      </button>
                    </div>
                  </div>
                  <div className="composer-right">
                    <button type="button" className="composer-icon-btn" aria-label="Voice input">
                      <img src="/svg/_Composer-action/Icon.svg" alt="" width={20} height={20} />
                    </button>
                    <button type="submit" className="send-btn" aria-label="Send">
                      <img src="/svg/_Composer-action/Send.svg" alt="" width={36} height={36} />
                    </button>
                  </div>
                </div>
              </form>
            ) : (
            <form className="composer" onSubmit={handleSubmit}>
              <div className="composer-content">
                <div className="composer-value">
                  <input
                    type="text"
                    className="composer-input"
                    placeholder="Ask anything"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="composer-actions">
                <div className="composer-left">
                  <button type="button" className="composer-icon-btn" aria-label="Add">
                    <img src="/svg/Icon.svg" alt="" width={20} height={20} />
                  </button>
                  <div className="canva-tag">
                    <img src="/Canva_Icon_logo.png" alt="" className="canva-tag-icon" width={16} height={16} />
                    <span>Canva</span>
                    <button type="button" className="canva-tag-close" aria-label="Remove">
                      <img src="/svg/close.svg" alt="" width={16} height={16} />
                    </button>
                  </div>
                </div>
                <div className="composer-right">
                  <button type="button" className="composer-icon-btn" aria-label="Voice input">
                    <img src="/svg/_Composer-action/Icon.svg" alt="" width={20} height={20} />
                  </button>
                  <button type="submit" className="send-btn" aria-label="Send">
                    <img src="/svg/_Composer-action/Send.svg" alt="" width={36} height={36} />
                  </button>
                </div>
              </div>
            </form>
            )}
          </div>
          ) : null}
        </div>
      </main>

      {/* Choose slides fullscreen - select pages to edit */}
      {chooseSlidesItem && (
        <div className="preview-fullscreen choose-slides-fullscreen">
          <header className="preview-header">
            <div className="preview-header-left">
              <button
                type="button"
                className="preview-close-btn"
                onClick={() => setChooseSlidesItem(null)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <h1 className="preview-title">Select slides to edit</h1>
            </div>
          </header>
          <main className="preview-main">
            <div className="preview-pages-grid">
              {(chooseSlidesItem.pages || createPages()).map((page) => {
                const isSelected = selectedPageIds.has(page.id)
                return (
                  <div
                    key={page.id}
                    className={`preview-page-card choose-slides-page-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedPageIds(prev => {
                        const next = new Set(prev)
                        if (next.has(page.id)) next.delete(page.id)
                        else next.add(page.id)
                        return next
                      })
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedPageIds(prev => {
                          const next = new Set(prev)
                          if (next.has(page.id)) next.delete(page.id)
                          else next.add(page.id)
                          return next
                        })
                      }
                    }}
                  >
                    <p className="preview-page-label">{page.label}</p>
                    <div className="preview-page-thumb choose-slides-thumb">
                      <div className="choose-slides-checkbox" aria-hidden>
                        {isSelected ? (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <rect width="20" height="20" rx="4" fill="#8b3dff"/>
                            <path d="M5 10l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <rect x="1" y="1" width="18" height="18" rx="4" fill="white" stroke="rgba(13, 13, 13, 0.2)" strokeWidth="2"/>
                          </svg>
                        )}
                      </div>
                      <img src={page.thumb} alt={page.label} />
                    </div>
                  </div>
                )
              })}
            </div>
          </main>
          <footer className="preview-footer">
            <button
              type="button"
              className="preview-remix-btn choose-slides-remix-btn"
              onClick={() => {
                setChooseSlidesItem(null)
                /* selected pages could be passed to edit flow */
              }}
            >
              Edit {selectedPageIds.size} slide{selectedPageIds.size !== 1 ? 's' : ''} with AI
            </button>
            <div className="preview-composer">
              <button type="button" className="preview-composer-icon" aria-label="Add">
                <img src="/svg/Icon.svg" alt="" width={20} height={20} />
              </button>
              <input type="text" className="preview-composer-input" placeholder="Ask anything" />
              <button type="button" className="preview-composer-send" aria-label="Send">
                <img src="/svg/_Composer-action/Send.svg" alt="" width={36} height={36} />
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* Full-screen edit document - edit content in full screen */}
      {editDocumentFullscreenOpen && (remixItem || widgetStep === 'generate-from-scratch') && (
        <div className="preview-fullscreen edit-document-fullscreen">
          <header className="preview-header">
            <div className="preview-header-left">
              <button
                type="button"
                className="preview-close-btn"
                onClick={() => setEditDocumentFullscreenOpen(false)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <h1 className="preview-title">Editable Document</h1>
            </div>
          </header>
          <main className="preview-main edit-document-main">
            <div className="edit-document-content">
              <h4 className="remix-doc-main-title">Deploy 2026 deck</h4>
              <textarea
                className="remix-doc-textarea edit-document-textarea"
                value={remixContent}
                onChange={(e) => setRemixContent(e.target.value)}
                placeholder="Start typing here..."
                spellCheck="true"
              />
            </div>
          </main>
          <footer className="preview-footer">
            <button
              type="button"
              className="preview-remix-btn"
              onClick={() => setEditDocumentFullscreenOpen(false)}
            >
              Done
            </button>
            <div className="preview-composer edit-document-composer">
              <button type="button" className="preview-composer-icon" aria-label="Add">
                <img src="/svg/Icon.svg" alt="" width={20} height={20} />
              </button>
              <input
                type="text"
                className="preview-composer-input"
                placeholder="Ask anything"
                autoFocus
              />
              <button type="button" className="preview-composer-send" aria-label="Send">
                <img src="/svg/_Composer-action/Send.svg" alt="" width={36} height={36} />
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* Full-screen design preview - all pages in grid */}
      {previewItem && (
        <div className="preview-fullscreen">
          <header className="preview-header">
            <div className="preview-header-left">
              <button
                type="button"
                className="preview-close-btn"
                onClick={() => {
                  setPreviewItem(null)
                  if (previewFromPicker) {
                    setPreviewFromPicker(false)
                    setCreateExistingPickerOpen(true)
                  }
                }}
                aria-label="Close preview"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <h1 className="preview-title">{previewItem.name}</h1>
            </div>
          </header>
          <main className="preview-main">
            <div className="preview-pages-grid">
              {(previewItem.pages || createPages()).map((page) => (
                <div key={page.id} className="preview-page-card">
                  <p className="preview-page-label">{page.label}</p>
                  <div className="preview-page-thumb">
                    <img src={page.thumb} alt={page.label} />
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      )}

      {/* Review outline overlay — Figma node 2274:27976 (Sales use case > Review outline). */}
      {reviewOutlineOpen && (
        <div className="preview-fullscreen review-outline-fullscreen">
          {/* Figma 2274:27978 — Header row, only the close button is visible (right side opacity-0 in Figma). */}
          <header className="preview-header review-outline-header-bar">
            <div className="preview-header-left">
              <button
                type="button"
                className="preview-close-btn"
                onClick={() => setReviewOutlineOpen(false)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </header>

          {/* Figma 2274:28136 / 2274:28137 — Sticky title block above the scrollable cards. */}
          <div className="review-outline-title-block">
            <h1 className="review-outline-title">Review outline</h1>
            <p className="review-outline-subtitle">
              Review and edit the outline via the chat below. Ask Canva to make edits to the length, tone, or text via the chat.
            </p>
          </div>

          <main className="preview-main review-outline-main">
            {/* Figma 2274:27997 — Outline cards container, max-width 658px, gap 12px. */}
            <div className="outline-cards">
              {assistantFirstTurnLoading ? (
                <div
                  className="review-outline-loading"
                  role="status"
                  aria-live="polite"
                  aria-label="Generating outline"
                >
                  <span className="chatgpt-loading-dot" aria-hidden />
                  <span className="canva-secondary-loading-chat-message">Generating outline…</span>
                </div>
              ) : assistantFirstTurn?.mode === 'outline' && assistantFirstTurn.sections?.length ? (
                assistantFirstTurn.sections.map((sec, idx) => (
                  <article
                    key={sec.num}
                    className={`outline-card${idx === 0 ? ' outline-card--first' : ''}`}
                  >
                    <h3 className="outline-card-title">{sec.title}</h3>
                    <p className="outline-card-desc">
                      {sec.desc}
                      {Array.isArray(sec.points) && sec.points.length > 0
                        ? ` ${sec.points.join('. ')}.`
                        : ''}
                    </p>
                  </article>
                ))
              ) : assistantFirstTurn?.mode === 'prose' && assistantFirstTurn.prose ? (
                <article className="outline-card outline-card--first">
                  <h3 className="outline-card-title">Response</h3>
                  <p className="outline-card-desc">{assistantFirstTurn.prose}</p>
                </article>
              ) : assistantFirstTurn?.mode === 'bullets' && assistantFirstTurn.bullets?.length ? (
                assistantFirstTurn.bullets.map((item, idx) => (
                  <article
                    key={idx}
                    className={`outline-card${idx === 0 ? ' outline-card--first' : ''}`}
                  >
                    <p className="outline-card-desc">{item}</p>
                  </article>
                ))
              ) : (
                <div className="review-outline-empty">
                  <p>No outline yet — submit a prompt to generate one.</p>
                </div>
              )}
            </div>
          </main>

          {/* Figma 2274:28103 — Composer pinned to bottom of the chat pane. */}
          <footer className="preview-footer review-outline-footer">
            <div className="preview-composer review-outline-composer">
              <button type="button" className="preview-composer-icon" aria-label="Add">
                <img src="/svg/Icon.svg" alt="" width={20} height={20} />
              </button>
              <input
                type="text"
                className="preview-composer-input"
                placeholder="Ask Canva"
              />
              <button type="button" className="preview-composer-icon" aria-label="Voice input">
                <img src="/svg/_Composer-action/Icon.svg" alt="" width={20} height={20} />
              </button>
              <button type="button" className="preview-composer-send review-outline-send-btn" aria-label="Send">
                <img src="/svg/_Composer-action/Send.svg" alt="" width={36} height={36} />
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* Next screen placeholder - shown when user submits */}
      {screen === 'next' && (
        <div className="next-screen-overlay">
          <div className="next-screen-message">
            <p>You submitted: "{prompt}"</p>
            <p className="next-screen-note">Next screen will be built when you're ready.</p>
            <button onClick={() => setScreen('home')}>Back to home</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
