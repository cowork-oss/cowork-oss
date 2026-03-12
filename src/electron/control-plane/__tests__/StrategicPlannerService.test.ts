import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const nativeSqliteAvailable = await import("better-sqlite3")
  .then((module) => {
    try {
      const Database = module.default;
      const probe = new Database(":memory:");
      probe.close();
      return true;
    } catch {
      return false;
    }
  })
  .catch(() => false);

const describeWithSqlite = nativeSqliteAvailable ? describe : describe.skip;

describeWithSqlite("StrategicPlannerService", () => {
  let tmpDir: string;
  let previousUserDataDir: string | undefined;
  let manager: import("../../database/schema").DatabaseManager;
  let db: ReturnType<import("../../database/schema").DatabaseManager["getDatabase"]>;
  let core: import("../ControlPlaneCoreService").ControlPlaneCoreService;
  let planner: import("../StrategicPlannerService").StrategicPlannerService;
  let taskRepo: import("../../database/repositories").TaskRepository;
  let agentRoleRepo: import("../../agents/AgentRoleRepository").AgentRoleRepository;

  const insertWorkspace = (name = "main") => {
    const workspace = {
      id: randomUUID(),
      name,
      path: path.join(tmpDir, name),
      createdAt: Date.now(),
      permissions: JSON.stringify({
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      }),
    };
    fs.mkdirSync(workspace.path, { recursive: true });
    db.prepare(
      `
        INSERT INTO workspaces (id, name, path, created_at, permissions)
        VALUES (?, ?, ?, ?, ?)
      `,
    ).run(workspace.id, workspace.name, workspace.path, workspace.createdAt, workspace.permissions);
    return workspace;
  };

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-planner-"));
    previousUserDataDir = process.env.COWORK_USER_DATA_DIR;
    process.env.COWORK_USER_DATA_DIR = tmpDir;

    const [
      { DatabaseManager },
      { ControlPlaneCoreService },
      { StrategicPlannerService },
      { TaskRepository },
      { AgentRoleRepository },
    ] = await Promise.all([
      import("../../database/schema"),
      import("../ControlPlaneCoreService"),
      import("../StrategicPlannerService"),
      import("../../database/repositories"),
      import("../../agents/AgentRoleRepository"),
    ]);

    manager = new DatabaseManager();
    db = manager.getDatabase();
    core = new ControlPlaneCoreService(db);
    taskRepo = new TaskRepository(db);
    agentRoleRepo = new AgentRoleRepository(db);
    planner = new StrategicPlannerService({ db });
  });

  afterEach(() => {
    planner?.stop();
    manager?.close();
    if (previousUserDataDir === undefined) {
      delete process.env.COWORK_USER_DATA_DIR;
    } else {
      process.env.COWORK_USER_DATA_DIR = previousUserDataDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates planner-managed issues for uncovered goals and projects", async () => {
    const workspace = insertWorkspace();
    const company = core.getDefaultCompany();
    const goal = core.createGoal({
      companyId: company.id,
      title: "Launch autonomous venture pilot",
    });
    const project = core.createProject({
      companyId: company.id,
      goalId: goal.id,
      name: "Growth Engine",
    });
    core.linkProjectWorkspace({
      projectId: project.id,
      workspaceId: workspace.id,
      isPrimary: true,
    });

    planner.updateConfig(company.id, {
      enabled: true,
      maxIssuesPerRun: 5,
      autoDispatch: false,
    });

    const run = await planner.runNow({ companyId: company.id, trigger: "manual" });
    const issues = core.listIssues({ companyId: company.id, limit: 20 });

    expect(run.status).toBe("completed");
    expect(run.createdIssueCount).toBeGreaterThan(0);
    expect(
      issues.some((issue) => issue.title === "Define next deliverable for project: Growth Engine"),
    ).toBe(true);
    expect(
      issues.some((issue) => issue.metadata?.plannerManaged === true && issue.metadata?.source === "strategic_planner"),
    ).toBe(true);
  });

  it("uses the company default workspace instead of creating workspace-link issues", async () => {
    const company = core.createCompany({
      name: "Planner Workspace Co",
      slug: "planner-workspace-co",
    });
    core.createProject({
      companyId: company.id,
      name: "Growth Engine",
    });

    planner.updateConfig(company.id, {
      enabled: true,
      maxIssuesPerRun: 5,
      autoDispatch: false,
    });

    const run = await planner.runNow({ companyId: company.id, trigger: "manual" });
    const issues = core.listIssues({ companyId: company.id, limit: 20 });

    expect(run.status).toBe("completed");
    expect(issues.some((issue) => issue.title === "Link a workspace for project: Growth Engine")).toBe(false);
    expect(
      issues.some(
        (issue) =>
          issue.title === "Define next deliverable for project: Growth Engine" &&
          issue.workspaceId === core.getCompany(company.id)?.defaultWorkspaceId,
      ),
    ).toBe(true);
    expect(core.listProjectWorkspaces(core.listProjects({ companyId: company.id })[0]!.id)).toHaveLength(1);
  });

  it("auto-dispatches planner-managed issues into task runs when enabled", async () => {
    const workspace = insertWorkspace();
    const company = core.getDefaultCompany();
    const project = core.createProject({
      companyId: company.id,
      name: "Customer Ops",
    });
    core.linkProjectWorkspace({
      projectId: project.id,
      workspaceId: workspace.id,
      isPrimary: true,
    });

    const plannerAgent =
      agentRoleRepo.findByName("project_manager") ||
      agentRoleRepo.create({
        name: "planner-agent",
        displayName: "Planner Agent",
        capabilities: ["plan", "manage"],
        heartbeatEnabled: true,
      });

    const createdTaskIds: string[] = [];
    planner = new (await import("../StrategicPlannerService")).StrategicPlannerService({
      db,
      agentDaemon: {
        createTask: async (params: { title: string; prompt: string; workspaceId: string; agentConfig?: Any }) => {
          const task = taskRepo.create({
            title: params.title,
            prompt: params.prompt,
            status: "pending",
            workspaceId: params.workspaceId,
            agentConfig: params.agentConfig,
            source: "api",
          });
          createdTaskIds.push(task.id);
          return task;
        },
      } as Any,
    });

    planner.updateConfig(company.id, {
      enabled: true,
      autoDispatch: true,
      maxIssuesPerRun: 2,
      plannerAgentRoleId: plannerAgent.id,
      planningWorkspaceId: workspace.id,
    });

    const run = await planner.runNow({ companyId: company.id });
    const tasks = createdTaskIds.map((id) => taskRepo.findById(id)).filter(Boolean);

    expect(run.status).toBe("completed");
    expect(run.dispatchedTaskCount).toBeGreaterThan(0);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.assignedAgentRoleId).toBe(plannerAgent.id);
    expect(tasks[0]?.issueId).toBeTruthy();
    expect(tasks[0]?.heartbeatRunId).toBeTruthy();
    expect(tasks[0]?.agentConfig?.autonomousMode).toBe(true);
  });

  it("uses the control-plane workspace link tool instructions for project workspace issues", async () => {
    const workspace = insertWorkspace();
    const company = core.getDefaultCompany();
    core.createProject({
      companyId: company.id,
      name: "Docs Workspace Mapping",
    });

    const plannerAgent =
      agentRoleRepo.findByName("project_manager") ||
      agentRoleRepo.create({
        name: "planner-agent",
        displayName: "Planner Agent",
        capabilities: ["plan", "manage"],
        heartbeatEnabled: true,
      });

    const prompts: string[] = [];
    planner = new (await import("../StrategicPlannerService")).StrategicPlannerService({
      db,
      agentDaemon: {
        createTask: async (params: { title: string; prompt: string; workspaceId: string; agentConfig?: Any }) => {
          prompts.push(params.prompt);
          return taskRepo.create({
            title: params.title,
            prompt: params.prompt,
            status: "pending",
            workspaceId: params.workspaceId,
            agentConfig: params.agentConfig,
            source: "api",
          });
        },
      } as Any,
    });

    planner.updateConfig(company.id, {
      enabled: true,
      autoDispatch: true,
      maxIssuesPerRun: 1,
      plannerAgentRoleId: plannerAgent.id,
      planningWorkspaceId: workspace.id,
    });

    const run = await planner.runNow({ companyId: company.id });

    expect(run.status).toBe("completed");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("link_project_workspace");
    expect(prompts[0]).toContain("Do not treat ad hoc files in .cowork/");
  });

  it("does not redispatch the same planner-managed issue on the next run when it already has a task", async () => {
    const workspace = insertWorkspace();
    const company = core.getDefaultCompany();
    const project = core.createProject({
      companyId: company.id,
      name: "Repeat Dispatch Guard",
    });
    core.linkProjectWorkspace({
      projectId: project.id,
      workspaceId: workspace.id,
      isPrimary: true,
    });

    const plannerAgent =
      agentRoleRepo.findByName("project_manager") ||
      agentRoleRepo.create({
        name: "planner-agent",
        displayName: "Planner Agent",
        capabilities: ["plan", "manage"],
        heartbeatEnabled: true,
      });

    const createdTaskIds: string[] = [];
    planner = new (await import("../StrategicPlannerService")).StrategicPlannerService({
      db,
      agentDaemon: {
        createTask: async (params: { title: string; prompt: string; workspaceId: string; agentConfig?: Any }) => {
          const task = taskRepo.create({
            title: params.title,
            prompt: params.prompt,
            status: "pending",
            workspaceId: params.workspaceId,
            agentConfig: params.agentConfig,
            source: "api",
          });
          createdTaskIds.push(task.id);
          return task;
        },
      } as Any,
    });

    planner.updateConfig(company.id, {
      enabled: true,
      autoDispatch: true,
      maxIssuesPerRun: 2,
      plannerAgentRoleId: plannerAgent.id,
      planningWorkspaceId: workspace.id,
    });

    const firstRun = await planner.runNow({ companyId: company.id });
    expect(firstRun.status).toBe("completed");
    expect(createdTaskIds).toHaveLength(1);

    const secondRun = await planner.runNow({ companyId: company.id });
    expect(secondRun.status).toBe("completed");
    expect(createdTaskIds).toHaveLength(1);
  });
});
