import { ApprovalRequest } from '../../shared/types';

interface ApprovalDialogProps {
  approval: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
}

export function ApprovalDialog({ approval, onApprove, onDeny }: ApprovalDialogProps) {
  const getApprovalIcon = (type: ApprovalRequest['type']) => {
    switch (type) {
      case 'delete_file':
      case 'delete_multiple':
        return '🗑️';
      case 'bulk_rename':
        return '📝';
      case 'network_access':
        return '🌐';
      case 'external_service':
        return '🔗';
      default:
        return '⚠️';
    }
  };

  const getApprovalColor = (type: ApprovalRequest['type']) => {
    switch (type) {
      case 'delete_file':
      case 'delete_multiple':
        return 'approval-danger';
      case 'network_access':
      case 'external_service':
        return 'approval-warning';
      default:
        return 'approval-info';
    }
  };

  return (
    <div className="approval-dialog-overlay">
      <div className={`approval-dialog ${getApprovalColor(approval.type)}`}>
        <div className="approval-icon">{getApprovalIcon(approval.type)}</div>

        <div className="approval-content">
          <h3>Approval Required</h3>
          <p className="approval-description">{approval.description}</p>

          {approval.details && (
            <div className="approval-details">
              <pre>{JSON.stringify(approval.details, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="approval-actions">
          <button className="button-secondary" onClick={onDeny}>
            Deny
          </button>
          <button className="button-primary" onClick={onApprove}>
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
