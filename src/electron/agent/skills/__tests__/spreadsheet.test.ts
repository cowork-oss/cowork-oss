import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ExcelJS from 'exceljs';
import type { Workspace } from '../../../../shared/types';
import { SpreadsheetBuilder } from '../spreadsheet';

describe('SpreadsheetBuilder', () => {
  it('writes formula strings (e.g. "=SUM(A1:A2)") as Excel formulas', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cowork-spreadsheet-'));
    const workspace: Workspace = {
      id: 'test-workspace',
      name: 'test-workspace',
      path: tmpDir,
      createdAt: Date.now(),
      permissions: { read: true, write: true, delete: true, network: true, shell: false },
    };

    const builder = new SpreadsheetBuilder(workspace);
    const outPath = path.join(tmpDir, 'formulas.xlsx');

    await builder.create(outPath, [
      {
        name: 'Data',
        hasHeader: false,
        data: [
          ['A', 'B', 'Sum'],
          ['1', '2', '=A2+B2'],
          ['Total', '', '=SUM(C2:C2)'],
        ],
      },
    ]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outPath);
    const ws = wb.getWorksheet('Data');
    expect(ws).toBeTruthy();

    const c2 = ws!.getCell('C2').value;
    expect(c2).toBeTruthy();
    expect(typeof c2).toBe('object');
    expect(c2).toMatchObject({ formula: 'A2+B2' });
  });
});

