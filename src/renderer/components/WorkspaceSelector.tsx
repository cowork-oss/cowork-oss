import { useState, useEffect } from 'react';
import { Workspace } from '../../shared/types';

interface WorkspaceSelectorProps {
  onWorkspaceSelected: (workspace: Workspace) => void;
}

export function WorkspaceSelector({ onWorkspaceSelected }: WorkspaceSelectorProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const loaded = await window.electronAPI.listWorkspaces();
      setWorkspaces(loaded);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;

      const folderName = folderPath.split('/').pop() || 'Workspace';

      const workspace = await window.electronAPI.createWorkspace({
        name: folderName,
        path: folderPath,
        permissions: {
          read: true,
          write: true,
          delete: true,
          network: false,
        },
      });

      onWorkspaceSelected(workspace);
    } catch (error) {
      console.error('Failed to create workspace:', error);
    }
  };

  return (
    <div className="workspace-selector">
      <div className="workspace-selector-content">
        <div className="workspace-selector-header">
          <div className="app-logo">
            <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="#d4a574" strokeWidth="3" fill="none" />
              <path d="M30 50 L45 65 L70 35" stroke="#d4a574" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <h1>Welcome to Cowork OSS</h1>
          <p>Select a workspace folder to get started with AI-powered task automation</p>
        </div>

        {workspaces.length > 0 && (
          <div className="workspace-list">
            <h3>Recent Workspaces</h3>
            {workspaces.map(workspace => (
              <div
                key={workspace.id}
                className="workspace-list-item"
                onClick={() => onWorkspaceSelected(workspace)}
              >
                <div className="workspace-list-item-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                </div>
                <div className="workspace-list-item-info">
                  <div className="workspace-list-item-name">{workspace.name}</div>
                  <div className="workspace-list-item-path">{workspace.path}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="workspace-selector-actions">
          <button className="button-primary" onClick={handleSelectFolder}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            Select Folder
          </button>
        </div>
      </div>
    </div>
  );
}
