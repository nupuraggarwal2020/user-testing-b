/**
 * Home screen — centered hero + inline composer (from Prompt to deck V3).
 *
 * @param {{
 *   capturePrompt: string,
 *   onPromptChange: (value: string) => void,
 *   onSubmit: (e: React.FormEvent) => void,
 * }} props
 */
export default function HomeView({ capturePrompt, onPromptChange, onSubmit }) {
  return (
    <div className="home-hero" aria-label="Home screen">
      <h1 className="home-hero-title">What can I help you with?</h1>
      <form className="composer composer--home" onSubmit={onSubmit}>
        <div className="composer-home-content">
          <div className="composer-home-value-row">
            <input
              type="text"
              className="composer-input composer-input--home"
              placeholder="Ask anything"
              value={capturePrompt}
              onChange={(e) => onPromptChange(e.target.value)}
              autoFocus
            />
          </div>
          <div className="composer-home-action-bar">
            <div className="composer-home-action-left">
              <button type="button" className="composer-home-icon-btn" aria-label="Add">
                <img src="/svg/Icon.svg" alt="" width={20} height={20} />
              </button>
            </div>
            <div className="composer-home-action-right">
              <button type="button" className="composer-home-voice-btn" aria-label="Voice input">
                <img src="/svg/_Composer-action/Icon.svg" alt="" width={20} height={20} />
              </button>
              <button type="submit" className="send-btn composer-home-send" aria-label="Send">
                <img src="/svg/_Composer-action/Send.svg" alt="" width={36} height={36} />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
