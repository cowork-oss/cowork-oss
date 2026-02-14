type LegacyPdfParseResult = {
  text: string;
  numpages?: number;
  info?: { Title?: string; Author?: string };
};

type LegacyPdfParseFn = (dataBuffer: Buffer) => Promise<LegacyPdfParseResult>;

type V2TextResult = {
  text?: string;
  total?: number;
};

type V2InfoResult = {
  total?: number;
  info?: { Title?: string; Author?: string };
};

type V2ParserInstance = {
  getText: () => Promise<V2TextResult>;
  getInfo?: () => Promise<V2InfoResult>;
  destroy?: () => Promise<void> | void;
};

type V2ParserCtor = new (params: { data: Uint8Array }) => V2ParserInstance;

type PdfParseModuleShape =
  | LegacyPdfParseFn
  | {
      default?: LegacyPdfParseFn;
      PDFParse?: V2ParserCtor;
    };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require('pdf-parse') as PdfParseModuleShape;

const legacyPdfParseFn: LegacyPdfParseFn | null =
  typeof pdfParseModule === 'function'
    ? pdfParseModule
    : typeof pdfParseModule.default === 'function'
      ? pdfParseModule.default
      : null;

const pdfParseV2Ctor: V2ParserCtor | undefined =
  typeof pdfParseModule === 'object' ? pdfParseModule.PDFParse : undefined;

/**
 * Parse PDF buffers across pdf-parse v1 (function export) and v2 (PDFParse class).
 */
export async function parsePdfBuffer(dataBuffer: Buffer): Promise<LegacyPdfParseResult> {
  if (legacyPdfParseFn) {
    return legacyPdfParseFn(dataBuffer);
  }

  if (typeof pdfParseV2Ctor === 'function') {
    const parser = new pdfParseV2Ctor({ data: dataBuffer });
    try {
      const textResult = await parser.getText();

      // Metadata is optional for preview and should not block text extraction.
      let infoResult: V2InfoResult | undefined;
      if (typeof parser.getInfo === 'function') {
        try {
          infoResult = await parser.getInfo();
        } catch {
          infoResult = undefined;
        }
      }

      return {
        text: textResult.text ?? '',
        numpages: infoResult?.total ?? textResult.total,
        info: infoResult?.info
          ? {
              Title: infoResult.info.Title,
              Author: infoResult.info.Author,
            }
          : undefined,
      };
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  throw new Error('Unsupported pdf-parse module export shape');
}
