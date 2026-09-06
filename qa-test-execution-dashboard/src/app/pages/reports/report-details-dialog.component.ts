import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ExecutionReport } from '../../core/models/report.model';

@Component({
  selector: 'app-report-details-dialog',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatDialogModule],
  templateUrl: './report-details-dialog.component.html'
})
export class ReportDetailsDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) readonly data: ExecutionReport) {}
}
