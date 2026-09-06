import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { BrowserOption, Project } from '../../core/models/project.model';
import { ProjectService } from '../../core/services/project.service';

export type ProjectDialogResult = Omit<Project, 'id'>;

@Component({
  selector: 'app-project-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './project-dialog.component.html',
  styleUrl: './project-dialog.component.scss'
})
export class ProjectDialogComponent {
  readonly browserOptions: BrowserOption[];
  readonly form: FormGroup;

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly dialogRef: MatDialogRef<ProjectDialogComponent, ProjectDialogResult>,
    private readonly projectService: ProjectService,
    @Inject(MAT_DIALOG_DATA) readonly data: Project | null
  ) {
    this.browserOptions = this.projectService.getBrowserOptions();
    this.form = this.formBuilder.nonNullable.group({
      name: [this.data?.name ?? '', Validators.required],
      baseUrl: [this.data?.baseUrl ?? '', Validators.required],
      browser: [this.data?.browser ?? this.browserOptions[0], Validators.required],
      username: [this.data?.username ?? '', Validators.required],
      password: [this.data?.password ?? '', Validators.required]
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({
      name: value.name.trim(),
      baseUrl: value.baseUrl.trim(),
      browser: value.browser as BrowserOption,
      username: value.username.trim(),
      password: value.password
    });
  }
}
