import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatBadgeModule } from '@angular/material/badge';

import { combineLatest, map, startWith, Subscription } from 'rxjs';

import { ProjectService } from '../../core/services/project.service';
import { FeatureService } from '../../core/services/feature.service';
import { ExecutionService } from '../../core/services/execution.service';
import { SessionService, SessionState } from '../../core/services/session.service';
import { EnvironmentType } from '../../core/models/execution.model';

export interface AccessibilityStandardOption {
  id: string;
  label: string;
  description: string;
  badge: string;
}

@Component({
  selector: 'app-launch-center',
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
    MatTooltipModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatBadgeModule
  ],
  templateUrl: './launch-center.component.html',
  styleUrl: './launch-center.component.scss'
})
export class LaunchCenterComponent implements OnInit, OnDestroy {
  launchForm: FormGroup;
  isLaunching = false;
  launchedExecutionId: number | null = null;

  readonly environmentOptions: EnvironmentType[] = ['QA', 'Staging', 'Prod'];
  readonly retryOptions = [0, 1, 2, 3];
  
  readonly availableTagChips = [
    '@smoke',
    '@regression',
    '@login',
    '@checkout',
    '@accessibility',
    '@api',
    '@performance',
    '@wip'
  ];

  readonly accessibilityStandards: AccessibilityStandardOption[] = [
    { id: 'wcag21aa', label: 'WCAG 2.1 AA', description: 'W3C Web Content Accessibility Guidelines 2.1 Level AA', badge: 'Standard' },
    { id: 'wcag22aa', label: 'WCAG 2.2 AA', description: 'Updated W3C Guidelines with 9 additional criteria', badge: 'Latest' },
    { id: 'ada3', label: 'ADA Title III', description: 'Americans with Disabilities Act Public Accommodations', badge: 'US Fed' },
    { id: 'sec508', label: 'Section 508', description: 'US Federal Procurement Standards & Rehabilitation Act', badge: 'Compliance' },
    { id: 'eaa301549', label: 'EAA EN 301 549', description: 'European Accessibility Act Mandate for ICT Products', badge: 'EU Standard' },
    { id: 'aoda', label: 'AODA Compliance', description: 'Accessibility for Ontarians with Disabilities Act', badge: 'Regional' }
  ];

  selectedStandards: string[] = ['wcag21aa', 'wcag22aa'];

  readonly projects$;
  readonly featureOptions$;
  readonly sessions$;
  readonly selectedProject$;

  private readonly subscription = new Subscription();

  constructor(
    private readonly fb: FormBuilder,
    private readonly projectService: ProjectService,
    private readonly featureService: FeatureService,
    private readonly executionService: ExecutionService,
    private readonly sessionService: SessionService,
    private readonly router: Router
  ) {
    this.projects$ = this.projectService.projects$;
    
    this.launchForm = this.fb.group({
      projectId: [1, Validators.required],
      featureIds: [[1, 2], Validators.required],
      environment: ['QA' as EnvironmentType, Validators.required],
      targetUrl: ['https://qa.customer-portal.local', [Validators.required]],
      browserMode: ['headless' as 'headless' | 'interactive', Validators.required],
      tags: ['@smoke @regression'],
      retryCount: [1],
      sessionState: ['none'], // Default to none as requested
      enableAccessibilityScan: [true],
      enableScreenshots: [true],
      enableVideo: [true],
      enableTrace: [true],
      parallelWorkers: [4]
    });

    this.sessions$ = combineLatest([
      this.sessionService.sessions$,
      this.launchForm.controls['projectId'].valueChanges.pipe(
        startWith(this.launchForm.controls['projectId'].value)
      ),
      this.launchForm.controls['environment'].valueChanges.pipe(
        startWith(this.launchForm.controls['environment'].value)
      ),
      this.projects$
    ]).pipe(
      map(([sessions, projectId, environment, projects]) => {
        const project = projects.find(p => p.id === Number(projectId));
        if (!project) return [];
        
        // Clean names for matching (matching session.service.js rules)
        const cleanProj = project.name.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanProjId = String(project.id).toLowerCase();
        
        return sessions.filter(s => {
          const sessionName = s.name.toLowerCase();
          const matchesProj = sessionName.includes(cleanProj) || 
                              sessionName.includes(cleanProjId) || 
                              (project.name.toLowerCase() === 'customer portal' && sessionName.includes('customerportal')) ||
                              (project.name.toLowerCase() === 'qa demo application' && sessionName.includes('qa_demo_application')) ||
                              (project.name.toLowerCase() === 'qa demo application' && sessionName.includes('localhost_3001')) ||
                              (project.name.toLowerCase() === 'qa demo application' && sessionName.includes('localhost_4000'));
          const matchesEnv = sessionName.includes(environment.toLowerCase());
          return matchesProj && matchesEnv;
        });
      })
    );

    this.featureOptions$ = combineLatest([
      this.featureService.features$,
      this.launchForm.controls['projectId'].valueChanges.pipe(
        startWith(this.launchForm.controls['projectId'].value)
      )
    ]).pipe(
      map(([features, projectId]) =>
        features.filter(f => f.projectId === Number(projectId))
      )
    );

    this.selectedProject$ = combineLatest([
      this.projects$,
      this.launchForm.controls['projectId'].valueChanges.pipe(
        startWith(this.launchForm.controls['projectId'].value)
      )
    ]).pipe(
      map(([projects, projectId]) =>
        projects.find(p => p.id === Number(projectId))
      )
    );
  }

