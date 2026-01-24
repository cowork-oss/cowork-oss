import { useState, useRef, useEffect } from 'react';
import { Task, Workspace } from '../../shared/types';

interface SidebarProps {
  workspace: Workspace | null;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onOpenSettings: () => void;
  onTasksChanged: () => void;
}

export function Sidebar({
  workspace,
  tasks,
  selectedTaskId,
  onSelectTask,
  onOpenSettings,
  onTasksChanged,
}: SidebarProps) {
  const [menuOpenTaskId, setMenuOpenTaskId] = useState<string | null>(null);
  const [renameTaskId, setRenameTaskId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenTaskId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renameTaskId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameTaskId]);

  const handleMenuToggle = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setMenuOpenTaskId(menuOpenTaskId === taskId ? null : taskId);
  };

  const handleRenameClick = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setMenuOpenTaskId(null);
    setRenameTaskId(task.id);
    setRenameValue(task.title);
  };

  const handleRenameSubmit = async (taskId: string) => {
    if (renameValue.trim()) {
      await window.electronAPI.renameTask(taskId, renameValue.trim());
      onTasksChanged();
    }
    setRenameTaskId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(taskId);
    } else if (e.key === 'Escape') {
      setRenameTaskId(null);
      setRenameValue('');
    }
  };

  const handleArchiveClick = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setMenuOpenTaskId(null);
    await window.electronAPI.deleteTask(taskId);
    if (selectedTaskId === taskId) {
      onSelectTask(null);
    }
    onTasksChanged();
  };

  const getStatusClass = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'failed':
      case 'cancelled':
        return 'failed';
      case 'executing':
      case 'planning':
        return 'active';
      default:
        return '';
    }
  };

  const handleNewTask = () => {
    // Deselect current task to show the welcome/new task screen
    onSelectTask(null);
  };

  return (
    <div className="sidebar">
      {/* New Task Button */}
      <div className="sidebar-header">
        <button className="new-task-btn" onClick={handleNewTask}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New task
        </button>
      </div>

      {/* Task List */}
      <div className="task-list">
        <div className="task-list-header">Recents</div>
        {tasks.length === 0 ? (
          <div className="sidebar-empty">
            <p>No tasks yet</p>
          </div>
        ) : (
          tasks.map(task => (
            <div
              key={task.id}
              className={`task-item ${selectedTaskId === task.id ? 'task-item-selected' : ''}`}
              onClick={() => renameTaskId !== task.id && onSelectTask(task.id)}
            >
              <div className="task-item-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                </svg>
              </div>
              <div className="task-item-content">
                {renameTaskId === task.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    className="task-item-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => handleRenameKeyDown(e, task.id)}
                    onBlur={() => handleRenameSubmit(task.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="task-item-title">{task.title}</div>
                    <div className="task-item-meta">
                      <span className={`task-item-status ${getStatusClass(task.status)}`}>
                        {task.status === 'executing' ? 'Running...' : ''}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="task-item-actions" ref={menuOpenTaskId === task.id ? menuRef : null}>
                <button
                  className="task-item-more"
                  onClick={(e) => handleMenuToggle(e, task.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="6" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="18" r="1.5" />
                  </svg>
                </button>
                {menuOpenTaskId === task.id && (
                  <div className="task-item-menu">
                    <button
                      className="task-item-menu-option"
                      onClick={(e) => handleRenameClick(e, task)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Rename
                    </button>
                    <button
                      className="task-item-menu-option task-item-menu-option-danger"
                      onClick={(e) => handleArchiveClick(e, task.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      Archive
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
            </svg>
          </div>
          <div className="user-info">
            <div className="user-name">Cowork OSS</div>
            <div className="user-plan">Open Source</div>
          </div>
        </div>
        <button className="settings-btn" onClick={onOpenSettings} title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
