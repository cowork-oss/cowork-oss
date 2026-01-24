import * as path from 'path';
import { Workspace } from '../../../shared/types';
import { AgentDaemon } from '../daemon';
import { SpreadsheetBuilder } from '../skills/spreadsheet';
import { DocumentBuilder } from '../skills/document';
import { PresentationBuilder } from '../skills/presentation';
import { FolderOrganizer } from '../skills/organizer';

/**
 * SkillTools implements high-level skills for document creation
 */
export class SkillTools {
  private spreadsheetBuilder: SpreadsheetBuilder;
  private documentBuilder: DocumentBuilder;
  private presentationBuilder: PresentationBuilder;
  private folderOrganizer: FolderOrganizer;

  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string
  ) {
    this.spreadsheetBuilder = new SpreadsheetBuilder(workspace);
    this.documentBuilder = new DocumentBuilder(workspace);
    this.presentationBuilder = new PresentationBuilder(workspace);
    this.folderOrganizer = new FolderOrganizer(workspace, daemon, taskId);
  }

  /**
   * Create spreadsheet
   */
  async createSpreadsheet(input: {
    filename: string;
    sheets: Array<{ name: string; data: any[][] }>;
  }): Promise<{ success: boolean; path: string }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    const filename = input.filename.endsWith('.xlsx')
      ? input.filename
      : `${input.filename}.xlsx`;

    const outputPath = path.join(this.workspace.path, filename);

    await this.spreadsheetBuilder.create(outputPath, input.sheets);

    this.daemon.logEvent(this.taskId, 'file_created', {
      path: filename,
      type: 'spreadsheet',
      sheets: input.sheets.length,
    });

    return {
      success: true,
      path: filename,
    };
  }

  /**
   * Create document
   */
  async createDocument(input: {
    filename: string;
    format: 'docx' | 'pdf';
    content: Array<{ type: string; text: string; level?: number }>;
  }): Promise<{ success: boolean; path: string }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    const filename = input.filename.endsWith(`.${input.format}`)
      ? input.filename
      : `${input.filename}.${input.format}`;

    const outputPath = path.join(this.workspace.path, filename);

    await this.documentBuilder.create(outputPath, input.format, input.content);

    this.daemon.logEvent(this.taskId, 'file_created', {
      path: filename,
      type: 'document',
      format: input.format,
    });

    return {
      success: true,
      path: filename,
    };
  }

  /**
   * Create presentation
   */
  async createPresentation(input: {
    filename: string;
    slides: Array<{ title: string; content: string[] }>;
  }): Promise<{ success: boolean; path: string }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    const filename = input.filename.endsWith('.pptx')
      ? input.filename
      : `${input.filename}.pptx`;

    const outputPath = path.join(this.workspace.path, filename);

    await this.presentationBuilder.create(outputPath, input.slides);

    this.daemon.logEvent(this.taskId, 'file_created', {
      path: filename,
      type: 'presentation',
      slides: input.slides.length,
    });

    return {
      success: true,
      path: filename,
    };
  }

  /**
   * Organize folder
   */
  async organizeFolder(input: {
    path: string;
    strategy: 'by_type' | 'by_date' | 'custom';
    rules?: any;
  }): Promise<{ success: boolean; changes: number }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    const changes = await this.folderOrganizer.organize(
      input.path,
      input.strategy,
      input.rules
    );

    this.daemon.logEvent(this.taskId, 'file_modified', {
      action: 'organize',
      path: input.path,
      strategy: input.strategy,
      changes,
    });

    return {
      success: true,
      changes,
    };
  }
}
