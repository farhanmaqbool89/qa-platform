import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ReportExporterService {

  /**
   * Export array of row data to a downloadable CSV spreadsheet
   */
  exportToCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
    const csvLines: string[] = [];
    csvLines.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

    rows.forEach(row => {
      const formattedRow = row.map(val => {
        const strVal = String(val ?? '');
        return `"${strVal.replace(/"/g, '""')}"`;
      });
      csvLines.push(formattedRow.join(','));
    });

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export executive summary to printable PDF / print preview window
   */
  exportExecutivePdf(summaryData: {
    summary: any;
    trends: any[];
    flakyTests: any[];
  }): void {
    const { summary, trends, flakyTests } = summaryData;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Executive QA & Accessibility Analytics Report</title>
        <style>
          body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; padding: 2rem; line-height: 1.5; background: #ffffff; }
          .header { border-bottom: 2px solid #6366f1; padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
          h1 { margin: 0; font-size: 1.75rem; color: #1e293b; }
          .subtitle { color: #64748b; font-size: 0.9rem; margin-top: 0.25rem; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; text-align: center; }
          .card .val { font-size: 1.8rem; font-weight: 800; color: #4f46e5; }
          .card .lbl { font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-top: 0.25rem; }
          h2 { font-size: 1.25rem; color: #334155; border-left: 4px solid #4f46e5; padding-left: 0.5rem; margin-top: 2rem; }
          table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
          th { background: #f1f5f9; text-align: left; padding: 0.6rem 0.8rem; font-size: 0.8rem; text-transform: uppercase; color: #475569; }
          td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; }
          .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem; }
          .badge-high { background: #fee2e2; color: #991b1b; }
          .badge-medium { background: #fef3c7; color: #92400e; }
          .badge-low { background: #d1fae5; color: #065f46; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Executive QA & Accessibility Analytics Report</h1>
            <div class="subtitle">Generated on ${new Date().toLocaleString()} | QA Automation Execution Dashboard</div>
          </div>
          <button class="no-print" onclick="window.print()" style="background: #4f46e5; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600;">🖨 Print / Save as PDF</button>
        </div>

        <div class="grid">
          <div class="card">
            <div class="val">${summary.passRate}%</div>
            <div class="lbl">Overall Pass Rate</div>
          </div>
          <div class="card">
            <div class="val">${summary.totalExecutions}</div>
            <div class="lbl">Total Executions</div>
          </div>
          <div class="card">
            <div class="val">${summary.avgAccessibilityScore}/100</div>
            <div class="lbl">Avg WCAG Score</div>
          </div>
          <div class="card">
            <div class="val">${summary.avgDurationSeconds}s</div>
            <div class="lbl">Avg Run Duration</div>
          </div>
        </div>

        <h2>Historical Execution Trends (7 Days)</h2>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Date</th>
              <th>Total Runs</th>
              <th>Passed</th>
              <th>Failed</th>
              <th>Pass Rate</th>
              <th>Avg Duration</th>
            </tr>
          </thead>
          <tbody>
            ${trends.map(t => `
              <tr>
                <td><b>${t.dayName}</b></td>
                <td>${t.date}</td>
                <td>${t.total}</td>
                <td style="color: #10b981; font-weight: 600;">${t.passed}</td>
                <td style="color: #ef4444; font-weight: 600;">${t.failed}</td>
                <td>${t.passRate}%</td>
                <td>${t.avgDuration}s</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Flaky Test Matrix & Reliability Warnings</h2>
        <table>
          <thead>
            <tr>
              <th>Scenario Name</th>
              <th>Feature File</th>
              <th>Unstability Rate</th>
              <th>Runs (Pass / Fail)</th>
              <th>Risk Level</th>
            </tr>
          </thead>
          <tbody>
            ${flakyTests.map(f => `
              <tr>
                <td><b>${f.scenarioName}</b></td>
                <td><code>${f.featureFile}</code></td>
                <td style="color: #ef4444; font-weight: 700;">${f.flakinessScore}%</td>
                <td>${f.passedRuns} / ${f.failedRuns} (of ${f.totalRuns})</td>
                <td><span class="badge badge-${f.riskLevel.toLowerCase()}">${f.riskLevel}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  }
}
