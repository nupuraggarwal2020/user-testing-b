import { useEffect, useRef, useState } from 'react'

const DEFAULT_BRAND_KITS = [
  { id: 'canva', name: 'Canva Brand Kit', logo: '/brand-kits/canva.svg' },
  { id: 'design-experience', name: 'Design Experience', logo: '/brand-kits/design-experience.svg' },
  { id: 'affinity', name: 'Affinity', logo: '/brand-kits/affinity.svg' },
  // v1 label — left intact so toggling BRAND_REFRESH_V2 off in App.jsx restores it.
  { id: 'none', name: 'Unlinked Brand Templates', logo: '/brand-kits/none.svg' },
]

const DEFAULT_RECENT_DESIGNS = [
  { id: 'r1', name: 'Marketing asset 1', type: 'Instagram post', thumb: null },
  { id: 'r2', name: 'Master Brand Template', type: 'Instagram post', thumb: null },
  { id: 'r3', name: 'Brand Campaign', type: 'Presentation', thumb: null },
]

/**
 * Canva style-picker widget rendered inline in the chat thread.
 * Figma node 2901:23630 — Visual reference card
 *
 * @param {{
 *   selected: { id: string | number, name: string, type?: string, thumb: string } | null,
 *   templates?: Array<{ id: string | number, name: string, type?: string, thumb: string }>,
 *   getTemplatesForKit?: (kitId: string) => Array<{ id: string | number, name: string, type?: string, thumb: string }>,
 *   recentDesigns?: Array<{ id: string | number, name: string, type?: string, thumb: string }>,
 *   brandKits?: Array<{ id: string, name: string, logo: string }>,
 *   selectedBrandKitId?: string,
 *   onSelectBrandKit?: (kit: object) => void,
 *   onSelectTemplate?: (tpl: object) => void,
 *   onReviewOutline?: () => void,
 *   onGenerate?: () => void,
 *   disabled?: boolean,
 * }} props
 */
