import { useState, useEffect } from 'react';
import { Task, TaskEvent } from '../../shared/types';
import { TaskTimeline } from './TaskTimeline';
import { ApprovalDialog } from './ApprovalDialog';
import { useAgentContext } from '../hooks/useAgentContext';

interface TaskViewProps {
  task: Task | undefined;
}

const MAX_TASK_VIEW_EVENTS = 600;

function capTaskViewEvents(events: TaskEvent[]): TaskEvent[] {
  if (events.length <= MAX_TASK_VIEW_EVENTS) return events;
  return events.slice(-MAX_TASK_VIEW_EVENTS);
}

export function TaskView({ task }: TaskViewProps) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<any>(null);
  const agentContext = useAgentContext();

  useEffect(() => {
    if (!task) {
      setEvents([]);
      return;
    }

    // Subscribe to task events
    const unsubscribe = window.electronAPI.onTaskEvent((event: TaskEvent) => {
      if (event.taskId === task.id) {
        setEvents(prev => capTaskViewEvents([...prev, event]));

        // Check if approval is requested
        if (event.type === 'approval_requested' && event.payload?.autoApproved !== true) {
          setPendingApproval(event.payload.approval);
        } else if (event.type === 'approval_granted' || event.type === 'approval_denied') {
          setPendingApproval(null);
        }
      }
    });

    return unsubscribe;
  }, [task?.id]);

  const handleApprovalResponse = async (approved: boolean) => {
    if (!pendingApproval) return;

    try {
      await window.electronAPI.respondToApproval({
        approvalId: pendingApproval.id,
        approved,
      });
      setPendingApproval(null);
    } catch (error) {
      console.error('Failed to respond to approval:', error);
    }
  };

  const handleResumeTask = async () => {
    if (!task) return;
    try {
      await window.electronAPI.resumeTask(task.id);
    } catch (error) {
      console.error('Failed to resume task:', error);
    }
  };

  const getStatusBadgeClass = (status: Task['status']) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'paused': return 'status-paused';
      case 'blocked': return 'status-blocked';
      case 'failed':
      case 'cancelled': return 'status-failed';
      case 'executing':
      case 'planning': return 'status-active';
      default: return 'status-pending';
    }
  };

  const latestPauseEvent = [...events].reverse().find(event => event.type === 'task_paused');

  if (!task) {
    return (
      <div className="task-view">
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
          </div>
          <h2>{agentContext.getUiCopy('taskViewEmptyTitle')}</h2>
          <p>{agentContext.getUiCopy('taskViewEmptyBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="task-view">
      <div className="task-view-inner">
        <div className="task-header">
          <h1>{task.title}</h1>
          <div className="task-meta">
            <span className={`task-status ${getStatusBadgeClass(task.status)}`}>
              {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
            </span>
            <span className="task-meta-divider" />
            <span className="task-date">
              {new Date(task.createdAt).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        <div className="task-prompt">
          <h3>{agentContext.getUiCopy('taskPromptTitle')}</h3>
          <p>{task.prompt}</p>
        </div>

        <TaskTimeline events={events} agentContext={agentContext} />

        {task.status === 'paused' && (
          <div className="task-status-banner task-status-banner-paused">
            <div className="task-status-banner-content">
              <strong>I'm waiting for your next direction.</strong>
              {latestPauseEvent?.payload?.message && (
                <span className="task-status-banner-detail">{latestPauseEvent.payload.message}</span>
              )}
              <span className="task-status-banner-detail">Send your response in chat and I'll continue right away.</span>
              <button className="mc-btn" type="button" onClick={() => void handleResumeTask()}>
                Continue
              </button>
            </div>
          </div>
        )}

        {task.status === 'blocked' && (
          <div className="task-status-banner task-status-banner-blocked">
            <div className="task-status-banner-content">
              <strong>{agentContext.getUiCopy('taskStatusBlockedTitle')}</strong>
              <span className="task-status-banner-detail">{agentContext.getUiCopy('taskStatusBlockedDetail')}</span>
            </div>
          </div>
        )}
      </div>

      {pendingApproval && (
        <ApprovalDialog
          approval={pendingApproval}
          onApprove={() => handleApprovalResponse(true)}
          onDeny={() => handleApprovalResponse(false)}
        />
      )}
    </div>
  );
}
