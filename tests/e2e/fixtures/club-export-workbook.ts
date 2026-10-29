import ExcelJS from 'exceljs';

/** Compare every cell and style without depending on ZIP timestamps or style IDs. */
export async function clubWorkbookSnapshot(path: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const styles: string[] = [];
  const sheets = workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    views: sheet.views,
    widths: sheet.columns.map((column) => column.width),
    autoFilter: sheet.autoFilter,
    rows: Array.from({ length: sheet.rowCount }, (_, i) => {
      const row = sheet.getRow(i + 1);
      const cells = Array.from({ length: sheet.columnCount }, (_, col) => row.getCell(col + 1));
      return {
        height: row.height,
        values: cells.map((cell) => cell.value),
        styles: cells.map((cell) => {
          const value = JSON.stringify(cell.style);
          let index = styles.indexOf(value);
          if (index < 0) {
            index = styles.length;
            styles.push(value);
          }

          return index;
        })
      };
    })
  }));

  return JSON.parse(
    JSON.stringify({
      creator: workbook.creator,
      sheets,
      styles: styles.map((style) => JSON.parse(style))
    })
  );
}
