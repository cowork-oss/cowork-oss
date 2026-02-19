import { useState, useEffect, useCallback } from 'react';
import { ChatGPTImportWizard } from './ChatGPTImportWizard';

// Types inlined since preload types aren't directly importable in renderer
type PrivacyMode = 'normal' | 'strict' | 'disabled';

interface MemorySettingsData {
  workspaceId: string;
  enabled: boolean;
  autoCapture: boolean;
  compressionEnabled: boolean;
  retentionDays: number;
  maxStorageMb: number;
  privacyMode: PrivacyMode;
  excludedPatterns?: string[];
}

interface MemoryStats {
  count: number;
  totalTokens: number;
  compressedCount: number;
  compressionRatio: number;
}

interface ImportedStats {
  count: number;
  totalTokens: number;
}

type UserFactCategory = 'identity' | 'preference' | 'bio' | 'work' | 'goal' | 'constraint' | 'other';

interface UserFact {
  id: string;
  category: UserFactCategory;
  value: string;
  confidence: number;
  source: 'conversation' | 'feedback' | 'manual';
  pinned?: boolean;
  firstSeenAt: number;
  lastUpdatedAt: number;
  lastTaskId?: string;
}

interface UserProfile {
  summary?: string;
  facts: UserFact[];
  updatedAt: number;
}

type RelationshipLayer = 'identity' | 'preferences' | 'context' | 'history' | 'commitments';

interface RelationshipMemoryItem {
  id: string;
  layer: RelationshipLayer;
  text: string;
  confidence: number;
  source: 'conversation' | 'feedback' | 'task';
  createdAt: number;
  updatedAt: number;
  status?: 'open' | 'done';
  dueAt?: number;
}

interface MemoryItem {
  id: string;
  content: string;
  tokens: number;
  createdAt: number;
}

interface MemorySettingsProps {
  workspaceId: string;
  onSettingsChanged?: () => void;
}

/** Parse the ChatGPT import tag from memory content */
function parseImportTag(content: string): { title: string; preview: string } {
  const match = content.match(/^\[Imported from ChatGPT\s*—\s*"(.+?)"\s*(?:\(conv:[^)]+\))?\]\n?([\s\S]*)/);
  if (match) {
    return { title: match[1], preview: match[2].slice(0, 200) };
  }
  return { title: 'Imported Memory', preview: content.slice(0, 200) };
}

const PAGE_SIZE = 20;

