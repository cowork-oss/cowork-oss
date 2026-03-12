import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import {
  DEFAULT_IMPROVEMENT_LOOP_SETTINGS,
  type ImprovementLoopSettings,
} from "../../shared/types";

export class ImprovementSettingsManager {
  private static cached: ImprovementLoopSettings | null = null;

  static loadSettings(): ImprovementLoopSettings {
    if (this.cached) return this.cached;

    let settings: ImprovementLoopSettings = { ...DEFAULT_IMPROVEMENT_LOOP_SETTINGS };
    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<Partial<ImprovementLoopSettings>>("improvement-loop");
        if (stored) {
          settings = {
            ...DEFAULT_IMPROVEMENT_LOOP_SETTINGS,
            ...stored,
          };
        }
      }
    } catch (error) {
      console.error("[ImprovementSettingsManager] Failed to load settings:", error);
    }

    this.cached = this.normalize(settings);
    return this.cached;
  }

  static saveSettings(settings: ImprovementLoopSettings): void {
    if (!SecureSettingsRepository.isInitialized()) {
      throw new Error("SecureSettingsRepository not initialized");
    }
    const normalized = this.normalize(settings);
    SecureSettingsRepository.getInstance().save("improvement-loop", normalized);
    this.cached = normalized;
  }

  static clearCache(): void {
    this.cached = null;
  }

  private static normalize(input: ImprovementLoopSettings): ImprovementLoopSettings {
    return {
      enabled: !!input.enabled,
      autoRun: input.autoRun !== false,
      includeDevLogs: input.includeDevLogs !== false,
      intervalMinutes: Math.min(Math.max(Math.round(input.intervalMinutes || 24 * 60), 15), 7 * 24 * 60),
      variantsPerCampaign: Math.min(
        Math.max(Math.round(input.variantsPerCampaign || 4), 2),
        6,
      ),
      maxConcurrentCampaigns: Math.min(
        Math.max(Math.round(input.maxConcurrentCampaigns || 1), 1),
        3,
      ),
      maxOpenCandidatesPerWorkspace: Math.min(
        Math.max(Math.round(input.maxOpenCandidatesPerWorkspace || 25), 5),
        100,
      ),
      requireWorktree: input.requireWorktree !== false,
      reviewRequired: input.reviewRequired !== false,
      judgeRequired: input.judgeRequired !== false,
      promotionMode: input.promotionMode === "merge" ? "merge" : "github_pr",
      evalWindowDays: Math.min(Math.max(Math.round(input.evalWindowDays || 14), 1), 90),
      replaySetSize: Math.min(Math.max(Math.round(input.replaySetSize || 3), 1), 10),
      improvementProgramPath:
        typeof input.improvementProgramPath === "string" && input.improvementProgramPath.trim().length > 0
          ? input.improvementProgramPath.trim()
          : undefined,
    };
  }
}
