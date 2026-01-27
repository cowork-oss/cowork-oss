import { useState } from 'react';
import { Task, QueueStatus } from '../../shared/types';

interface TaskQueuePanelProps {
  tasks: Task[];
  queueStatus: QueueStatus;
  onSelectTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface TaskQueueItemProps {
  task: Task;
  isRunning: boolean;
  position?: number;
  onSelect: () => void;
  onCancel: () => void;
}

function TaskQueueItem({ task, isRunning, position, onSelect, onCancel }: TaskQueueItemProps) {
  return (
    <div className="queue-item">
      <div className="queue-item-header">
        <span className={`queue-item-status ${isRunning ? 'running' : 'queued'}`}>
          {isRunning ? (
            <span className="spinner" />
          ) : (
            <span className="queue-position">#{position}</span>
          )}
        </span>
        <span className="queue-item-time">{formatTimeAgo(task.createdAt)}</span>
      </div>
      <p className="queue-item-title" onClick={onSelect}>
        {task.title || task.prompt.slice(0, 50)}
      </p>
      <div className="queue-item-actions">
        <button className="queue-item-view" onClick={onSelect}>
          View
        </button>
        <button className="queue-item-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TaskQueuePanel({
  tasks,
  queueStatus,
  onSelectTask,
  onCancelTask,
}: TaskQueuePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const runningTasks = tasks.filter(t => queueStatus.runningTaskIds.includes(t.id));
  const queuedTasks = tasks.filter(t => queueStatus.queuedTaskIds.includes(t.id));
  const totalActive = queueStatus.runningCount + queueStatus.queuedCount;

  if (totalActive === 0) {
    return null;
  }

  return (
    <div className="task-queue-panel">
      {/* Header */}
      <button
        className="queue-panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="queue-panel-title">
          <span className="queue-icon">|||</span>
          <span>Task Queue</span>
          {totalActive > 0 && (
            <span className="queue-badge">
              {queueStatus.runningCount}/{queueStatus.maxConcurrent}
              {queueStatus.queuedCount > 0 && ` +${queueStatus.queuedCount}`}
            </span>
          )}
        </div>
        <span className={`queue-chevron ${isExpanded ? 'expanded' : ''}`}>
          ^
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="queue-panel-content">
          {/* Running Tasks */}
          {runningTasks.length > 0 && (
            <div className="queue-section">
              <div className="queue-section-header">
                RUNNING ({runningTasks.length})
              </div>
              {runningTasks.map(task => (
                <TaskQueueItem
                  key={task.id}
                  task={task}
                  isRunning={true}
                  onSelect={() => onSelectTask(task.id)}
                  onCancel={() => onCancelTask(task.id)}
                />
              ))}
            </div>
          )}

          {/* Queued Tasks */}
          {queuedTasks.length > 0 && (
            <div className="queue-section">
              <div className="queue-section-header">
                QUEUED ({queuedTasks.length})
              </div>
              {queuedTasks.map((task, index) => (
                <TaskQueueItem
                  key={task.id}
                  task={task}
                  isRunning={false}
                  position={index + 1}
                  onSelect={() => onSelectTask(task.id)}
                  onCancel={() => onCancelTask(task.id)}
                />
              ))}
            </div>
          )}

          {totalActive === 0 && (
            <div className="queue-empty">
              All tasks completed
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskQueuePanel;
