import { useState, useRef, useEffect } from 'react';

interface QuickTaskFABProps {
  onCreateTask: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickTaskFAB({ onCreateTask, disabled }: QuickTaskFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (prompt.trim()) {
      onCreateTask(prompt.trim());
      setPrompt('');
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setPrompt('');
    }
  };

  return (
    <div className="quick-task-fab-container">
      {isOpen && (
        <div className="quick-task-input-popup">
          <input
            ref={inputRef}
            type="text"
            className="quick-task-input"
            placeholder="Quick task..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="quick-task-submit"
            onClick={handleSubmit}
            disabled={!prompt.trim()}
          >
            +
          </button>
        </div>
      )}
      <button
        className={`quick-task-fab ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title="Quick task"
      >
        <span className="fab-icon">{isOpen ? 'x' : '+'}</span>
      </button>
    </div>
  );
}

export default QuickTaskFAB;