  ngOnInit(): void {
    this.subscription.add(
      this.launchForm.controls['projectId'].valueChanges.subscribe((projId) => {
        const project = this.projectService.getProjectSnapshot().find(p => p.id === Number(projId));
        if (project && project.baseUrl) {
          this.launchForm.controls['targetUrl'].setValue(project.baseUrl);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  toggleStandard(id: string): void {
    if (this.selectedStandards.includes(id)) {
      this.selectedStandards = this.selectedStandards.filter(s => s !== id);
    } else {
      this.selectedStandards = [...this.selectedStandards, id];
    }
  }

  isStandardSelected(id: string): boolean {
    return this.selectedStandards.includes(id);
  }

  toggleTagChip(tag: string): void {
    const currentTags = this.launchForm.value.tags || '';
    if (currentTags.includes(tag)) {
      const updated = currentTags.replace(tag, '').replace(/\s+/g, ' ').trim();
      this.launchForm.controls['tags'].setValue(updated);
    } else {
      const updated = currentTags ? `${currentTags} ${tag}` : tag;
      this.launchForm.controls['tags'].setValue(updated);
    }
  }

  isTagActive(tag: string): boolean {
    const currentTags = this.launchForm.value.tags || '';
    return currentTags.includes(tag);
  }

  launchQualitySuite(): void {
    if (this.launchForm.invalid) {
      this.launchForm.markAllAsTouched();
      return;
    }

    this.isLaunching = true;
    const formVals = this.launchForm.getRawValue();
    const executionId = Date.now();
    this.launchedExecutionId = executionId;

    const project = this.projectService
      .getProjectSnapshot()
      .find(p => p.id === Number(formVals.projectId));

    const selectedFeatureIds = (formVals.featureIds || []) as number[];
    const features = this.featureService
      .getFeatureSnapshot()
      .filter(f => selectedFeatureIds.includes(f.id));

    const featureNames = features.map(f => f.name);
    const featureLabel = featureNames.length > 0 ? featureNames.join(', ') : 'Custom Suite';

    this.executionService.runTest({
      projectName: project ? project.name : 'Enterprise Suite',
      featureName: featureLabel,
      featureNames,
      environment: formVals.environment as EnvironmentType,
      mode: 'workspace',
      tags: formVals.tags || undefined,
      retryCount: formVals.retryCount || 0,
      targetUrl: formVals.targetUrl || undefined,
      browserMode: formVals.browserMode || 'headless',
      sessionState: formVals.sessionState,
      enableAccessibilityScan: formVals.enableAccessibilityScan,
      enableScreenshots: formVals.enableScreenshots !== false,
      enableVideo: formVals.enableVideo !== false,
      enableTrace: formVals.enableTrace !== false
    }, executionId);

    setTimeout(() => {
      this.isLaunching = false;
      this.router.navigate(['/execution', executionId]);
    }, 1200);
  }
}
