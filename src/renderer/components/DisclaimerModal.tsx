import { useState } from 'react';

interface DisclaimerModalProps {
  onAccept: () => void;
}

export function DisclaimerModal({ onAccept }: DisclaimerModalProps) {
  const [selectedOption, setSelectedOption] = useState<'yes' | 'no' | null>(null);

  const handleContinue = () => {
    if (selectedOption === 'yes') {
      onAccept();
    }
  };

  return (
    <div className="disclaimer-terminal">
      <div className="disclaimer-terminal-content">
        {/* ASCII Art Logo */}
        <pre className="disclaimer-ascii-art">
{`
 ██████╗ ██████╗ ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗
██╔════╝██╔═══██╗██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝
██║     ██║   ██║██║ █╗ ██║██║   ██║██████╔╝█████╔╝
██║     ██║   ██║██║███╗██║██║   ██║██╔══██╗██╔═██╗
╚██████╗╚██████╔╝╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗
 ╚═════╝ ╚═════╝  ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
`}
        </pre>
        <div className="disclaimer-subtitle">Agentic Task Automation</div>

        {/* Terminal prompt line */}
        <div className="disclaimer-prompt">
          <span className="disclaimer-prompt-symbol">┌</span>
          <span className="disclaimer-prompt-text">  CoWork onboarding</span>
        </div>
        <div className="disclaimer-prompt">
          <span className="disclaimer-prompt-symbol">│</span>
        </div>

        {/* Security Box */}
        <div className="disclaimer-box-terminal">
          <div className="disclaimer-box-header">
            <span className="disclaimer-prompt-symbol">◇</span>
            <span className="disclaimer-box-title">  Security </span>
            <span className="disclaimer-box-line">{'─'.repeat(60)}</span>
            <span>╮</span>
          </div>
          <div className="disclaimer-box-content">
            <div className="disclaimer-box-row">│</div>
            <div className="disclaimer-box-row">
              │  <span className="disclaimer-highlight">CoWork agents can run commands, read/write files, and act through</span>
            </div>
            <div className="disclaimer-box-row">
              │  <span className="disclaimer-highlight">any tools you enable.</span>
            </div>
            <div className="disclaimer-box-row">│</div>
            <div className="disclaimer-box-row">
              │  If you're new to this, start with restrictive workspace permissions
            </div>
            <div className="disclaimer-box-row">
              │  and use the Guardrails settings. It helps limit what an agent can do
            </div>
            <div className="disclaimer-box-row">
              │  if it makes a mistake or is given malicious instructions.
            </div>
            <div className="disclaimer-box-row">│</div>
            <div className="disclaimer-box-row">
              │  <span className="disclaimer-link">Learn more: Settings → Guardrails</span>
            </div>
            <div className="disclaimer-box-row">│</div>
            <div className="disclaimer-box-footer">
              ├{'─'.repeat(76)}╯
            </div>
          </div>
        </div>

        {/* Selection prompt */}
        <div className="disclaimer-prompt">
          <span className="disclaimer-prompt-symbol">│</span>
        </div>
        <div className="disclaimer-selection">
          <span className="disclaimer-prompt-symbol">◆</span>
          <span className="disclaimer-question">  I understand this is powerful and inherently risky. Continue?</span>
        </div>

        {/* Options */}
        <div className="disclaimer-options">
          <label
            className={`disclaimer-option ${selectedOption === 'yes' ? 'selected' : ''}`}
            onClick={() => setSelectedOption('yes')}
          >
            <span className="disclaimer-prompt-symbol">│</span>
            <span className="disclaimer-radio">{selectedOption === 'yes' ? '●' : '○'}</span>
            <span>Yes</span>
          </label>
          <label
            className={`disclaimer-option ${selectedOption === 'no' ? 'selected' : ''}`}
            onClick={() => setSelectedOption('no')}
          >
            <span className="disclaimer-prompt-symbol">│</span>
            <span className="disclaimer-radio">{selectedOption === 'no' ? '●' : '○'}</span>
            <span>No</span>
          </label>
        </div>

        {/* Footer */}
        <div className="disclaimer-prompt">
          <span className="disclaimer-prompt-symbol">└</span>
        </div>

        {/* Continue button */}
        {selectedOption === 'yes' && (
          <div className="disclaimer-continue">
            <button onClick={handleContinue} className="disclaimer-continue-btn">
              Press Enter to continue →
            </button>
          </div>
        )}

        {selectedOption === 'no' && (
          <div className="disclaimer-exit-message">
            <span className="disclaimer-muted">You must accept to use CoWork. Close the app if you disagree.</span>
          </div>
        )}
      </div>
    </div>
  );
}
