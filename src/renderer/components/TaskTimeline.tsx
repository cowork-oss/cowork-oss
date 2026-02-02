import { TaskEvent } from '../../shared/types';

interface TaskTimelineProps {
  events: TaskEvent[];
}

export function TaskTimeline({ events }: TaskTimelineProps) {
  // Filter out internal events that don't provide value to end users
  const internalEventTypes = [
    'tool_blocked',        // deduplication blocks
    'follow_up_completed', // internal follow-up tracking
    'follow_up_failed',    // internal follow-up tracking
  ];
  const blockedEvents = events.filter(e => e.type === 'tool_blocked');
  const visibleEvents = events.filter(e => !internalEventTypes.includes(e.type));

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getEventIcon = (type: TaskEvent['type']) => {
    switch (type) {
      case 'task_created':
        return '🎯';
      case 'plan_created':
        return '📋';
      case 'step_started':
        return '▶️';
      case 'step_completed':
        return '✅';
      case 'tool_call':
        return '🔧';
      case 'tool_result':
        return '📦';
      case 'file_created':
      case 'file_modified':
        return '📄';
      case 'file_deleted':
        return '🗑️';
      case 'error':
        return '❌';
      case 'task_cancelled':
        return '🛑';
      case 'approval_requested':
        return '⚠️';
      case 'approval_granted':
        return '✅';
      case 'approval_denied':
        return '⛔';
      case 'task_paused':
        return '⏸️';
      case 'task_resumed':
        return '▶️';
      case 'executing':
        return '⚡';
      case 'task_completed':
        return '✅';
      case 'follow_up_completed':
        return '✅';
      default:
        return '•';
    }
  };

  const getEventTitle = (event: TaskEvent) => {
    switch (event.type) {
      case 'task_created':
        return '🚀 Session Started';
      case 'plan_created':
        return 'Here\'s our approach';
      case 'step_started':
        return `Working on: ${event.payload.step?.description || 'Getting started'}`;
      case 'step_completed':
        return `✓ ${event.payload.step?.description || event.payload.message || 'Done'}`;
      case 'tool_call':
        return `Using: ${event.payload.tool}`;
      case 'tool_result':
        return `${event.payload.tool} done`;
      case 'file_created':
        return `Created: ${event.payload.path}`;
      case 'file_modified':
        return `Updated: ${event.payload.path || event.payload.from}`;
      case 'file_deleted':
        return `Removed: ${event.payload.path}`;
      case 'error':
        return 'Hit a snag';
      case 'task_cancelled':
        return 'Session stopped';
      case 'approval_requested':
        return `Need your input: ${event.payload.approval?.description}`;
      case 'approval_granted':
        return 'Approval granted';
      case 'approval_denied':
        return 'Approval denied';
      case 'task_paused':
        return event.payload.message || 'Paused - waiting for input';
      case 'task_resumed':
        return 'Resumed';
      case 'executing':
        return event.payload.message || 'Working on it';
      case 'task_completed':
        return '✅ All done!';
      case 'follow_up_completed':
        return '✅ All done!';
      case 'log':
        return event.payload.message;
      default:
        return event.type;
    }
  };

  const renderEventDetails = (event: TaskEvent) => {
    switch (event.type) {
      case 'plan_created':
        return (
          <div className="event-details">
            <div className="plan-description">{event.payload.plan?.description}</div>
            {event.payload.plan?.steps && (
              <ul className="plan-steps">
                {event.payload.plan.steps.map((step: any, i: number) => (
                  <li key={i}>{step.description}</li>
                ))}
              </ul>
            )}
          </div>
        );
      case 'tool_call':
        return (
          <div className="event-details">
            <pre>{JSON.stringify(event.payload.input, null, 2)}</pre>
          </div>
        );
      case 'tool_result':
        return (
          <div className="event-details">
            <pre>{JSON.stringify(event.payload.result, null, 2)}</pre>
          </div>
        );
      case 'error':
        return (
          <div className="event-details error">
            {event.payload.error || event.payload.message}
          </div>
        );
      case 'task_cancelled':
        return (
          <div className="event-details cancelled">
            {event.payload.message || 'Session was stopped'}
          </div>
        );
      default:
        return null;
    }
  };

  if (visibleEvents.length === 0 && blockedEvents.length === 0) {
    return (
      <div className="timeline-empty">
        <p>Nothing happening yet</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      <h3>What We've Done</h3>
      <div className="timeline-events">
        {visibleEvents.map(event => (
          <div key={event.id} className="timeline-event">
            <div className="event-icon">{getEventIcon(event.type)}</div>
            <div className="event-content">
              <div className="event-header">
                <div className="event-title">{getEventTitle(event)}</div>
                <div className="event-time">{formatTime(event.timestamp)}</div>
              </div>
              {renderEventDetails(event)}
            </div>
          </div>
        ))}
        {/* Show summary of blocked events if any - collapsed for cleaner UI */}
        {blockedEvents.length > 0 && (
          <div className="timeline-event timeline-event-muted">
            <div className="event-icon">🛡️</div>
            <div className="event-content">
              <div className="event-header">
                <div className="event-title">
                  {blockedEvents.length} duplicate tool call{blockedEvents.length > 1 ? 's' : ''} prevented
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
