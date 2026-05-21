export function MobileBlocker() {
  return (
    <div className="mobile-blocker">
      <div className="mobile-blocker__card">
        <div className="mobile-blocker__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <h1 className="mobile-blocker__title">Desktop Recommended</h1>
        <p className="mobile-blocker__cta">
          Please open this site on a desktop browser to build your CV.
        </p>
        <p className="mobile-blocker__text">
          CV Forge compiles PDF entirely in your browser.
          This process is memory-intensive and performs best on a 
          desktop or laptop computer.
        </p>
      </div>
    </div>
  );
}
