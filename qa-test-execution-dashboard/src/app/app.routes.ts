import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Krodux | AI-Powered Quality Engineering & Test Automation Platform',
    loadComponent: () =>
      import('./pages/landing/landing-page.component').then((m) => m.LandingPageComponent)
  },
  {
    path: 'accessibility-test',
    title: 'Free WCAG Accessibility Audit Demo | Krodux',
    loadComponent: () =>
      import('./pages/landing/public-wcag-demo.component').then((m) => m.PublicWcagDemoComponent)
  },
  /* Temporarily hidden public AI demo route — preserved for future LLM integration
  {
    path: 'try-testing',
    title: 'AI Test Generation & Requirements Playground | Krodux',
    loadComponent: () =>
      import('./pages/landing/public-testing-demo.component').then((m) => m.PublicTestingDemoComponent)
  },
  */
  {
    path: 'login',
    title: 'Platform Login | Krodux',
    loadComponent: () =>
      import('./pages/login/login-page.component').then((m) => m.LoginPageComponent)
  },
  {
    path: 'register',
    title: 'Register Account | Krodux',
    loadComponent: () =>
      import('./pages/register/register-page.component').then((m) => m.RegisterPageComponent)
  },
  {
    path: 'forgot-password',
    title: 'Reset Password | Krodux',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password-page.component').then(
        (m) => m.ForgotPasswordPageComponent
      )
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell-layout.component').then((m) => m.ShellLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Overview Quality Dashboard | Krodux',
        loadComponent: () =>
          import('./pages/dashboard/dashboard-page.component').then(
            (m) => m.DashboardPageComponent
          )
      },
      {
        path: 'launch',
        title: 'Unified Launch Center | Krodux',
        loadComponent: () =>
          import('./pages/launch-center/launch-center.component').then(
            (m) => m.LaunchCenterComponent
          )
      },
      {
        path: 'projects',
        title: 'Workspace Projects | Krodux',
        loadComponent: () =>
          import('./pages/projects/projects-page.component').then((m) => m.ProjectsPageComponent)
      },
      {
        path: 'features',
        title: 'BDD Feature Suites | Krodux',
        loadComponent: () =>
          import('./pages/features/features-page.component').then((m) => m.FeaturesPageComponent)
      },
      {
        path: 'execution',
        title: 'Automation Control Center | Krodux',
        loadComponent: () =>
          import('./pages/execution/execution-page.component').then((m) => m.ExecutionPageComponent)
      },
      {
        path: 'accessibility',
        title: 'Accessibility Compliance Center | Krodux',
        loadComponent: () =>
          import('./pages/accessibility/accessibility-page.component').then((m) => m.AccessibilityPageComponent)
      },
      {
        path: 'reports',
        title: 'Reporting & Longitudinal Analytics | Krodux',
        loadComponent: () =>
          import('./pages/reports/reports-page.component').then((m) => m.ReportsPageComponent)
      },
      {
        path: 'execution/:id',
        title: 'Execution Telemetry Details | Krodux',
        loadComponent: () =>
          import('./pages/execution-detail/execution-detail.component').then((m) => m.ExecutionDetailComponent)
      },
      {
        path: 'cicd',
        title: 'CI/CD Integration Pipelines | Krodux',
        loadComponent: () =>
          import('./pages/cicd/cicd-page.component').then((m) => m.CicdPageComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