export default function StyleSelectionWidget({
  selected,
  templates = [],
  getTemplatesForKit,
  recentDesigns = DEFAULT_RECENT_DESIGNS,
  brandKits: brandKitsProp = DEFAULT_BRAND_KITS,
  selectedBrandKitId,
  onSelectBrandKit,
  onSelectTemplate,
  onReviewOutline,
  onGenerate,
  disabled = false,
  // BRAND_REFRESH_V2 toggle (see App.jsx). When true:
  //  - the 'none' kit's label is rewritten to "All Brand Templates"
  //  - the "Change reference" button uses a sliders/more-options icon
  // When false: behavior is identical to the original implementation.
  brandRefreshV2 = false,
  // A/B variant identifier (see App.jsx resolveBrandVariantFromUrl).
  //  - 'a' (default): current widget — main BK pill + Change-reference flyout
  //  - 'b': field-label switcher with unified kit + BT picker; no
  //         Change-reference button (Carrie / Rach / Emma / Tali feedback)
  brandVariant = 'a',
}) {
  // Derive the visible kit list. Renaming + the "All Brand Templates" glyph
  // swap happen here, in one place, so the raw DEFAULT_BRAND_KITS data and
  // any caller passing custom kits stay untouched. `iconNeedsBg: true` is a
  // hint to the renderer that the icon is a small transparent PNG and needs
  // a grey backdrop on its container (unlike the other kits, whose SVGs
  // include their own coloured backgrounds).
  const brandKits = brandRefreshV2
    ? brandKitsProp.map((k) =>
        k.id === 'none'
          ? {
              ...k,
              name: 'All Brand Templates',
              logo: '/brand-kits/all-templates.png',
              iconNeedsBg: true,
            }
          : k
      )
    : brandKitsProp
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [flyoutTab, setFlyoutTab] = useState('apply-brand') // 'apply-brand' | 'use-recent' | 'surprise-me'
  const [brandKitMenu, setBrandKitMenu] = useState(null) // null | 'main' | 'flyout'
  const [selectionMode, setSelectionMode] = useState('brand-template') // 'brand-template' | 'recent-design' | 'surprise-me'
  const [recentSearchQuery, setRecentSearchQuery] = useState('')
  /** Brand kit chosen inside the flyout but not yet committed to the main widget. */
  const [draftBrandKitId, setDraftBrandKitId] = useState(null)
  const flyoutRef = useRef(null)
  const brandKitMenuRef = useRef(null)
  const mainBrandKitBtnRef = useRef(null)
  const flyoutBrandKitBtnRef = useRef(null)
  const cardsScrollRef = useRef(null)
  const [showScrollNext, setShowScrollNext] = useState(false)

  // Variant B drill state — when set, the kit-pill dropdown is showing a
  // drilled-in pane (a kit's brand templates, or the recent-designs list).
  // Same dropdown panel; just swap the pane contents so the dropdown ↔ drill
  // transition feels like one continuous surface.
  //   null                                  → showing the categories list
  //   { kind: 'kit', kitId: string }        → drilled into that kit's BTs
  //   { kind: 'recent' }                    → drilled into recent designs
  const [bDrillView, setBDrillView] = useState(null)
  const bDrillScrollRef = useRef(null)
  const isVariantB = brandVariant === 'b'

  const isBrandTemplateMode = selectionMode === 'brand-template'

  const committedKitId = selectedBrandKitId ?? brandKits[0]?.id
  const selectedKitId = committedKitId
  const selectedKit = brandKits.find((k) => k.id === selectedKitId) ?? brandKits[0]
  const brandKitName = selectedKit?.name ?? 'Canva Brand Kit'

  // Effective kit shown inside the flyout — uses the draft until the user commits by picking a template.
  const flyoutKitId = draftBrandKitId ?? committedKitId
  const flyoutKit = brandKits.find((k) => k.id === flyoutKitId) ?? selectedKit
  const flyoutKitName = flyoutKit?.name ?? brandKitName

  const flyoutTemplates =
    getTemplatesForKit && draftBrandKitId
      ? getTemplatesForKit(draftBrandKitId)
      : templates.length > 0
        ? templates
        : []
  const visibleTemplates = templates.length > 0 ? templates : []

  // Use explicit selection for checkmarks; fall back to first template only for the preview display
  const displayTemplate = selected ?? visibleTemplates[0] ?? null
  const name = displayTemplate?.name ?? 'Canva Brand Template'
  const thumb = displayTemplate?.thumb
  const previewTag = displayTemplate?.type ?? 'Brand template'

  const filteredRecent = recentSearchQuery.trim()
    ? recentDesigns.filter(
        (d) =>
          d.name.toLowerCase().includes(recentSearchQuery.toLowerCase()) ||
          (d.type ?? '').toLowerCase().includes(recentSearchQuery.toLowerCase())
      )
    : recentDesigns

  const updateScrollHint = () => {
    const el = cardsScrollRef.current
    if (!el) return
    setShowScrollNext(el.scrollWidth - el.clientWidth - el.scrollLeft > 24)
  }

  useEffect(() => {
    if (!flyoutOpen) return
    updateScrollHint()
    const el = cardsScrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollHint, { passive: true })
    window.addEventListener('resize', updateScrollHint)
    return () => {
      el.removeEventListener('scroll', updateScrollHint)
      window.removeEventListener('resize', updateScrollHint)
    }
  }, [flyoutOpen, flyoutTab, visibleTemplates.length, filteredRecent.length])

  // Click-outside + Escape to close the change-selection flyout.
  useEffect(() => {
    if (!flyoutOpen) return
    const onPointer = (e) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target)) {
        setFlyoutOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setFlyoutOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [flyoutOpen])

  // Click-outside + Escape to close the brand-kit dropdown menu.
  useEffect(() => {
    if (!brandKitMenu) return
    const anchor =
      brandKitMenu === 'flyout' ? flyoutBrandKitBtnRef.current : mainBrandKitBtnRef.current
    const onPointer = (e) => {
      if (
        brandKitMenuRef.current &&
        !brandKitMenuRef.current.contains(e.target) &&
        (!anchor || !anchor.contains(e.target))
      ) {
        setBrandKitMenu(null)
        setBDrillView(null)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setBrandKitMenu(null)
        setBDrillView(null)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [brandKitMenu])

  // When flyout opens, sync the active tab to the current selectionMode so the
  // correct tab is shown and only the externally-selected design appears checked.
  // Also seed the draft kit so the flyout starts on the same brand kit as the main widget.
  useEffect(() => {
    if (!flyoutOpen) {
      setDraftBrandKitId(null)
      return
    }
    setDraftBrandKitId(committedKitId)
    if (selectionMode === 'brand-template') setFlyoutTab('apply-brand')
    else if (selectionMode === 'recent-design') setFlyoutTab('use-recent')
    else if (selectionMode === 'surprise-me') setFlyoutTab('surprise-me')
  }, [flyoutOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Variant B: drill state is reset at every site that closes the kit menu
  // (the handlers below plus the click-outside / Escape handlers above) so
  // the next open starts on the list pane. We do this inline rather than in
  // a useEffect to avoid the cascading-render lint rule.

  const handleSelectBrandKit = (kit) => {
    if (brandKitMenu === 'flyout') {
      // Inside the flyout: only update the draft. Main widget stays unchanged
      // until the user picks a template from this brand kit.
      setDraftBrandKitId(kit.id)
    } else {
      onSelectBrandKit?.(kit) // App.jsx auto-selects the first template of the new kit
      setSelectionMode('brand-template')
    }
    setBrandKitMenu(null)
    setBDrillView(null)
  }

  const handleCardClick = (tpl) => {
    // If the user changed brand kit inside the flyout, commit that kit before
    // committing the template they just picked.
    if (draftBrandKitId && draftBrandKitId !== committedKitId) {
      const kit = brandKits.find((k) => k.id === draftBrandKitId)
      if (kit) onSelectBrandKit?.(kit)
    }
    onSelectTemplate?.(tpl)
    setSelectionMode('brand-template')
    setFlyoutOpen(false)
  }

  const handleRecentDesignClick = (design) => {
    onSelectTemplate?.(design)
    setSelectionMode('recent-design')
    setFlyoutOpen(false)
  }

  const handleSurpriseGotIt = () => {
    setSelectionMode('surprise-me')
    setFlyoutOpen(false)
  }

  // ─── Variant B handlers ─────────────────────────────────────────────────
  // The drill menu is the only switcher in variant B, so each action commits
  // immediately and closes the menu. No draft/committed BK split (which
  // Carrie called out as confusing) — when the user taps a template inside a
  // kit's drill-view, we commit kit + template in one go. Drilling itself is
  // just navigation: no commit until the user picks something.
  const bDrillIntoKit = (kit) => setBDrillView({ kind: 'kit', kitId: kit.id })
  const bDrillIntoRecent = () => setBDrillView({ kind: 'recent' })
  const bBackToList = () => setBDrillView(null)

  const bHandleSelectTemplateInKit = (kitId, tpl) => {
    if (kitId && kitId !== committedKitId) {
      const kit = brandKits.find((k) => k.id === kitId)
      if (kit) onSelectBrandKit?.(kit)
    }
    onSelectTemplate?.(tpl)
    setSelectionMode('brand-template')
    setBrandKitMenu(null)
    setBDrillView(null)
  }
  const bHandleRecentDesign = (design) => {
    onSelectTemplate?.(design)
    setSelectionMode('recent-design')
    setBrandKitMenu(null)
    setBDrillView(null)
  }
  const bHandleSurpriseMe = () => {
    setSelectionMode('surprise-me')
    setBrandKitMenu(null)
    setBDrillView(null)
  }

  const renderBrandKitMenu = () => {
    // When the menu is opened from inside the flyout, highlight the draft kit;
    // when opened from the main widget, highlight the committed kit.
    const activeKitId = brandKitMenu === 'flyout' ? flyoutKitId : selectedKitId
    return (
    <div
      ref={brandKitMenuRef}
      className="brand-kit-menu"
      role="listbox"
      aria-label="Choose a brand kit"
      onClick={(e) => e.stopPropagation()}
    >
      {brandKits.map((kit) => {
        const isSelected = kit.id === activeKitId
        return (
          <button
            key={kit.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`brand-kit-menu__item${isSelected ? ' brand-kit-menu__item--selected' : ''}`}
            onClick={() => handleSelectBrandKit(kit)}
          >
            <span
              className={
                'brand-kit-menu__logo' +
                (kit.iconNeedsBg ? ' brand-kit-menu__logo--bg' : '')
              }
            >
              <img src={kit.logo} alt="" />
            </span>
            <span className="brand-kit-menu__label">{kit.name}</span>
          </button>
        )
      })}
    </div>
    )
  }

  // ─── Variant B: drill menu (replaces the simple kit list) ───────────────
  // Same dropdown panel as variant A's `.brand-kit-menu` (same width, anchored
  // to the same kit pill) — but with two panes:
  //   • list pane: All BT first, then kits, divider, Recent design, Surprise me
  //   • drill pane: back arrow + carousel for the selected category
  // Rendered as a single panel so the dropdown ↔ flyout dimensions stay stable
  // (one continuous surface, no separate popover).
  const renderBrandKitDrillMenu = () => {
    // "All Brand Templates" moves to the top in B (was last in A's data order).
    // Built once locally to avoid mutating the source array.
    const allBtKit = brandKits.find((k) => k.id === 'none')
    const otherKits = brandKits.filter((k) => k.id !== 'none')
    const orderedKits = allBtKit ? [allBtKit, ...otherKits] : otherKits

    // ─── List pane ───
    if (bDrillView == null) {
      return (
        <div
          ref={brandKitMenuRef}
          className="brand-kit-menu brand-kit-menu--drill brand-kit-menu--drill-list"
          role="menu"
          aria-label="Choose a reference"
          onClick={(e) => e.stopPropagation()}
        >
          {orderedKits.map((kit) => {
            const isCommitted =
              selectionMode === 'brand-template' && kit.id === selectedKitId
            return (
              <button
                key={kit.id}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className={`brand-kit-menu__item brand-kit-menu__item--drill${
                  isCommitted ? ' brand-kit-menu__item--selected' : ''
                }`}
                onClick={() => bDrillIntoKit(kit)}
              >
                <span
                  className={
                    'brand-kit-menu__logo' +
                    (kit.iconNeedsBg ? ' brand-kit-menu__logo--bg' : '')
                  }
                >
                  <img src={kit.logo} alt="" />
                </span>
                <span className="brand-kit-menu__label">{kit.name}</span>
                <span className="brand-kit-menu__chev" aria-hidden>
                  <ChevronRight />
                </span>
              </button>
            )
          })}

          <div className="brand-kit-menu__divider" aria-hidden />

          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            className={`brand-kit-menu__item brand-kit-menu__item--drill${
              selectionMode === 'recent-design' ? ' brand-kit-menu__item--selected' : ''
            }`}
            onClick={bDrillIntoRecent}
          >
            <span className="brand-kit-menu__logo brand-kit-menu__logo--icon" aria-hidden>
              <ImagesIcon />
            </span>
            <span className="brand-kit-menu__label">Use a recent design</span>
            <span className="brand-kit-menu__chev" aria-hidden>
              <ChevronRight />
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={`brand-kit-menu__item brand-kit-menu__item--drill brand-kit-menu__item--terminal${
              selectionMode === 'surprise-me' ? ' brand-kit-menu__item--selected' : ''
            }`}
            onClick={bHandleSurpriseMe}
          >
            <span className="brand-kit-menu__logo brand-kit-menu__logo--icon" aria-hidden>
              <MagicWandIcon />
            </span>
            <span className="brand-kit-menu__label">Surprise me</span>
          </button>
        </div>
      )
    }

    // ─── Drill pane: kit → BT carousel ───
    if (bDrillView.kind === 'kit') {
      const kit = brandKits.find((k) => k.id === bDrillView.kitId)
      const drillTemplates =
        getTemplatesForKit && kit ? getTemplatesForKit(kit.id) : visibleTemplates
      return (
        <div
          ref={brandKitMenuRef}
          className="brand-kit-menu brand-kit-menu--drill brand-kit-menu--drill-pane"
          role="menu"
          aria-label={`${kit?.name ?? 'Brand kit'} templates`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="brand-kit-menu-drill__header">
            <button
              type="button"
              className="brand-kit-menu-drill__back"
              onClick={bBackToList}
              aria-label="Back to references"
            >
              <ChevronLeft />
            </button>
            <span className="brand-kit-menu-drill__title">
              <span
                className={
                  'brand-kit-menu-drill__title-logo' +
                  (kit?.iconNeedsBg ? ' brand-kit-menu-drill__title-logo--bg' : '')
                }
                aria-hidden
              >
                <img src={kit?.logo} alt="" />
              </span>
              {kit?.name ?? 'Brand kit'}
            </span>
          </div>
          <div className="brand-kit-menu-drill__cards" ref={bDrillScrollRef}>
            {drillTemplates.map((tpl) => {
              const isSelected =
                selectionMode === 'brand-template' &&
                kit?.id === committedKitId &&
                selected != null &&
                selected.id === tpl.id
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className={`brand-kit-menu-drill__card${
                    isSelected ? ' brand-kit-menu-drill__card--selected' : ''
                  }`}
                  onClick={() => bHandleSelectTemplateInKit(kit?.id, tpl)}
                  disabled={disabled}
                >
                  <div className="brand-kit-menu-drill__thumb">
                    <img src={tpl.thumb} alt="" />
                    {isSelected ? (
                      <span className="brand-kit-menu-drill__check" aria-hidden>
                        <CheckCircleFilled />
                      </span>
                    ) : null}
                  </div>
                  <p className="brand-kit-menu-drill__name">{tpl.name}</p>
                  <p className="brand-kit-menu-drill__type">{tpl.type ?? 'Brand template'}</p>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    // ─── Drill pane: recent designs carousel ───
    return (
      <div
        ref={brandKitMenuRef}
        className="brand-kit-menu brand-kit-menu--drill brand-kit-menu--drill-pane"
        role="menu"
        aria-label="Recent designs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="brand-kit-menu-drill__header">
          <button
            type="button"
            className="brand-kit-menu-drill__back"
            onClick={bBackToList}
            aria-label="Back to references"
          >
            <ChevronLeft />
          </button>
          <span className="brand-kit-menu-drill__title">
            <span className="brand-kit-menu-drill__title-logo brand-kit-menu-drill__title-logo--icon" aria-hidden>
              <ImagesIcon />
            </span>
            Use a recent design
          </span>
        </div>
        <div className="brand-kit-menu-drill__cards" ref={bDrillScrollRef}>
          {recentDesigns.length === 0 ? (
            <p className="brand-kit-menu-drill__empty">No recent designs</p>
          ) : (
            recentDesigns.map((d) => {
              const isSel = selectionMode === 'recent-design' && selected && selected.id === d.id
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`brand-kit-menu-drill__card${
                    isSel ? ' brand-kit-menu-drill__card--selected' : ''
                  }`}
                  onClick={() => bHandleRecentDesign(d)}
                  disabled={disabled}
                >
                  <div className="brand-kit-menu-drill__thumb">
                    {d.thumb ? (
                      <img src={d.thumb} alt="" />
                    ) : (
                      <div className="brand-kit-menu-drill__thumb-empty" />
                    )}
                    {isSel ? (
                      <span className="brand-kit-menu-drill__check" aria-hidden>
                        <CheckCircleFilled />
                      </span>
                    ) : null}
                  </div>
                  <p className="brand-kit-menu-drill__name">{d.name}</p>
                  <p className="brand-kit-menu-drill__type">{d.type ?? 'Design'}</p>
                </button>
              )
            })
          )}
        </div>
      </div>
    )
  }

  const scrollNext = () => {
    const el = cardsScrollRef.current
    if (!el) return
    const cardW = 177 + 8
    el.scrollBy({ left: cardW * 2, behavior: 'smooth' })
  }

  const renderScrollBtn = () =>
    showScrollNext ? (
      <div className="style-flyout__scroll-fade" aria-hidden>
        <button
          type="button"
          className="style-flyout__scroll-btn"
          onClick={scrollNext}
          aria-label="Scroll to more templates"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <polyline
              points="8 5 13 10 8 15"
              stroke="#0d0d0d"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
    ) : null

  const changeRefButton = (
    <button
      type="button"
      className={
        'style-selection-widget__change-ref-btn' +
        (brandRefreshV2 ? ' style-selection-widget__change-ref-btn--v2' : '')
      }
      onClick={(e) => {
        e.stopPropagation()
        setFlyoutOpen((v) => !v)
      }}
      disabled={disabled}
      aria-expanded={flyoutOpen}
      aria-haspopup="dialog"
    >
      {brandRefreshV2 ? (
        // v2: sliders / "more options" icon. The previous refresh-circle icon
        // was being read as "shuffle the reference" (Rach + Emma feedback in
        // #ecosystemxbex), which collides with what the button actually does
        // (open a flyout with Apply Brand / Use recent / Surprise me).
        <MoreOptionsIcon fill="#8c8e92" />
      ) : (
        <RegenerateIcon fill="#8c8e92" />
      )}
      <span>Change reference</span>
    </button>
  )

  // When the flyout is open we always render the brand-template header layout
  // so the flyout's top position (and overall widget height) stays consistent
  // regardless of the committed selection mode. Variant B has no flyout and
  // the pill is the only switcher, so we always show the kit row.
  const showBrandKitRow = isBrandTemplateMode || flyoutOpen || isVariantB

  // Variant B contextual pill label/logo — the pill is now the single entry
  // point, so it has to represent recent-design / surprise-me modes too.
  // `pillIconKind` selects which renderer to use inside the icon slot:
  //   'kit-logo' (default) — the brand kit's square logo image
  //   'images'             — <ImagesIcon /> (matches "Use a recent design" row)
  //   'wand'               — <MagicWandIcon /> (matches "Surprise me" row)
  // `pillPrefix` is a light-grey prefix word shown before the label, used
  // in Variant B for the brand-template case ("Brand Kit: OpenAI") to give
  // the pill clearer labelling without growing the chip.
  let pillLabel = brandKitName
  let pillPrefix = null
  let pillIconKind = 'kit-logo'
  if (isVariantB) {
    if (selectionMode === 'recent-design') {
      // Drop the design thumbnail — use the same icon as the dropdown row
      // ("Use a recent design") and the same wording for consistency.
      pillLabel = 'Use a recent design'
      pillIconKind = 'images'
    } else if (selectionMode === 'surprise-me') {
      pillLabel = 'Surprise me'
      pillIconKind = 'wand'
    } else if (selectedKit?.id !== 'none') {
      // "All Brand Templates" (id: 'none') already reads as a brand-template
      // concept on its own; prefixing "Brand Kit:" produces an awkward
      // "Brand Kit: All Brand Templates" so we omit the prefix in that case.
      pillPrefix = 'Brand Kit:'
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //                           Render
  // Variant A: kit-pill dropdown (kits only) + "Change reference" flyout.
  // Variant B: kit-pill dropdown is a *drill menu* — list of kits/recent/
  //            surprise with chevrons; clicking a row drills into a carousel
  //            inside the same panel (same width, back arrow to return).
  //            No "Change reference" button, no flyout.
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div
      className={`style-selection-widget${flyoutOpen ? ' style-selection-widget--flyout-open' : ''}`}
      role="group"
      aria-label="Style selection"
    >
      {showBrandKitRow ? (
        <>
          {/* Figma node 2901:23639 — "Visual reference" title */}
          <p className="style-selection-widget__title">Visual reference</p>

          {/* Figma node 2901:23713 / 2901:23718 — Brand kit picker + Change reference row */}
          <div className="style-selection-widget__kit-row">
            <div
              className={
                'style-selection-widget__brand-kit-wrap' +
                (isVariantB && brandKitMenu === 'main'
                  ? ' style-selection-widget__brand-kit-wrap--drill-open'
                  : '')
              }
            >
              <button
                ref={mainBrandKitBtnRef}
                type="button"
                className="style-selection-widget__brand-kit style-selection-widget__brand-kit--slim"
                onClick={(e) => {
                  e.stopPropagation()
                  setBrandKitMenu((m) => (m === 'main' ? null : 'main'))
                  // Always start the variant B drill menu on the list pane.
                  setBDrillView(null)
                }}
                disabled={disabled}
                aria-haspopup={isVariantB ? 'menu' : 'listbox'}
                aria-expanded={brandKitMenu === 'main'}
              >
                <span
                  className={
                    'style-selection-widget__brand-kit-icon' +
                    // Apply the grey backdrop when the icon is the kit logo AND
                    // that kit has a transparent glyph that needs a backdrop
                    // (currently: "All Brand Templates"). The wand and images
                    // icons have their own visual treatment.
                    (pillIconKind === 'kit-logo' && selectedKit?.iconNeedsBg
                      ? ' style-selection-widget__brand-kit-icon--bg'
                      : '')
                  }
                  aria-hidden
                >
                  {pillIconKind === 'wand' ? (
                    <MagicWandIcon />
                  ) : pillIconKind === 'images' ? (
                    <ImagesIcon />
                  ) : (
                    <img src={selectedKit?.logo} alt="" className="style-selection-widget__brand-kit-logo" />
                  )}
                </span>
                <span className="style-selection-widget__brand-kit-label">
                  {pillPrefix ? (
                    <span className="style-selection-widget__brand-kit-label-prefix">
                      {pillPrefix}{' '}
                    </span>
                  ) : null}
                  {pillLabel}
                </span>
                <span className="style-selection-widget__brand-kit-chevron" aria-hidden>
                  <ChevronDown />
                </span>
              </button>
              {brandKitMenu === 'main'
                ? (isVariantB ? renderBrandKitDrillMenu() : renderBrandKitMenu())
                : null}
            </div>
            {/* Variant B replaces the Change reference button with the drill
                menu, so the button (and flyout it triggers) are hidden. */}
            {isVariantB ? null : changeRefButton}
          </div>
        </>
      ) : (
        /* For recent-design / surprise-me: title and Change reference in the same row, no brand kit dropdown */
        <div className="style-selection-widget__title-row">
          <p className="style-selection-widget__title">Visual reference</p>
          {isVariantB ? null : changeRefButton}
        </div>
      )}

      {/* Preview — no "Change selection" button overlaid; only meta at bottom */}
      {selectionMode === 'surprise-me' ? (
        <div className="style-selection-widget__preview style-selection-widget__preview--surprise">
          <div className="style-selection-widget__surprise-illustration" aria-hidden>
            <SurpriseMeIllustration />
          </div>
          <div className="style-selection-widget__preview-overlay style-selection-widget__preview-overlay--light">
            <div className="style-selection-widget__preview-meta">
              <p className="style-selection-widget__preview-tag">Surprise me</p>
              <p className="style-selection-widget__preview-name">A visual vibe to suit your design</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="style-selection-widget__preview">
          {thumb ? (
            <img
              src={thumb}
              alt={`${name} preview`}
              className="style-selection-widget__preview-img"
            />
          ) : (
            <div className="style-selection-widget__preview-img style-selection-widget__preview-img--empty" />
          )}
          <div className="style-selection-widget__preview-overlay">
            <div className="style-selection-widget__preview-meta">
              <p className="style-selection-widget__preview-tag">{previewTag}</p>
              <p className="style-selection-widget__preview-name">{name}</p>
            </div>
          </div>
        </div>
      )}

      <div className="style-selection-widget__actions">
        <button
          type="button"
          className="style-selection-widget__btn-secondary"
          onClick={(e) => {
            e.stopPropagation()
            onReviewOutline?.()
          }}
          disabled={disabled || !onReviewOutline}
        >
          Review outline
        </button>
        <button
          type="button"
          className="style-selection-widget__btn-primary"
          onClick={(e) => {
            e.stopPropagation()
            onGenerate?.()
          }}
          disabled={disabled || !onGenerate}
        >
          Generate design
        </button>
      </div>

      {flyoutOpen && !isVariantB ? (
        <div
          className="style-flyout"
          role="dialog"
          aria-label="Change brand template"
          ref={flyoutRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="style-flyout__tabs" role="tablist" aria-label="Source for style">
            <FlyoutTab
              icon={<InpaintIcon />}
              label="Apply Brand"
              selected={flyoutTab === 'apply-brand'}
              onClick={() => setFlyoutTab('apply-brand')}
            />
            <FlyoutTab
              icon={<ImagesIcon />}
              label="Use recent design"
              selected={flyoutTab === 'use-recent'}
              onClick={() => setFlyoutTab('use-recent')}
            />
            <FlyoutTab
              icon={<MagicWandIcon />}
              label="Surprise me"
              selected={flyoutTab === 'surprise-me'}
              onClick={() => setFlyoutTab('surprise-me')}
            />
          </div>

          <div className="style-flyout__divider" aria-hidden />

          {flyoutTab === 'apply-brand' && (
            <>
              <div className="style-selection-widget__brand-kit-wrap">
                <button
                  ref={flyoutBrandKitBtnRef}
                  type="button"
                  className="style-selection-widget__brand-kit"
                  onClick={(e) => {
                    e.stopPropagation()
                    setBrandKitMenu((m) => (m === 'flyout' ? null : 'flyout'))
                  }}
                  disabled={disabled}
                  aria-haspopup="listbox"
                  aria-expanded={brandKitMenu === 'flyout'}
                >
                  <span
                    className={
                      'style-selection-widget__brand-kit-icon' +
                      (flyoutKit?.iconNeedsBg ? ' style-selection-widget__brand-kit-icon--bg' : '')
                    }
                    aria-hidden
                  >
                    <img src={flyoutKit?.logo} alt="" className="style-selection-widget__brand-kit-logo" />
                  </span>
                  <span className="style-selection-widget__brand-kit-label">{flyoutKitName}</span>
                  <span className="style-selection-widget__brand-kit-chevron" aria-hidden>
                    <ChevronDown />
                  </span>
                </button>
                {brandKitMenu === 'flyout' ? renderBrandKitMenu() : null}
              </div>

              <div className="style-flyout__cards-wrap">
                <div className="style-flyout__cards" ref={cardsScrollRef}>
                  {flyoutTemplates.map((tpl) => {
                    // Only highlight a card as selected when the flyout's draft kit
                    // matches the committed kit — otherwise the user is browsing a
                    // different kit and nothing should appear pre-selected.
                    const draftMatchesCommitted = flyoutKitId === committedKitId
                    const isSelected =
                      draftMatchesCommitted &&
                      selectionMode === 'brand-template' &&
                      selected != null &&
                      selected.id === tpl.id
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        className={`style-flyout__card${isSelected ? ' style-flyout__card--selected' : ''}`}
                        onClick={() => handleCardClick(tpl)}
                        disabled={disabled}
                      >
                        <div className="style-flyout__card-thumb">
                          <img src={tpl.thumb} alt="" />
                          {isSelected ? (
                            <span className="style-flyout__card-check" aria-hidden>
                              <CheckCircleFilled />
                            </span>
                          ) : null}
                        </div>
                        <p className="style-flyout__card-name">{tpl.name}</p>
                        <p className="style-flyout__card-type">{tpl.type ?? 'Brand template'}</p>
                      </button>
                    )
                  })}
                </div>
                {renderScrollBtn()}
              </div>
            </>
          )}

          {flyoutTab === 'use-recent' && (
            <>
              <div className="style-flyout__search">
                <span className="style-flyout__search-icon" aria-hidden>
                  <SearchIcon />
                </span>
                <input
                  className="style-flyout__search-input"
                  type="text"
                  placeholder="Search by keyword or URL"
                  value={recentSearchQuery}
                  onChange={(e) => setRecentSearchQuery(e.target.value)}
                />
              </div>

              <div className="style-flyout__cards-wrap">
                <div className="style-flyout__cards" ref={cardsScrollRef}>
                  {filteredRecent.length === 0 ? (
                    <p className="style-flyout__no-results">No designs found</p>
                  ) : (
                    filteredRecent.map((design) => {
                      const isSelected = selectionMode === 'recent-design' && selected != null && selected.id === design.id
                      return (
                        <button
                          key={design.id}
                          type="button"
                          className={`style-flyout__card${isSelected ? ' style-flyout__card--selected' : ''}`}
                          onClick={() => handleRecentDesignClick(design)}
                          disabled={disabled}
                        >
                          <div className="style-flyout__card-thumb">
                            {design.thumb ? (
                              <img src={design.thumb} alt="" />
                            ) : (
                              <div className="style-flyout__card-thumb-empty" />
                            )}
                            {isSelected ? (
                              <span className="style-flyout__card-check" aria-hidden>
                                <CheckCircleFilled />
                              </span>
                            ) : null}
                          </div>
                          <p className="style-flyout__card-name">{design.name}</p>
                          <p className="style-flyout__card-type">{design.type ?? 'Design'}</p>
                        </button>
                      )
                    })
                  )}
                </div>
                {renderScrollBtn()}
              </div>
            </>
          )}

          {flyoutTab === 'surprise-me' && (
            <div className="style-flyout__surprise">
              <div className="style-flyout__surprise-icon" aria-hidden>
                <SurpriseMeIllustration />
              </div>
              <p className="style-flyout__surprise-title">
                A visual vibe to suit your design
              </p>
              <p className="style-flyout__surprise-body">
                Have your design's colors, fonts, and layout chosen for you.
              </p>
              <button
                type="button"
                className="style-flyout__surprise-link"
                onClick={handleSurpriseGotIt}
              >
                Let's do it!
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function FlyoutTab({ icon, label, selected, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`style-flyout__tab${selected ? ' style-flyout__tab--selected' : ''}`}
      onClick={onClick}
    >
      <span className="style-flyout__tab-icon" aria-hidden>
        {icon}
      </span>
      <span className="style-flyout__tab-label">{label}</span>
    </button>
  )
}

function CheckCircleFilled() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#8b3dff" />
      <path
        d="M7.5 12.25l3 3 6-6.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <polyline
        points="6 8.5 10 12.5 14 8.5"
        stroke="#0d0d0d"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <polyline
        points="8 5 13 10 8 15"
        stroke="#8c8e92"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <polyline
        points="12 5 7 10 12 15"
        stroke="#0d0d0d"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function RegenerateIcon({ fill = 'white' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M2.30272 8.1572C2.71802 4.82673 5.55779 2.25 9.00053 2.25C10.7123 2.25 12.3026 2.888 13.5094 3.94079V3C13.5094 2.58579 13.8452 2.25 14.2594 2.25C14.6736 2.25 15.0094 2.58579 15.0094 3V6C15.0094 6.41421 14.6736 6.75 14.2594 6.75H11.2505C10.8363 6.75 10.5005 6.41421 10.5005 6C10.5005 5.58579 10.8363 5.25 11.2505 5.25H12.7184C11.7573 4.32284 10.4331 3.75 9.00053 3.75C6.32385 3.75 4.11403 5.75381 3.79119 8.3428C3.73993 8.75383 3.36518 9.04549 2.95415 8.99424C2.54312 8.94298 2.25146 8.56823 2.30272 8.1572ZM15.0469 9.00576C15.4579 9.05702 15.7496 9.43177 15.6983 9.84281C15.283 13.1733 12.4433 15.75 9.00053 15.75C7.29295 15.75 5.70625 15.1151 4.50053 14.0669V15C4.50053 15.4142 4.16475 15.75 3.75053 15.75C3.33632 15.75 3.00053 15.4142 3.00053 15V12C3.00053 11.5858 3.33632 11.25 3.75053 11.25H6.75053C7.16475 11.25 7.50053 11.5858 7.50053 12C7.50053 12.4142 7.16475 12.75 6.75053 12.75H5.28267C6.24379 13.6772 7.56795 14.25 9.00053 14.25C11.6772 14.25 13.887 12.2462 14.2099 9.65719C14.2611 9.24616 14.6359 8.95451 15.0469 9.00576Z"
        fill={fill}
      />
    </svg>
  )
}

/**
 * "More options" icon used by the v2 Change reference button.
 *
 * Three horizontal rails with offset knobs — universally read as "options /
 * adjust", which fits the button's actual job (open a flyout with multiple
 * ways to reference a style) and avoids the shuffle/refresh misread.
 */
function MoreOptionsIcon({ fill = '#8c8e92' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 3.75A.75.75 0 0 1 2.75 3h4.6a2.251 2.251 0 0 1 4.3 0h1.6a.75.75 0 0 1 0 1.5h-1.6a2.251 2.251 0 0 1-4.3 0h-4.6A.75.75 0 0 1 2 3.75ZM9.5 3a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
        fill={fill}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 8a.75.75 0 0 1 .75-.75h1.6a2.251 2.251 0 0 1 4.3 0h4.6a.75.75 0 0 1 0 1.5h-4.6a2.251 2.251 0 0 1-4.3 0h-1.6A.75.75 0 0 1 2 8Zm4.5-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
        fill={fill}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 12.25a.75.75 0 0 1 .75-.75h4.6a2.251 2.251 0 0 1 4.3 0h1.6a.75.75 0 0 1 0 1.5h-1.6a2.251 2.251 0 0 1-4.3 0h-4.6a.75.75 0 0 1-.75-.75Zm7.5-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
        fill={fill}
      />
    </svg>
  )
}

function InpaintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.2917 1.67552C12.8871 1.36704 13.5914 1.50609 14.0424 1.9571C14.4934 2.40812 14.6325 3.11236 14.324 3.70775C13.7519 4.81184 13.0736 5.77898 12.2573 6.64847C13.078 7.669 13.6947 8.72617 13.9552 9.721C14.2588 10.8804 14.0886 12.0493 13.0829 12.8539C12.2751 13.5001 11.3674 13.4129 10.6425 13.1134C9.93691 12.8219 9.31109 12.3006 8.88149 11.8857C8.61667 11.6299 8.60935 11.2079 8.86514 10.943C9.12094 10.6782 9.54298 10.6709 9.80781 10.9267C10.1947 11.3004 10.6769 11.685 11.1516 11.8811C11.6069 12.0692 11.9519 12.0512 12.25 11.8127C12.7205 11.4363 12.881 10.8822 12.6654 10.0588C12.4754 9.33341 12.0029 8.47788 11.2919 7.57649C10.9048 7.91318 10.4914 8.23525 10.0493 8.54559C10.0296 8.55936 10.0095 8.57193 9.98903 8.5833C9.9477 9.06816 9.78459 9.48304 9.49742 9.81372C9.17049 10.1902 8.7394 10.3919 8.32741 10.5042C7.67068 10.6832 6.88458 10.6718 6.31098 10.6634C6.2006 10.6618 6.09808 10.6603 6.00587 10.6603C5.63768 10.6603 5.33921 10.3618 5.33921 9.99362C5.33921 9.90141 5.33771 9.7989 5.3361 9.68851C5.32774 9.11492 5.31629 8.32882 5.49527 7.67208C5.60755 7.2601 5.80934 6.829 6.18578 6.50208C6.51645 6.2149 6.93134 6.05179 7.41619 6.01047C7.42757 5.98997 7.44014 5.96986 7.45391 5.95025C7.71892 5.57271 7.99248 5.21608 8.2764 4.87889C6.3494 3.82124 4.49638 3.90772 3.5353 4.8688C2.89012 5.51398 2.63532 6.53247 2.86415 7.75288C3.09226 8.96949 3.79544 10.3144 4.94951 11.4685C5.63086 12.1498 6.36707 12.6256 6.96925 12.9297C7.27 13.0815 7.53184 13.1877 7.72976 13.2543C7.87793 13.3043 7.96285 13.3226 7.99401 13.3294C8.01051 13.333 8.01195 13.3333 7.99975 13.3333C8.36794 13.3333 8.66641 13.6318 8.6664 14C8.6664 14.3681 8.36791 14.6666 7.99972 14.6666C7.79781 14.6666 7.5379 14.5967 7.30413 14.5179C7.0417 14.4295 6.72139 14.2981 6.36836 14.1199C5.66297 13.7638 4.80501 13.2096 4.0067 12.4113C2.68745 11.092 1.83738 9.51183 1.55365 7.9986C1.27064 6.48918 1.54539 4.9731 2.59249 3.926C4.22808 2.2904 6.94118 2.52816 9.20891 3.87764C10.1149 3.00061 11.1271 2.27893 12.2917 1.67552ZM8.83789 6.31366C9.18898 6.51755 9.48194 6.81051 9.68584 7.1616C11.1952 6.0248 12.2933 4.72875 13.1401 3.09436C13.1664 3.04359 13.1632 2.96349 13.0996 2.89991C13.036 2.83634 12.9559 2.83308 12.9051 2.85939C11.2707 3.7062 9.97469 4.80431 8.83789 6.31366ZM6.6672 9.3323C7.14328 9.33482 7.59266 9.32251 7.97682 9.21781C8.23568 9.14726 8.39497 9.0497 8.49072 8.93945C8.57742 8.83962 8.66623 8.66772 8.66623 8.33011C8.66623 7.77957 8.21992 7.33327 7.66938 7.33327C7.33177 7.33327 7.15988 7.42208 7.06005 7.50877C6.94979 7.60452 6.85223 7.76382 6.78168 8.02267C6.67699 8.40684 6.66468 8.85621 6.6672 9.3323Z" fill="#0D0D0D"/>
    </svg>
  )
}

function ImagesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.11908 7.87861C8.19594 8.42552 7.8149 8.93119 7.26799 9.00805C6.72108 9.08492 6.21541 8.70387 6.13854 8.15696C6.06168 7.61005 6.44273 7.10438 6.98964 7.02751C7.53655 6.95065 8.04222 7.3317 8.11908 7.87861Z" fill="#0D0D0D"/>
      <path d="M9.51893 1.13825L11.8234 1.4212C12.356 1.48659 12.7956 1.54056 13.1501 1.61379C13.5183 1.68985 13.8522 1.79705 14.1533 2.00011C14.6201 2.31502 14.9753 2.76964 15.1679 3.29883C15.2921 3.64006 15.3154 3.98997 15.3001 4.36564C15.2854 4.72734 15.2314 5.16694 15.166 5.69958L14.8831 8.00399C14.8177 8.53665 14.7637 8.97627 14.6905 9.33079C14.6144 9.69899 14.5072 10.0329 14.3041 10.3339C13.9892 10.8008 13.5346 11.156 13.0054 11.3486C12.9512 11.3684 12.8963 11.3857 12.8406 11.4008C12.4853 11.4972 12.1191 11.2873 12.0226 10.932C11.9262 10.5767 12.1361 10.2104 12.4914 10.114C12.5117 10.1085 12.5309 10.1024 12.5494 10.0957C12.814 9.99938 13.0413 9.82179 13.1988 9.58835C13.2642 9.49134 13.3254 9.34826 13.3847 9.06107C13.4456 8.76623 13.4934 8.38099 13.563 7.8142L13.8393 5.56443C13.9088 4.99763 13.9556 4.61227 13.9679 4.31145C13.9798 4.01845 13.955 3.86482 13.915 3.75485C13.8187 3.49026 13.6411 3.26295 13.4077 3.1055C13.3107 3.04006 13.1676 2.97888 12.8804 2.91956C12.5856 2.85866 12.2003 2.81083 11.6335 2.74124L9.38377 2.465C8.81697 2.39541 8.4316 2.34862 8.13079 2.33638C7.83779 2.32446 7.68416 2.34921 7.57419 2.38923C7.3096 2.48554 7.08229 2.66313 6.92483 2.89656C6.88026 2.96264 6.83759 3.05044 6.7964 3.18945C6.69178 3.54246 6.3208 3.74383 5.96779 3.63921C5.61477 3.53459 5.4134 3.16361 5.51802 2.8106C5.5879 2.57479 5.68149 2.35551 5.81945 2.15097C6.13436 1.68411 6.58898 1.32892 7.11817 1.13631C7.4594 1.01211 7.80931 0.988869 8.18498 1.00415C8.54668 1.01886 8.98628 1.07284 9.51893 1.13825ZM7.83948 5.86686C7.53867 5.87909 7.1533 5.92589 6.5865 5.99548L4.33673 6.27172C3.76994 6.34131 3.3847 6.38914 3.08986 6.45004C2.80268 6.50936 2.6596 6.57054 2.56258 6.63597C2.32915 6.79343 2.15155 7.02074 2.05525 7.28533C2.01522 7.39529 1.99048 7.54892 2.0024 7.84193C2.01463 8.14274 2.06143 8.52811 2.13102 9.0949L2.31603 10.6017C2.45524 10.4507 2.58401 10.3164 2.70555 10.2C2.96623 9.95043 3.23239 9.74419 3.55611 9.6119C4.05965 9.40611 4.61409 9.35924 5.14503 9.47758C5.48637 9.55366 5.78337 9.71229 6.08225 9.91459C6.36946 10.109 6.69967 10.3732 7.09891 10.6926L9.54211 12.6471C9.63585 12.5322 9.71034 12.4017 9.7617 12.2605C9.80172 12.1506 9.82647 11.9969 9.81455 11.7039C9.80232 11.4031 9.75552 11.0178 9.68593 10.451L9.40969 8.2012C9.3401 7.6344 9.29227 7.24916 9.23137 6.95432C9.17205 6.66714 9.11087 6.52406 9.04544 6.42704C8.88798 6.19361 8.66067 6.01601 8.39608 5.91971C8.28612 5.87969 8.13249 5.85494 7.83948 5.86686ZM8.09478 13.1968L6.28681 11.7504C5.86149 11.4101 5.57274 11.1798 5.33487 11.0188C5.1037 10.8623 4.96603 10.8037 4.85498 10.779C4.5895 10.7198 4.31229 10.7432 4.06051 10.8461C3.95519 10.8892 3.82931 10.97 3.62768 11.1631C3.42021 11.3617 3.17423 11.6373 2.81207 12.0441L2.54121 12.3484C2.55554 12.4362 2.57014 12.5168 2.58558 12.5915C2.6449 12.8787 2.70607 13.0218 2.77151 13.1188C2.92896 13.3523 3.15628 13.5299 3.42087 13.6262C3.53083 13.6662 3.68446 13.6909 3.97747 13.679C4.27828 13.6668 4.66365 13.62 5.23044 13.5504L7.48021 13.2742C7.71377 13.2455 7.9165 13.2205 8.09478 13.1968ZM7.78529 4.53463C8.16096 4.51935 8.51087 4.54259 8.85211 4.66679C9.38129 4.85939 9.83591 5.21458 10.1508 5.68145C10.3539 5.98251 10.4611 6.3164 10.5371 6.68461C10.6104 7.03913 10.6643 7.47874 10.7297 8.01141L11.0127 10.3157C11.0781 10.8484 11.1321 11.288 11.1468 11.6498C11.1621 12.0254 11.1388 12.3753 11.0146 12.7166C10.822 13.2458 10.4668 13.7004 9.99996 14.0153C9.6989 14.2183 9.36501 14.3255 8.9968 14.4016C8.64228 14.4748 8.20266 14.5288 7.67 14.5942L5.3656 14.8771C4.83296 14.9425 4.39335 14.9965 4.03166 15.0112C3.65599 15.0265 3.30608 15.0033 2.96484 14.8791C2.43566 14.6865 1.98103 14.3313 1.66613 13.8644C1.46306 13.5634 1.35586 13.2295 1.27981 12.8613C1.20658 12.5068 1.15261 12.0671 1.08722 11.5345L0.804269 9.23007C0.738859 8.69742 0.684876 8.25782 0.670164 7.89612C0.654884 7.52045 0.678124 7.17054 0.802324 6.8293C0.994931 6.30012 1.35012 5.8455 1.81699 5.53059C2.11804 5.32753 2.45194 5.22033 2.82014 5.14427C3.17466 5.07104 3.61426 5.01707 4.1469 4.95168L6.45133 4.66873C6.98398 4.60332 7.42359 4.54934 7.78529 4.53463Z" fill="#0D0D0D"/>
    </svg>
  )
}

function MagicWandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.85156 6.70508C8.91682 6.70506 8.98169 6.71725 9.04199 6.74219C9.10238 6.76717 9.15691 6.80438 9.20312 6.85059C9.24932 6.89678 9.28653 6.95136 9.31152 7.01172C9.33652 7.07217 9.34871 7.13771 9.34863 7.20312C9.3485 7.26841 9.33564 7.33328 9.31055 7.39355C9.2854 7.45382 9.24844 7.50863 9.20215 7.55469L2.84961 13.9072C2.75634 14.0005 2.62897 14.0527 2.49707 14.0527C2.36544 14.0526 2.23865 14.0012 2.14551 13.9082C2.05236 13.815 2.00006 13.6884 2 13.5566C2 13.4249 2.05245 13.2983 2.14551 13.2051L8.49902 6.85156L8.57422 6.78906C8.60117 6.77096 8.63005 6.75573 8.66016 6.74316C8.72055 6.71802 8.78615 6.70516 8.85156 6.70508ZM8.85059 9.5293C8.98241 9.52932 9.10891 9.58162 9.20215 9.6748C9.29535 9.768 9.34758 9.89457 9.34766 10.0264V11.9082C9.34766 12.0401 9.29542 12.1675 9.20215 12.2607C9.10892 12.3539 8.98235 12.4062 8.85059 12.4062C8.71883 12.4062 8.59226 12.3538 8.49902 12.2607C8.40576 12.1675 8.35352 12.0401 8.35352 11.9082V10.0264C8.35355 9.96116 8.36567 9.89618 8.39062 9.83594C8.41562 9.77568 8.45289 9.72093 8.49902 9.6748C8.54514 9.62874 8.59993 9.59234 8.66016 9.56738C8.7205 9.54239 8.78527 9.5293 8.85059 9.5293ZM10.8467 8.70312C10.9783 8.70312 11.105 8.75478 11.1982 8.84766L12.5303 10.1797C12.6184 10.2738 12.667 10.3984 12.665 10.5273C12.663 10.6566 12.61 10.7807 12.5186 10.8721C12.4272 10.9632 12.3038 11.0147 12.1748 11.0166C12.0456 11.0185 11.9203 10.9704 11.8262 10.8818L10.4961 9.55176C10.4028 9.45849 10.3506 9.33112 10.3506 9.19922C10.3507 9.06748 10.4029 8.94082 10.4961 8.84766C10.5892 8.7549 10.7153 8.70325 10.8467 8.70312ZM6.02734 6.70605C6.09259 6.70608 6.15749 6.71917 6.21777 6.74414C6.27797 6.76913 6.33282 6.80548 6.37891 6.85156C6.42499 6.89765 6.46134 6.95251 6.48633 7.0127C6.51129 7.07297 6.52439 7.13789 6.52441 7.20312C6.52441 7.26844 6.51132 7.33322 6.48633 7.39355C6.46137 7.4538 6.42499 7.50855 6.37891 7.55469C6.33276 7.60083 6.27805 7.63809 6.21777 7.66309C6.15749 7.68806 6.09259 7.70017 6.02734 7.7002H4.14453C4.01263 7.7002 3.88624 7.64796 3.79297 7.55469C3.69975 7.46143 3.64746 7.33499 3.64746 7.20312C3.64752 7.0713 3.69975 6.94478 3.79297 6.85156C3.88623 6.75837 4.01269 6.70605 4.14453 6.70605H6.02734ZM13.5566 6.70605C13.6219 6.70607 13.6868 6.71917 13.7471 6.74414C13.8073 6.76912 13.8621 6.80548 13.9082 6.85156C13.9543 6.89764 13.9906 6.95251 14.0156 7.0127C14.0406 7.07297 14.0537 7.13789 14.0537 7.20312C14.0537 7.26844 14.0406 7.33322 14.0156 7.39355C13.9907 7.4538 13.9543 7.50855 13.9082 7.55469C13.8621 7.60084 13.8074 7.63809 13.7471 7.66309C13.6868 7.68806 13.6219 7.70018 13.5566 7.7002H11.6748C11.4001 7.7002 11.1768 7.47779 11.1768 7.20312C11.1768 7.0713 11.23 6.94478 11.3232 6.85156C11.4165 6.75846 11.543 6.70605 11.6748 6.70605H13.5566ZM5.51758 3.35938C5.58483 3.3612 5.65081 3.37713 5.71191 3.40527C5.77325 3.43357 5.82885 3.47419 5.87402 3.52441L7.20605 4.85449C7.29924 4.94769 7.35149 5.07427 7.35156 5.20605C7.35156 5.30509 7.32178 5.40125 7.26758 5.48242L7.20605 5.55762C7.11287 5.65079 6.98626 5.70304 6.85449 5.70312C6.72276 5.70312 6.59616 5.65066 6.50293 5.55762L5.17188 4.22656C5.12165 4.18147 5.08108 4.12669 5.05273 4.06543C5.02438 4.00413 5.00867 3.93763 5.00684 3.87012C5.005 3.80267 5.01706 3.73555 5.04199 3.67285C5.06698 3.6101 5.1046 3.55267 5.15234 3.50488C5.19999 3.45723 5.25676 3.41955 5.31934 3.39453C5.38207 3.36949 5.45006 3.3576 5.51758 3.35938ZM12.1777 3.37891C12.3094 3.37907 12.4362 3.43134 12.5293 3.52441C12.6224 3.61753 12.6746 3.74429 12.6748 3.87598C12.675 4.00759 12.6231 4.13421 12.5303 4.22754L11.1982 5.55762C11.105 5.65068 10.9784 5.70312 10.8467 5.70312C10.7151 5.703 10.5892 5.65057 10.4961 5.55762C10.4029 5.46435 10.3506 5.33793 10.3506 5.20605C10.3507 5.07425 10.4029 4.94769 10.4961 4.85449L11.8262 3.52441C11.9195 3.43157 12.0461 3.37879 12.1777 3.37891ZM8.85059 2C8.98241 2.00002 9.10891 2.05232 9.20215 2.14551C9.29535 2.23871 9.34759 2.36526 9.34766 2.49707V4.37891C9.34766 4.51081 9.29542 4.63818 9.20215 4.73145C9.10892 4.82455 8.98235 4.87693 8.85059 4.87695C8.57592 4.87695 8.35352 4.65357 8.35352 4.37891V2.49707C8.35359 2.36526 8.40582 2.23871 8.49902 2.14551C8.59227 2.05235 8.71877 2 8.85059 2Z" fill="#191E26"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="4" stroke="#8f8f8f" strokeWidth="1.4" />
      <path
        d="M10 10L13.5 13.5"
        stroke="#8f8f8f"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SurpriseMeIllustration() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      {/* Back card */}
      <rect x="14" y="20" width="34" height="28" rx="5" fill="#d8c9ff" transform="rotate(-6 14 20)" />
      {/* Front card */}
      <rect x="16" y="22" width="34" height="28" rx="5" fill="#b89eff" />
      {/* Magic sparkle */}
      <path
        d="M33 16L34.2 19.2L37 20L34.2 20.8L33 24L31.8 20.8L29 20L31.8 19.2L33 16Z"
        fill="#8b3dff"
      />
      <path
        d="M41 12L41.8 14L43.5 14L42 15.2L42.5 17L41 16L39.5 17L40 15.2L38.5 14L40.2 14L41 12Z"
        fill="#c4a8ff"
      />
    </svg>
  )
}
