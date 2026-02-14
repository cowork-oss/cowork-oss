import { useState, useRef, useEffect, useMemo } from 'react';
import { Task, Workspace } from '../../shared/types';

interface SidebarProps {
  workspace: Workspace | null;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onNewSession?: () => void;
  onOpenSettings: () => void;
  onOpenMissionControl: () => void;
  onTasksChanged: () => void;
}

// Tree node structure for hierarchical display
interface TaskTreeNode {
  task: Task;
  children: TaskTreeNode[];
}

export function Sidebar({
  workspace: _workspace,
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewSession,
  onOpenSettings,
  onOpenMissionControl,
  onTasksChanged,
}: SidebarProps) {
  const [menuOpenTaskId, setMenuOpenTaskId] = useState<string | null>(null);
  const [renameTaskId, setRenameTaskId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Build task tree from flat list
  const taskTree = useMemo(() => {
    const taskMap = new Map<string, Task>();
    const childrenMap = new Map<string, Task[]>();

    // Index all tasks
    for (const task of tasks) {
      taskMap.set(task.id, task);
      if (task.parentTaskId) {
        const siblings = childrenMap.get(task.parentTaskId) || [];
        siblings.push(task);
        childrenMap.set(task.parentTaskId, siblings);
      }
    }

    // Build tree nodes recursively
    const buildNode = (task: Task): TaskTreeNode => {
      const children = childrenMap.get(task.id) || [];
      // Sort children by creation time
      children.sort((a, b) => a.createdAt - b.createdAt);
      return {
        task,
        children: children.map(buildNode),
      };
    };

    // Get root tasks (no parent) and sort by creation time (newest first)
    const rootTasks = tasks
      .filter(t => !t.parentTaskId)
      .sort((a, b) => b.createdAt - a.createdAt);

    return rootTasks.map(buildNode);
  }, [tasks]);

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

  const toggleCollapse = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setCollapsedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const getStatusIndicator = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return (
          <>
            <span className="terminal-only">[✓]</span>
            <span className="modern-only">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
          </>
        );
      case 'paused':
        return (
          <>
            <span className="terminal-only">[P]</span>
            <span className="modern-only">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg>
            </span>
          </>
        );
      case 'blocked':
        return (
          <>
            <span className="terminal-only">[!]</span>
            <span className="modern-only">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </span>
          </>
        );
      case 'failed':
      case 'cancelled':
        return (
          <>
            <span className="terminal-only">[✗]</span>
            <span className="modern-only">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </span>
          </>
        );
      case 'executing':
      case 'planning':
        return (
          <>
            <span className="terminal-only">[~]</span>
            <span className="modern-only">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>
            </span>
          </>
        );
      default:
        return (
          <>
            <span className="terminal-only">[ ]</span>
            <span className="modern-only">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" opacity="0.3"></circle></svg>
            </span>
          </>
        );
    }
  };

  const getStatusClass = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'paused':
        return 'paused';
      case 'blocked':
        return 'blocked';
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

  const getAgentTypeIndicator = (task: Task) => {
    if (task.agentType === 'sub') {
      return <span className="cli-agent-type sub" title="Sub-agent">SUB</span>;
    }
    if (task.agentType === 'parallel') {
      return <span className="cli-agent-type parallel" title="Parallel agent">PAR</span>;
    }
    return null;
  };

  const handleNewTask = () => {
    if (onNewSession) {
      onNewSession();
      return;
    }
    // Fallback: deselect current task to show the welcome/new task screen
    onSelectTask(null);
  };

  // Render a task node and its children recursively
  const renderTaskNode = (
    node: TaskTreeNode,
    index: number,
    depth: number = 0,
    isLast: boolean = true
  ): React.ReactNode => {
    const { task, children } = node;
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedTasks.has(task.id);
    const isSubAgent = !!task.parentTaskId;

    // Tree connector prefix based on depth
    const treePrefix = depth > 0 ? (isLast ? '└─' : '├─') : '';

    return (
      <div key={task.id} className="task-tree-node">
        <div
          className={`task-item cli-task-item ${selectedTaskId === task.id ? 'task-item-selected' : ''} ${isSubAgent ? 'task-item-subagent' : ''}`}
          onClick={() => renameTaskId !== task.id && onSelectTask(task.id)}
          style={{ paddingLeft: depth > 0 ? `${8 + depth * 16}px` : undefined }}
        >
          {/* Tree connector for sub-agents */}
          {depth > 0 && (
            <span className="cli-tree-prefix">{treePrefix}</span>
          )}

          {/* Collapse toggle for tasks with children */}
          {hasChildren ? (
            <button
              className="cli-collapse-btn"
              onClick={(e) => toggleCollapse(e, task.id)}
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="cli-task-num">{depth === 0 ? String(index + 1).padStart(2, '0') : '··'}</span>
          )}

          <span className={`cli-task-status ${getStatusClass(task.status)}`}>
            {getStatusIndicator(task.status)}
          </span>

          {/* Agent type badge for sub-agents */}
          {getAgentTypeIndicator(task)}

          <div className="task-item-content cli-task-content">
            {renameTaskId === task.id ? (
              <input
                ref={renameInputRef}
                type="text"
                className="task-item-rename-input cli-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => handleRenameKeyDown(e, task.id)}
                onBlur={() => handleRenameSubmit(task.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="cli-task-title" title={task.title}>
                {task.title}
              </span>
            )}
          </div>

          <div className="task-item-actions cli-task-actions" ref={menuOpenTaskId === task.id ? menuRef : null}>
            <button
              className="task-item-more cli-more-btn"
              onClick={(e) => handleMenuToggle(e, task.id)}
            >
              ···
            </button>
            {menuOpenTaskId === task.id && (
              <div className="task-item-menu cli-task-menu">
                <button
                  className="task-item-menu-option cli-menu-option"
                  onClick={(e) => handleRenameClick(e, task)}
                >
                  <span className="cli-menu-prefix">&gt;</span>
                  rename
                </button>
                <button
                  className="task-item-menu-option task-item-menu-option-danger cli-menu-option cli-menu-danger"
                  onClick={(e) => handleArchiveClick(e, task.id)}
                >
                  <span className="cli-menu-prefix">&gt;</span>
                  archive
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Render children if not collapsed */}
        {hasChildren && !isCollapsed && (
          <div className="task-tree-children">
            {children.map((child, childIndex) =>
              renderTaskNode(child, childIndex, depth + 1, childIndex === children.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sidebar cli-sidebar">
      {/* New Session Button */}
      <div className="sidebar-header">
        <div className="cli-header-actions">
          <button
            className="cli-action-btn cli-mission-control-btn"
            onClick={onOpenMissionControl}
            title="Mission Control"
          >
            <span className="terminal-only">
              <span className="cli-btn-bracket">[</span>
              <span className="cli-btn-accent">MC</span>
              <span className="cli-btn-bracket">]</span>
            </span>
            <span className="cli-btn-text">
              <span className="terminal-only">mission_control</span>
              <span className="modern-only">Mission Control</span>
            </span>
          </button>
          <button className="new-task-btn cli-new-task-btn cli-action-btn" onClick={handleNewTask}>
            <span className="terminal-only">
              <span className="cli-btn-bracket">[</span>
              <span className="cli-btn-plus">+</span>
              <span className="cli-btn-bracket">]</span>
            </span>
            <span className="cli-btn-text">
              <span className="terminal-only">new_session</span>
              <span className="modern-only">New Session</span>
            </span>
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="task-list cli-task-list">
        <div className="task-list-header cli-list-header">
          <span className="cli-section-prompt">&gt;</span>
          <span className="terminal-only">SESSIONS</span>
          <span className="modern-only">Sessions</span>
        </div>
        {taskTree.length === 0 ? (
          <div className="sidebar-empty cli-empty">
            <pre className="cli-tree terminal-only">{`├── (no sessions yet)
└── ...`}</pre>
            <p className="cli-hint">
              <span className="terminal-only"># start a new session above</span>
              <span className="modern-only">Start a new session to begin</span>
            </p>
          </div>
        ) : (
          taskTree.map((node, index) =>
            renderTaskNode(node, index, 0, index === taskTree.length - 1)
          )
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer cli-sidebar-footer">
        <div className="cli-footer-actions">
          <button className="settings-btn cli-settings-btn" onClick={onOpenSettings} title="Settings">
            <span className="terminal-only">[cfg]</span>
            <span className="modern-only">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
