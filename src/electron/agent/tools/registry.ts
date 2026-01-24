import { Workspace } from '../../../shared/types';
import { AgentDaemon } from '../daemon';
import { FileTools } from './file-tools';
import { SkillTools } from './skill-tools';
import { LLMTool } from '../llm/types';

/**
 * ToolRegistry manages all available tools and their execution
 */
export class ToolRegistry {
  private fileTools: FileTools;
  private skillTools: SkillTools;

  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string
  ) {
    this.fileTools = new FileTools(workspace, daemon, taskId);
    this.skillTools = new SkillTools(workspace, daemon, taskId);
  }

  /**
   * Get all available tools in provider-agnostic format
   */
  getTools(): LLMTool[] {
    return [
      ...this.getFileToolDefinitions(),
      ...this.getSkillToolDefinitions(),
    ];
  }

  /**
   * Get human-readable tool descriptions
   */
  getToolDescriptions(): string {
    return `
File Operations:
- read_file: Read contents of a file
- write_file: Write content to a file (creates or overwrites)
- list_directory: List files and folders in a directory
- rename_file: Rename or move a file
- delete_file: Delete a file (requires approval)
- create_directory: Create a new directory
- search_files: Search for files by name or content

Skills:
- create_spreadsheet: Create Excel spreadsheets with data and formulas
- create_document: Create Word documents or PDFs
- create_presentation: Create PowerPoint presentations
- organize_folder: Organize and structure files in folders
    `.trim();
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, input: any): Promise<any> {
    // File tools
    if (name === 'read_file') return await this.fileTools.readFile(input.path);
    if (name === 'write_file') return await this.fileTools.writeFile(input.path, input.content);
    if (name === 'list_directory') return await this.fileTools.listDirectory(input.path);
    if (name === 'rename_file') return await this.fileTools.renameFile(input.oldPath, input.newPath);
    if (name === 'delete_file') return await this.fileTools.deleteFile(input.path);
    if (name === 'create_directory') return await this.fileTools.createDirectory(input.path);
    if (name === 'search_files') return await this.fileTools.searchFiles(input.query, input.path);

    // Skill tools
    if (name === 'create_spreadsheet') return await this.skillTools.createSpreadsheet(input);
    if (name === 'create_document') return await this.skillTools.createDocument(input);
    if (name === 'create_presentation') return await this.skillTools.createPresentation(input);
    if (name === 'organize_folder') return await this.skillTools.organizeFolder(input);

    throw new Error(`Unknown tool: ${name}`);
  }

  /**
   * Define file operation tools
   */
  private getFileToolDefinitions(): LLMTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file within the workspace',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file in the workspace (creates or overwrites)',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file within the workspace',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_directory',
        description: 'List files and folders in a directory',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the directory (or "." for workspace root)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'rename_file',
        description: 'Rename or move a file',
        input_schema: {
          type: 'object',
          properties: {
            oldPath: {
              type: 'string',
              description: 'Current path of the file',
            },
            newPath: {
              type: 'string',
              description: 'New path for the file',
            },
          },
          required: ['oldPath', 'newPath'],
        },
      },
      {
        name: 'delete_file',
        description: 'Delete a file (requires user approval)',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to delete',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'create_directory',
        description: 'Create a new directory',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path for the new directory',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'search_files',
        description: 'Search for files by name or content',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (filename or content)',
            },
            path: {
              type: 'string',
              description: 'Directory to search in (optional, defaults to workspace root)',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  /**
   * Define skill tools
   */
  private getSkillToolDefinitions(): LLMTool[] {
    return [
      {
        name: 'create_spreadsheet',
        description: 'Create an Excel spreadsheet with data, formulas, and formatting',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the Excel file (without extension)' },
            sheets: {
              type: 'array',
              description: 'Array of sheets to create',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  data: { type: 'array', description: '2D array of cell values' },
                },
              },
            },
          },
          required: ['filename', 'sheets'],
        },
      },
      {
        name: 'create_document',
        description: 'Create a formatted Word document or PDF',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the document' },
            format: { type: 'string', enum: ['docx', 'pdf'], description: 'Output format' },
            content: {
              type: 'array',
              description: 'Document content blocks',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['heading', 'paragraph', 'list'] },
                  text: { type: 'string' },
                  level: { type: 'number', description: 'For headings: 1-6' },
                },
              },
            },
          },
          required: ['filename', 'format', 'content'],
        },
      },
      {
        name: 'create_presentation',
        description: 'Create a PowerPoint presentation',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the presentation' },
            slides: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
          required: ['filename', 'slides'],
        },
      },
      {
        name: 'organize_folder',
        description: 'Organize files in a folder by type, date, or custom rules',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Folder path to organize' },
            strategy: {
              type: 'string',
              enum: ['by_type', 'by_date', 'custom'],
              description: 'Organization strategy',
            },
            rules: { type: 'object', description: 'Custom organization rules (if strategy is custom)' },
          },
          required: ['path', 'strategy'],
        },
      },
    ];
  }
}
