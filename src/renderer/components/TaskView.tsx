import { useState, useEffect } from 'react';
import { Task, TaskEvent } from '../../shared/types';
import { TaskTimeline } from './TaskTimeline';
import { ApprovalDialog } from './ApprovalDialog';

interface TaskViewProps {
  task: Task | undefined;
}

export function TaskView({ task }: TaskViewProps) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<any>(null);

  useEffect(() => {
    if (!task) {
      setEvents([]);
      return;
    }

    // Subscribe to task events
    const unsubscribe = window.electronAPI.onTaskEvent((event: TaskEvent) => {
      if (event.taskId === task.id) {
        setEvents(prev => [...prev, event]);

        // Check if approval is requested
        if (event.type === 'approval_requested') {
          setPendingApproval(event.payload.approval);
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

  const getStatusBadgeClass = (status: Task['status']) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'failed':
      case 'cancelled': return 'status-failed';
      case 'executing':
      case 'planning': return 'status-active';
      default: return 'status-pending';
    }
  };

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
          <h2>No task selected</h2>
          <p>Select a task from the sidebar or create a new one to get started</p>
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
          <h3>Task Description</h3>
          <p>{task.prompt}</p>
        </div>

        <TaskTimeline events={events} />
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