export function MemorySettings({ workspaceId, onSettingsChanged }: MemorySettingsProps) {
  const [settings, setSettings] = useState<MemorySettingsData | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);

  // Imported memories state
  const [importedStats, setImportedStats] = useState<ImportedStats | null>(null);
  const [showImported, setShowImported] = useState(false);
  const [importedMemories, setImportedMemories] = useState<MemoryItem[]>([]);
  const [importedOffset, setImportedOffset] = useState(0);
  const [importedHasMore, setImportedHasMore] = useState(false);
  const [loadingImported, setLoadingImported] = useState(false);
  const [deletingImported, setDeletingImported] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [newFact, setNewFact] = useState('');
  const [newFactCategory, setNewFactCategory] = useState<UserFactCategory>('preference');
  const [savingFact, setSavingFact] = useState(false);
  const [relationshipItems, setRelationshipItems] = useState<RelationshipMemoryItem[]>([]);
  const [dueSoonItems, setDueSoonItems] = useState<RelationshipMemoryItem[]>([]);
  const [dueSoonReminder, setDueSoonReminder] = useState('');

  useEffect(() => {
    if (workspaceId) {
      loadData();
    }
  }, [workspaceId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [loadedSettings, loadedStats, loadedImportedStats, loadedUserProfile, loadedRelationshipItems, loadedDueSoon] = await Promise.all([
        window.electronAPI.getMemorySettings(workspaceId),
        window.electronAPI.getMemoryStats(workspaceId),
        window.electronAPI.getImportedMemoryStats(workspaceId),
        window.electronAPI.getUserProfile(),
        window.electronAPI.listRelationshipMemory({ limit: 80, includeDone: false }),
        window.electronAPI.getDueSoonCommitments(72),
      ]);
      setSettings(loadedSettings);
      setStats(loadedStats);
      setImportedStats(loadedImportedStats);
      setUserProfile(loadedUserProfile);
      setRelationshipItems(Array.isArray(loadedRelationshipItems) ? loadedRelationshipItems : []);
      setDueSoonItems(Array.isArray(loadedDueSoon?.items) ? loadedDueSoon.items : []);
      setDueSoonReminder(typeof loadedDueSoon?.reminderText === 'string' ? loadedDueSoon.reminderText : '');
    } catch (error) {
      console.error('Failed to load memory settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadImportedMemories = useCallback(async (offset = 0) => {
    try {
      setLoadingImported(true);
      const memories = await window.electronAPI.findImportedMemories({
        workspaceId,
        limit: PAGE_SIZE,
        offset,
      });
      if (offset === 0) {
        setImportedMemories(memories);
      } else {
        setImportedMemories(prev => [...prev, ...memories]);
      }
      setImportedOffset(offset + memories.length);
      setImportedHasMore(memories.length === PAGE_SIZE);
    } catch (error) {
      console.error('Failed to load imported memories:', error);
    } finally {
      setLoadingImported(false);
    }
  }, [workspaceId]);

  const handleToggleImported = () => {
    if (!showImported) {
      loadImportedMemories(0);
    }
    setShowImported(!showImported);
  };

  const handleDeleteImported = async () => {
    if (!confirm('Are you sure you want to delete all imported ChatGPT memories? Native memories will not be affected. This cannot be undone.')) {
      return;
    }
    try {
      setDeletingImported(true);
      await window.electronAPI.deleteImportedMemories(workspaceId);
      setImportedMemories([]);
      setImportedOffset(0);
      setImportedHasMore(false);
      setShowImported(false);
      await loadData();
    } catch (error) {
      console.error('Failed to delete imported memories:', error);
    } finally {
      setDeletingImported(false);
    }
  };

  const handleSave = async (updates: Partial<MemorySettingsData>) => {
    if (!settings) return;
    try {
      setSaving(true);
      await window.electronAPI.saveMemorySettings({ workspaceId, settings: updates });
      setSettings({ ...settings, ...updates });
      onSettingsChanged?.();
    } catch (error) {
      console.error('Failed to save memory settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear all memories for this workspace? This cannot be undone.')) {
      return;
    }
    try {
      setClearing(true);
      await window.electronAPI.clearMemory(workspaceId);
      setImportedMemories([]);
      setImportedOffset(0);
      setImportedHasMore(false);
      setShowImported(false);
      await loadData();
    } catch (error) {
      console.error('Failed to clear memory:', error);
    } finally {
      setClearing(false);
    }
  };

  const handleAddFact = async () => {
    const trimmed = newFact.trim();
    if (!trimmed) return;
    try {
      setSavingFact(true);
      const created = await window.electronAPI.addUserFact({
        category: newFactCategory,
        value: trimmed,
        source: 'manual',
        confidence: 1,
      });
      setUserProfile((prev) => ({
        summary: prev?.summary,
        updatedAt: Date.now(),
        facts: [created, ...(prev?.facts || [])],
      }));
      setNewFact('');
    } catch (error) {
      console.error('Failed to add user fact:', error);
    } finally {
      setSavingFact(false);
    }
  };

  const handleDeleteFact = async (factId: string) => {
    try {
      await window.electronAPI.deleteUserFact(factId);
      setUserProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          facts: prev.facts.filter((fact) => fact.id !== factId),
          updatedAt: Date.now(),
        };
      });
    } catch (error) {
      console.error('Failed to delete user fact:', error);
    }
  };

  const handleToggleFactPin = async (fact: UserFact) => {
    try {
      const updated = await window.electronAPI.updateUserFact({
        id: fact.id,
        pinned: !fact.pinned,
      });
      if (!updated) return;
      setUserProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          updatedAt: Date.now(),
          facts: prev.facts.map((existing) => (existing.id === updated.id ? updated : existing)),
        };
      });
    } catch (error) {
      console.error('Failed to update user fact:', error);
    }
  };

  const handleDeleteRelationship = async (itemId: string) => {
    try {
      await window.electronAPI.deleteRelationshipMemory(itemId);
      setRelationshipItems((prev) => prev.filter((item) => item.id !== itemId));
      setDueSoonItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (error) {
      console.error('Failed to delete relationship memory:', error);
    }
  };

  const handleToggleCommitmentStatus = async (item: RelationshipMemoryItem) => {
    try {
      const nextStatus = item.status === 'done' ? 'open' : 'done';
      const updated = await window.electronAPI.updateRelationshipMemory({
        id: item.id,
        status: nextStatus,
      });
      if (!updated) return;
      setRelationshipItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)));
      if (nextStatus === 'done') {
        setDueSoonItems((prev) => prev.filter((entry) => entry.id !== item.id));
      }
    } catch (error) {
      console.error('Failed to update commitment status:', error);
    }
  };

  const handleEditRelationship = async (item: RelationshipMemoryItem) => {
    const nextText = prompt('Edit memory item', item.text);
    if (nextText == null) return;
    const trimmed = nextText.trim();
    if (!trimmed) return;
    try {
      const updated = await window.electronAPI.updateRelationshipMemory({
        id: item.id,
        text: trimmed,
      });
      if (!updated) return;
      setRelationshipItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)));
      setDueSoonItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)));
    } catch (error) {
      console.error('Failed to edit relationship memory:', error);
    }
  };

  if (loading || !settings) {
    return (
      <div className="settings-section">
        <div className="settings-loading">Loading memory settings...</div>
      </div>
    );
  }

  // Show import wizard full-screen in the settings panel
  if (showImportWizard) {
    return (
      <ChatGPTImportWizard
        workspaceId={workspaceId}
        onClose={() => { setShowImportWizard(false); loadData(); }}
        onImportComplete={() => loadData()}
      />
    );
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Memory System</h3>
      <p className="settings-section-description">
        Captures observations during task execution for cross-session context. Memories help the AI remember
        what it learned in previous sessions.
      </p>

      {/* User Profile Facts */}
      <div className="settings-form-group" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '4px' }}>User Memory Facts</div>
        <p className="settings-form-hint" style={{ marginTop: 0 }}>
          Curate what the assistant remembers about preferences and context.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: '8px', marginBottom: '10px' }}>
          <select
            className="settings-select"
            value={newFactCategory}
            onChange={(e) => setNewFactCategory(e.target.value as UserFactCategory)}
            disabled={savingFact}
          >
            <option value="identity">Identity</option>
            <option value="preference">Preference</option>
            <option value="bio">Profile</option>
            <option value="work">Work</option>
            <option value="goal">Goal</option>
            <option value="constraint">Constraint</option>
            <option value="other">Other</option>
          </select>
          <input
            className="settings-input"
            type="text"
            value={newFact}
            onChange={(e) => setNewFact(e.target.value)}
            placeholder="Add a fact (for example: Prefers concise responses)"
            disabled={savingFact}
          />
          <button
            className="settings-button"
            onClick={handleAddFact}
            disabled={savingFact || !newFact.trim()}
            style={{ minWidth: '74px' }}
          >
            {savingFact ? 'Saving...' : 'Add'}
          </button>
        </div>

        <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', maxHeight: '220px', overflowY: 'auto' }}>
          {(!userProfile?.facts || userProfile.facts.length === 0) && (
            <div style={{ padding: '12px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              No user facts stored yet.
            </div>
          )}

          {(userProfile?.facts || [])
            .slice()
            .sort((a, b) => {
              if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
              if (a.confidence !== b.confidence) return b.confidence - a.confidence;
              return b.lastUpdatedAt - a.lastUpdatedAt;
            })
            .map((fact) => (
              <div
                key={fact.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <div style={{ color: 'var(--color-text-primary)', fontSize: '13px' }}>{fact.value}</div>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                    {fact.category} • {Math.round(fact.confidence * 100)}% confidence
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleToggleFactPin(fact)}
                    style={{
                      border: '1px solid var(--color-border)',
                      background: fact.pinned ? 'var(--color-bg-tertiary)' : 'transparent',
                      borderRadius: '6px',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '4px 8px',
                    }}
                  >
                    {fact.pinned ? 'Pinned' : 'Pin'}
                  </button>
                  <button
                    onClick={() => handleDeleteFact(fact.id)}
                    style={{
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      borderRadius: '6px',
                      color: 'var(--color-error)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '4px 8px',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Relationship Memory */}
      <div className="settings-form-group" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>Relationship Memory</div>
          <button className="settings-button" style={{ padding: '4px 10px' }} onClick={() => loadData()}>
            Refresh
          </button>
        </div>
        <p className="settings-form-hint" style={{ marginTop: 0 }}>
          Continuity memory across identity, preferences, context, history, and commitments.
        </p>

        <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          {dueSoonReminder || 'No commitments due soon.'}
        </div>

        <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', maxHeight: '260px', overflowY: 'auto' }}>
          {relationshipItems.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              No relationship memory items stored yet.
            </div>
          )}
          {relationshipItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '8px',
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div>
                <div style={{ color: 'var(--color-text-primary)', fontSize: '13px' }}>{item.text}</div>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                  {item.layer} • {Math.round(item.confidence * 100)}% confidence
                  {item.status ? ` • ${item.status}` : ''}
                  {item.dueAt ? ` • due ${new Date(item.dueAt).toLocaleDateString()}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {item.layer === 'commitments' && (
                  <button
                    onClick={() => handleToggleCommitmentStatus(item)}
                    style={{
                      border: '1px solid var(--color-border)',
                      background: item.status === 'done' ? 'var(--color-bg-tertiary)' : 'transparent',
                      borderRadius: '6px',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '4px 8px',
                    }}
                  >
                    {item.status === 'done' ? 'Reopen' : 'Done'}
                  </button>
                )}
                <button
                  onClick={() => handleEditRelationship(item)}
                  style={{
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    borderRadius: '6px',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '4px 8px',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteRelationship(item.id)}
                  style={{
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    borderRadius: '6px',
                    color: 'var(--color-error)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '4px 8px',
                  }}
                >
                  Forget
                </button>
              </div>
            </div>
          ))}
        </div>

        {dueSoonItems.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Due soon: {dueSoonItems.slice(0, 3).map((item) => item.text).join(' • ')}
          </div>
        )}
      </div>

      {/* Stats Display */}
      {stats && (
        <div className="memory-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <div className="stat-card" style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
              {(stats.count ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Memories</div>
          </div>
          <div className="stat-card" style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
              {(stats.totalTokens ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Tokens</div>
          </div>
          <div className="stat-card" style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
              {(stats.compressedCount ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Compressed</div>
          </div>
          <div className="stat-card" style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
              {Math.round((stats.compressionRatio ?? 0) * 100)}%
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Ratio</div>
          </div>
        </div>
      )}

      {/* Imported Memories Section */}
      {importedStats && importedStats.count > 0 && (
        <div className="settings-form-group" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>Imported Memories</div>
              <span style={{
                background: 'var(--color-accent, #3b82f6)',
                color: 'white',
                fontSize: '11px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '10px',
              }}>
                {importedStats.count.toLocaleString()}
              </span>
            </div>
            <button
              onClick={handleToggleImported}
              style={{
                background: 'none',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
                padding: '4px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {showImported ? 'Hide' : 'View'}
            </button>
          </div>

          {/* Imported stats mini cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: showImported ? '12px' : 0 }}>
            <div style={{ padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Conversations</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{importedStats.count.toLocaleString()}</span>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Tokens</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{importedStats.totalTokens.toLocaleString()}</span>
            </div>
          </div>

          {/* Expanded imported memories list */}
          {showImported && (
            <div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                {importedMemories.map((memory) => {
                  const { title, preview } = parseImportTag(memory.content);
                  return (
                    <div
                      key={memory.id}
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--color-border)',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                          {title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                          {new Date(memory.createdAt).toLocaleDateString()} · {memory.tokens} tokens
                        </div>
                      </div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                        {preview}
                      </div>
                    </div>
                  );
                })}
                {importedMemories.length === 0 && !loadingImported && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    No imported memories found.
                  </div>
                )}
                {loadingImported && (
                  <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    Loading...
                  </div>
                )}
              </div>

              {importedHasMore && !loadingImported && (
                <button
                  onClick={() => loadImportedMemories(importedOffset)}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '8px',
                    padding: '6px',
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Load more...
                </button>
              )}

              <button
                onClick={handleDeleteImported}
                disabled={deletingImported}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '8px',
                  padding: '6px 12px',
                  background: 'var(--color-error)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: deletingImported ? 'default' : 'pointer',
                  fontSize: '12px',
                  opacity: deletingImported ? 0.6 : 1,
                }}
              >
                {deletingImported ? 'Deleting...' : 'Delete All Imported Memories'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Import from ChatGPT */}
      <div className="settings-form-group" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Import from ChatGPT</div>
            <p className="settings-form-hint" style={{ margin: 0 }}>
              {importedStats && importedStats.count > 0
                ? 'Import more conversations to append to existing imported memories. Duplicates are automatically skipped.'
                : 'Import your ChatGPT conversation history to build richer context. Your data stays on your device.'}
            </p>
          </div>
          <button
            className="chatgpt-import-btn chatgpt-import-btn-primary"
            onClick={() => setShowImportWizard(true)}
            disabled={!settings.enabled}
            style={{ opacity: settings.enabled ? 1 : 0.5, whiteSpace: 'nowrap' }}
          >
            {importedStats && importedStats.count > 0 ? 'Import More' : 'Import'}
          </button>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="settings-form-group">
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => handleSave({ enabled: e.target.checked })}
            disabled={saving}
          />
          <span className="settings-toggle-label">Enable Memory System</span>
        </label>
        <p className="settings-form-hint">
          When enabled, task observations are captured for future context.
        </p>
      </div>

      {settings.enabled && (
        <>
          {/* Auto-Capture Toggle */}
          <div className="settings-form-group">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.autoCapture}
                onChange={(e) => handleSave({ autoCapture: e.target.checked })}
                disabled={saving}
              />
              <span className="settings-toggle-label">Auto-Capture Observations</span>
            </label>
            <p className="settings-form-hint">
              Automatically capture tool calls, decisions, and results.
            </p>
          </div>

          {/* Compression Toggle */}
          <div className="settings-form-group">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.compressionEnabled}
                onChange={(e) => handleSave({ compressionEnabled: e.target.checked })}
                disabled={saving}
              />
              <span className="settings-toggle-label">Enable Compression</span>
            </label>
            <p className="settings-form-hint">
              Uses LLM to summarize memories, reducing token usage by ~10x.
            </p>
          </div>

          {/* Privacy Mode */}
          <div className="settings-form-group">
            <label className="settings-label">Privacy Mode</label>
            <select
              value={settings.privacyMode}
              onChange={(e) => handleSave({ privacyMode: e.target.value as PrivacyMode })}
              disabled={saving}
              className="settings-select"
            >
              <option value="normal">Normal - Auto-detect sensitive data</option>
              <option value="strict">Strict - Mark all as private</option>
              <option value="disabled">Disabled - No memory capture</option>
            </select>
            <p className="settings-form-hint">
              Controls how sensitive data is handled in memories.
            </p>
          </div>

          {/* Retention Period */}
          <div className="settings-form-group">
            <label className="settings-label">Retention Period</label>
            <select
              value={settings.retentionDays}
              onChange={(e) => handleSave({ retentionDays: parseInt(e.target.value) })}
              disabled={saving}
              className="settings-select"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
            <p className="settings-form-hint">
              Memories older than this will be automatically deleted.
            </p>
          </div>

          {/* Storage Cap */}
          <div className="settings-form-group">
            <label className="settings-label">Storage Cap (MB)</label>
            <input
              type="number"
              min={10}
              max={5000}
              step={10}
              value={settings.maxStorageMb}
              onChange={(e) => {
                const value = Math.max(10, Math.min(5000, parseInt(e.target.value || '0', 10) || 100));
                handleSave({ maxStorageMb: value });
              }}
              disabled={saving}
              className="settings-input"
            />
            <p className="settings-form-hint">
              Oldest memories are pruned automatically when this limit is exceeded.
            </p>
          </div>

          {/* Clear Button */}
          <div className="settings-form-group" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
            <button
              className="settings-button settings-button-danger"
              onClick={handleClear}
              disabled={saving || clearing}
              style={{
                background: 'var(--color-error)',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                opacity: clearing ? 0.6 : 1,
              }}
            >
              {clearing ? 'Clearing...' : 'Clear All Memories'}
            </button>
            <p className="settings-form-hint" style={{ marginTop: '8px' }}>
              Permanently deletes all memories for this workspace.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
