import * as XLSX from 'xlsx';
import type { MappedEvent } from './gemini';

export interface ExcelDataResult {
  headers: string[];
  rawData: string[][];
}

export function readExcelData(file: File): Promise<ExcelDataResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON array (array of arrays)
        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
          resolve({ headers: [], rawData: [] });
          return;
        }

        // Extract headers from the first row, ensuring strings
        const headers = (jsonData[0] || []).map((h, i) => h ? h.toString() : `Column ${i + 1}`);
        
        // Convert the rest of the rows to strings
        const rawData = jsonData.slice(1).map(row => 
          (row || []).map(cell => cell != null ? cell.toString().trim() : '')
        );

        resolve({ headers, rawData });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

export function exportHarmonization(
  events: MappedEvent[],
  carrierName: string,
  fileName: string = 'harmonization.xlsx'
) {
  const wb = XLSX.utils.book_new();
  
  // Format matches the template
  const data = [
    ['Export time', 'Exported by', 'Sender (code)', 'Version 1.2', null],
    [new Date().toLocaleString('en-GB').replace(',', ''), 'ai-harmonizer@kavehome.com', 'System', null, null],
    [null, null, null, null, null],
    ['Code', 'Description', 'Internal Event (MyEvent)', 'Carrier', 'Internal Return Event (MyReturnEvent)'],
  ];

  events.forEach((event) => {
    data.push([
      event.code,
      event.description,
      event.internalEvent || '',
      carrierName,
      event.internalReturnEvent || event.internalEvent || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Auto-adjust column widths roughly
  const colWidths = [
    { wch: 20 }, // Code
    { wch: 60 }, // Description
    { wch: 30 }, // Internal Event
    { wch: 20 }, // Carrier
    { wch: 35 }, // Internal Return Event
  ];
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Harmonization');
  XLSX.writeFile(wb, fileName);
}

export function readExcelToCsv(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        resolve(csv);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}
