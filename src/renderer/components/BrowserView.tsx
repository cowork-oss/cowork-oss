import { useEffect, useRef, useState } from 'react';

interface BrowserViewProps {
  initialUrl?: string;
  onBack: () => void;
}

export function BrowserView({ initialUrl, onBack }: BrowserViewProps) {
  const [url, setUrl] = useState(initialUrl || '');
  const [activeUrl, setActiveUrl] = useState(initialUrl || '');
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      setActiveUrl(initialUrl);
    }
  }, [initialUrl]);

  const navigate = (nextUrl?: string) => {
    const target = (nextUrl || url).trim();
    if (!target) return;
    const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    setActiveUrl(normalized);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigate();
    }
  };

  return (
    <div className="browser-view">
      <div className="browser-toolbar">
        <button
          type="button"
          className="browser-toolbar-btn"
          onClick={onBack}
          title="Back to app"
          aria-label="Back to app"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          className="browser-toolbar-btn"
          onClick={() => webviewRef.current?.goBack()}
          title="Back"
          aria-label="Go back in browser history"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          className="browser-toolbar-btn"
          onClick={() => webviewRef.current?.goForward()}
          title="Forward"
          aria-label="Go forward in browser history"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button
          type="button"
          className="browser-toolbar-btn"
          onClick={() => webviewRef.current?.reload()}
          title="Reload"
          aria-label="Reload page"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <div className="browser-url">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com"
          />
          <button
            type="button"
            className="browser-toolbar-btn primary"
            onClick={() => navigate()}
            title="Go"
            aria-label="Navigate to URL"
          >
            Go
          </button>
        </div>
      </div>
      <div className="browser-surface">
        {activeUrl ? (
          <webview
            ref={webviewRef}
            src={activeUrl}
            className="browser-webview"
            allowpopups={true}
            webpreferences="contextIsolation=yes, nodeIntegration=no"
          />
        ) : (
          <div className="browser-empty">
            Enter a URL above to start browsing.
          </div>
        )}
      </div>
    </div>
  );
}
