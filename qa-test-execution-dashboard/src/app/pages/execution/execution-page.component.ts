import { CommonModule } from '@angular/common';
import { Component, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { combineLatest, map, startWith, Subscription, Observable, tap } from 'rxjs';

import { FeatureService } from '../../core/services/feature.service';
import { ProjectService } from '../../core/services/project.service';
import { ExecutionService, UploadedStepFile } from '../../core/services/execution.service';
import { EnvironmentType, ExecutionArtifacts } from '../../core/models/execution.model';
import { ExecutionLog } from '../../core/models/execution-log.model';

@Component({
  selector: 'app-execution-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatFormFieldModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatTabsModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './execution-page.component.html',
  styleUrl: './execution-page.component.scss'
})
export class ExecutionPageComponent implements OnDestroy, AfterViewChecked {

  @ViewChild('logsPanelContainer') logsPanelContainer?: ElementRef<HTMLDivElement>;

  readonly environmentOptions: EnvironmentType[] = ['QA', 'Staging', 'Prod'];
  readonly retryOptions = [0, 1, 2, 3];
  readonly scenarios$;

  readonly projects$;
  readonly featureOptions$;
  readonly selectedProject$;
  private scenarioState = new Map<number, boolean>();

  readonly liveLogs$!: Observable<ExecutionLog[]>;
  readonly liveArtifacts$!: Observable<ExecutionArtifacts | undefined>;
  readonly executionSummary$;
  readonly form;

  executionMode: 'workspace' | 'upload' = 'workspace';
  uploadedFeatureFile: { name: string; content: string } | null = null;
  uploadedStepFiles: UploadedStepFile[] = [];

  selectedScreenshotUrl: string | null = null;
  readonly availableTagChips: string[] = ['@smoke', '@regression', '@login', '@checkout', '@wip'];

  private readonly subscription = new Subscription();
  currentExecutionId: number | null = null;
  isExecuting = false;
  private shouldAutoScroll = true;

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly projectService: ProjectService,
    private readonly featureService: FeatureService,
    private readonly executionService: ExecutionService,
    private readonly snackBar: MatSnackBar
  ) {
    this.scenarios$ = this.executionService.scenariosByExecutionId$;

    this.form = this.formBuilder.group({
      projectId: [1, Validators.required],
      featureIds: [[1], Validators.required],
      environment: ['QA' as EnvironmentType, Validators.required],
      targetUrl: ['https://qa.customer-portal.local', [Validators.required]],
      tags: [''],
      retryCount: [0],
      browserMode: ['headless' as 'headless' | 'interactive', Validators.required]
    });

    this.projects$ = this.projectService.projects$;

    this.featureOptions$ = combineLatest([
      this.featureService.features$,
      this.form.controls.projectId.valueChanges.pipe(
        startWith(this.form.controls.projectId.value)
      )
    ]).pipe(
      map(([features, projectId]) =>
        features.filter(f => f.projectId === Number(projectId))
      )
    );

    this.selectedProject$ = combineLatest([
      this.projects$,
      this.form.controls.projectId.valueChanges.pipe(
        startWith(this.form.controls.projectId.value)
      )
    ]).pipe(
      map(([projects, projectId]) =>
        projects.find(p => p.id === Number(projectId))
      )
    );

    this.subscription.add(
      this.projectService.projects$.subscribe((projects) => {
        if (projects && projects.length > 0) {
          const defaultProject = projects[0];
          if (this.form.controls.projectId.value === 1 && this.form.controls.targetUrl.value === 'https://qa.customer-portal.local') {
            this.form.patchValue({
              projectId: defaultProject.id,
              targetUrl: defaultProject.baseUrl
            });
          }
        }
      })
    );

    this.subscription.add(
      this.form.controls.projectId.valueChanges.subscribe((projId) => {
        this.form.controls.featureIds.setValue([]);
        const project = this.projectService.getProjectSnapshot().find(p => p.id === Number(projId));
        if (project && project.baseUrl) {
          this.form.controls.targetUrl.setValue(project.baseUrl);
        }
      })
    );

    this.liveLogs$ = this.executionService.logsByExecutionId$.pipe(
      map(map => {
        return this.currentExecutionId
          ? (map.get(this.currentExecutionId) ?? [])
          : [];
      }),
      tap(() => {
        // Whenever logs update, trigger auto scroll to bottom
        this.shouldAutoScroll = true;
      })
    );

    this.liveArtifacts$ = this.executionService.artifactsByExecutionId$.pipe(
      map(map => {
        return this.currentExecutionId
          ? map.get(this.currentExecutionId)
          : undefined;
      })
    );

    this.executionSummary$ = this.liveLogs$.pipe(
      map((logs) => {
        const scenarios = logs.filter(l => l.type === 'scenario').length;
        const passedSteps = logs.filter(l => l.type === 'step' && l.status === 'passed').length;
        const failedSteps = logs.filter(l => l.type === 'step' && l.status === 'failed').length;
        const isEnded = logs.some(l => l.type === 'end');

        if (isEnded) {
          this.isExecuting = false;
        }

        return {
          scenarios,
          passedSteps,
          failedSteps,
          totalSteps: passedSteps + failedSteps,
          status: failedSteps > 0 ? 'Failed' : (passedSteps > 0 ? 'Passed' : (isEnded ? 'Completed' : 'Running'))
        };
      })
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll && this.logsPanelContainer) {
      this.scrollToBottom();
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.logsPanelContainer) {
        const el = this.logsPanelContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    } catch (err) {}
  }

  onLogsScroll(): void {
    if (this.logsPanelContainer) {
      const el = this.logsPanelContainer.nativeElement;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      this.shouldAutoScroll = atBottom;
    }
  }

  setExecutionMode(mode: 'workspace' | 'upload'): void {
    this.executionMode = mode;
  }

  onFeatureFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (!file.name.endsWith('.feature')) {
        this.snackBar.open('Please select a valid .feature file.', 'Close', { duration: 4000 });
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = (e.target?.result as string) || '';
        if (!content.trim()) {
          this.snackBar.open(`Warning: Loaded feature file "${file.name}" is empty.`, 'Close', { duration: 4000 });
        } else {
          this.snackBar.open(`Feature file "${file.name}" loaded for execution!`, 'Close', { duration: 4000 });
        }
        this.uploadedFeatureFile = {
          name: file.name,
          content
        };
      };
      reader.onerror = () => {
        this.snackBar.open(`Error reading file "${file.name}".`, 'Close', { duration: 4000 });
      };
      reader.readAsText(file);
    }
    input.value = '';
  }

  onStepFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files);
      let loadedCount = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.uploadedStepFiles.push({
            name: file.name,
            content: (e.target?.result as string) || ''
          });
          loadedCount++;
          if (loadedCount === files.length) {
            this.snackBar.open(`${loadedCount} step definition file(s) loaded successfully!`, 'Close', { duration: 4000 });
          }
        };
        reader.onerror = () => {
          this.snackBar.open(`Error reading step file "${file.name}".`, 'Close', { duration: 4000 });
        };
        reader.readAsText(file);
      });
    }
    input.value = '';
  }

  removeFeatureFile(): void {
    const name = this.uploadedFeatureFile?.name;
    this.uploadedFeatureFile = null;
    if (name) {
      this.snackBar.open(`Removed feature file "${name}".`, 'Close', { duration: 3000 });
    }
  }

  removeStepFile(index: number): void {
    const file = this.uploadedStepFiles[index];
    this.uploadedStepFiles.splice(index, 1);
    if (file) {
      this.snackBar.open(`Removed step file "${file.name}".`, 'Close', { duration: 3000 });
    }
  }

  canRunTest(): boolean {
    if (this.executionMode === 'workspace') {
      return this.form.valid;
    }
    return !!this.uploadedFeatureFile;
  }

  runTest(): void {
    if (!this.canRunTest()) {
      return;
    }

    const { environment, targetUrl, tags, retryCount, browserMode } = this.form.getRawValue();
    const executionId = Date.now();
    this.currentExecutionId = executionId;
    this.isExecuting = true;
    this.shouldAutoScroll = true;

    console.log('[Angular Layer 1 - Feature Execution] Form values extracted:', {
      executionMode: this.executionMode,
      environment,
      browserMode: browserMode || 'headless',
      targetUrl
    });

    if (this.executionMode === 'upload' && this.uploadedFeatureFile) {
      this.executionService.runTest({
        projectName: 'Dynamic Upload Execution',
        featureName: this.uploadedFeatureFile.name,
        environment: environment as EnvironmentType,
        mode: 'upload',
        featureFileName: this.uploadedFeatureFile.name,
        featureContent: this.uploadedFeatureFile.content,
        stepFiles: this.uploadedStepFiles,
        tags: tags || undefined,
        retryCount: retryCount || 0,
        targetUrl: targetUrl || undefined,
        browserMode: browserMode || 'headless'
      }, executionId);
    } else {
      const project = this.projectService
        .getProjectSnapshot()
        .find(p => p.id === Number(this.form.value.projectId));

      const selectedFeatureIds = (this.form.value.featureIds || []) as number[];

      const features = this.featureService
        .getFeatureSnapshot()
        .filter(f => selectedFeatureIds.includes(f.id));

      if (!project || features.length === 0) return;

      const featureNames = features.map(f => f.name);

      this.executionService.runTest({
        projectName: project.name,
        featureName: featureNames.join(', '),
        featureNames,
        environment: environment as EnvironmentType,
        mode: 'workspace',
        tags: tags || undefined,
        retryCount: retryCount || 0,
        targetUrl: targetUrl || undefined,
        browserMode: browserMode || 'headless'
      }, executionId);
    }
  }

  cancelExecution(): void {
    if (this.currentExecutionId) {
      this.executionService.cancelExecution(this.currentExecutionId);
      this.isExecuting = false;
    }
  }

  toggleTagChip(tag: string): void {
    const rawTags = (this.form.value.tags || '').trim();
    let tagList = rawTags
      ? rawTags.split(/\s+or\s+/i).map(t => t.trim()).filter(Boolean)
      : [];

    if (tagList.includes(tag)) {
      tagList = tagList.filter(t => t !== tag);
    } else {
      tagList.push(tag);
    }

    this.form.controls.tags.setValue(tagList.join(' or '));
  }

  rerunFailedScenarios(): void {
    this.form.controls.tags.setValue('@failed or not @passed');
    this.runTest();
  }

  openScreenshotModal(url: string): void {
    this.selectedScreenshotUrl = url;
  }

  closeScreenshotModal(): void {
    this.selectedScreenshotUrl = null;
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  isStepVisible(logs: ExecutionLog[] | null | undefined, index: number): boolean {
    if (!logs || !Array.isArray(logs)) return false;
    const current = logs[index];
    if (!current || current.type !== 'step') return false;

    for (let i = index - 1; i >= 0; i--) {
      const prev = logs[i];
      if (prev.type === 'scenario') {
        return this.scenarioState.get(prev.scenarioId!) ?? true;
      }
    }
    return true;
  }

  isScenarioExpanded(log: ExecutionLog): boolean {
    if (!log.scenarioId) return true;
    return this.scenarioState.get(log.scenarioId) ?? true;
  }

  toggleScenario(log: ExecutionLog): void {
    if (log.scenarioId == null) return;
    const current = this.scenarioState.get(log.scenarioId) ?? true;
    this.scenarioState.set(log.scenarioId, !current);
  }
}