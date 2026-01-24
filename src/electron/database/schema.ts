import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

export class DatabaseManager {
  private db: Database.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'cowork-oss.db');
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema() {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        permissions TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        budget_tokens INTEGER,
        budget_cost REAL,
        error TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        resolved_at INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        prompt TEXT NOT NULL,
        script_path TEXT,
        parameters TEXT
      );

      CREATE TABLE IF NOT EXISTS llm_models (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT NOT NULL,
        anthropic_model_id TEXT NOT NULL,
        bedrock_model_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
      CREATE INDEX IF NOT EXISTS idx_llm_models_active ON llm_models(is_active);
    `);

    // Seed default models if table is empty
    this.seedDefaultModels();
  }

  private seedDefaultModels() {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM llm_models').get() as { count: number };
    if (count.count === 0) {
      const now = Date.now();
      const models = [
        {
          id: 'model-opus-4-5',
          key: 'opus-4-5',
          displayName: 'Opus 4.5',
          description: 'Most capable for complex work',
          anthropicModelId: 'claude-opus-4-5-20250514',
          bedrockModelId: 'us.anthropic.claude-opus-4-5-20250514-v1:0',
          sortOrder: 1,
        },
        {
          id: 'model-sonnet-4-5',
          key: 'sonnet-4-5',
          displayName: 'Sonnet 4.5',
          description: 'Best for everyday tasks',
          anthropicModelId: 'claude-sonnet-4-5-20250514',
          bedrockModelId: 'us.anthropic.claude-sonnet-4-5-20250514-v1:0',
          sortOrder: 2,
        },
        {
          id: 'model-haiku-4-5',
          key: 'haiku-4-5',
          displayName: 'Haiku 4.5',
          description: 'Fastest for quick answers',
          anthropicModelId: 'claude-haiku-4-5-20250514',
          bedrockModelId: 'us.anthropic.claude-haiku-4-5-20250514-v1:0',
          sortOrder: 3,
        },
      ];

      const stmt = this.db.prepare(`
        INSERT INTO llm_models (id, key, display_name, description, anthropic_model_id, bedrock_model_id, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);

      for (const model of models) {
        stmt.run(
          model.id,
          model.key,
          model.displayName,
          model.description,
          model.anthropicModelId,
          model.bedrockModelId,
          model.sortOrder,
          now,
          now
        );
      }
    }
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close() {
    this.db.close();
  }
}
