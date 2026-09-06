import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { combineLatest, map, startWith } from 'rxjs';
import { FeatureFile } from '../../core/models/feature.model';
import { Project } from '../../core/models/project.model';
import { FeatureService } from '../../core/services/feature.service';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'app-features-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule
  ],
  templateUrl: './features-page.component.html',
  styleUrl: './features-page.component.scss'
})
export class FeaturesPageComponent {
  readonly displayedColumns = ['name', 'updatedAt', 'actions'];
  readonly projects$;
  readonly savedFeatures$;
  readonly filteredFeatures$;
  readonly form;
  readonly filterForm;

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly featureService: FeatureService,
    private readonly projectService: ProjectService,
    private readonly snackBar: MatSnackBar
  ) {
    this.projects$ = this.projectService.projects$;
    this.savedFeatures$ = this.featureService.features$;
    this.form = this.formBuilder.nonNullable.group({
      projectId: [0, [Validators.required, Validators.min(1)]],
      name: ['', Validators.required],
      content: ['', Validators.required]
    });
    this.filterForm = this.formBuilder.nonNullable.group({
      projectId: [0]
    });

    this.filteredFeatures$ = combineLatest([
      this.savedFeatures$,
      this.filterForm.controls.projectId.valueChanges.pipe(startWith(0))
    ]).pipe(
      map(([features, projectId]) =>
        projectId === 0 ? features : features.filter(f => f.projectId === projectId)
      )
    );
  }

  uploadFeatureFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.endsWith('.feature')) {
      this.snackBar.open('Please select a valid .feature file.', 'Close', { duration: 4000 });
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      if (!content.trim()) {
        this.snackBar.open(`Warning: Loaded feature file "${file.name}" is empty.`, 'Close', { duration: 4000 });
      } else {
        this.snackBar.open(`Feature file "${file.name}" loaded into editor successfully!`, 'Close', { duration: 4000 });
      }
      this.form.patchValue({
        name: file.name,
        content
      });
    };
    reader.onerror = () => {
      this.snackBar.open(`Error reading file "${file.name}".`, 'Close', { duration: 4000 });
    };
    reader.readAsText(file);
    input.value = '';
  }

  saveFeature(): void {
    const value = this.form.getRawValue();
    if (this.form.invalid || Number(value.projectId) === 0) {
      this.form.markAllAsTouched();
      this.snackBar.open('Please select a valid project and enter feature name & content.', 'Close', { duration: 4000 });
      return;
    }

    this.featureService.saveFeature({
      projectId: Number(value.projectId),
      name: value.name.trim(),
      content: value.content.trim()
    }).subscribe({
      next: (res) => {
        if (res && res.success) {
          this.snackBar.open(`Feature "${res.feature?.name || value.name}" saved successfully!`, 'Close', { duration: 4000 });
          this.form.reset({ projectId: 0, name: '', content: '' });
        } else {
          this.snackBar.open('Failed to save feature file.', 'Close', { duration: 4000 });
        }
      },
      error: (err) => {
        const errMsg = err?.error?.message || err?.message || 'Server error';
        this.snackBar.open(`Error saving feature: ${errMsg}`, 'Close', { duration: 5000 });
      }
    });
  }

  editFeature(feature: FeatureFile): void {
    this.form.patchValue({
      projectId: feature.projectId,
      name: feature.name,
      content: feature.content
    });
  }

  deleteFeature(feature: FeatureFile): void {
    if (confirm(`Are you sure you want to delete the feature "${feature.name}"?`)) {
      this.featureService.deleteFeature(feature.id).subscribe({
        next: (res) => {
          if (res && res.success) {
            this.snackBar.open(`Feature "${feature.name}" deleted successfully.`, 'Close', { duration: 4000 });
          } else {
            this.snackBar.open(`Failed to delete feature "${feature.name}".`, 'Close', { duration: 4000 });
          }
        },
        error: (err) => {
          const errMsg = err?.error?.message || err?.message || 'Server error';
          this.snackBar.open(`Error deleting feature: ${errMsg}`, 'Close', { duration: 5000 });
        }
      });
    }
  }

  getProjectName(feature: FeatureFile, projects: Project[]): string {
    return projects.find((project) => project.id === feature.projectId)?.name ?? 'Unknown';
  }
}
