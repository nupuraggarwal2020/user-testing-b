/**
 * Minimal inline tool surface aligned with ChatGPT Apps UI patterns (AGENTS.MD):
 * headline → short body → one primary action; no nested scroll; system-type colors.
 *
 * @param {{
 *   layout?: 'card' | 'panel' | 'frozen',
 *   title?: string,
 *   subtitle?: string,
 *   primaryLabel?: string,
 *   onPrimary?: () => void,
 *   hidePrimary?: boolean,
 *   primaryDisabled?: boolean,
 * }} props
 */
export default function CanvaWidgetPlaceholder({
  layout = 'panel',
  title = 'Tool',
  subtitle = 'Render from structuredContent. One primary action.',
  primaryLabel = 'Continue',
  onPrimary,
  hidePrimary = false,
  primaryDisabled = false,
}) {
  const showPrimary = !hidePrimary && typeof onPrimary === 'function'

  if (layout === 'frozen') {
    return (
      <div className="inline-tool-card inline-tool-card--frozen" role="group" aria-label={title}>
        <h2 className="inline-tool-card__title">{title}</h2>
        {subtitle ? <p className="inline-tool-card__subtitle">{subtitle}</p> : null}
      </div>
    )
  }

  return (
    <div
      className={`inline-tool-card inline-tool-card--${layout}`}
      role="group"
      aria-label={title}
    >
      <h2 className="inline-tool-card__title">{title}</h2>
      {subtitle ? <p className="inline-tool-card__subtitle">{subtitle}</p> : null}
      {showPrimary ? (
        <div className="inline-tool-card__actions">
          <button
            type="button"
            className="inline-tool-card__btn-primary"
            onClick={(e) => {
              e.stopPropagation()
              onPrimary()
            }}
            disabled={primaryDisabled}
          >
            {primaryLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
