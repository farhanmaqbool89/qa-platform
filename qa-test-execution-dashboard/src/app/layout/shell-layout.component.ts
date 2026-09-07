import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { filter } from 'rxjs';
import { ThemeService } from '../core/services/theme.service';
import { PlatformAuthService } from '../core/services/platform-auth.service';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { io } from 'socket.io-client';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: string;
  badgeColor?: 'accent' | 'warn' | 'primary';
}

interface NavSection {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatBadgeModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss'
})
export class ShellLayoutComponent implements OnInit {
  
  isCollapsed = false;
  isMobileMenuOpen = false;
  activePageTitle = 'Dashboard';

  readonly navSections: NavSection[] = [
    {
      title: 'Core Platform',
      items: [
        { label: 'Overview Dashboard', icon: 'grid_view', route: '/dashboard' },
        { label: 'Launch Center', icon: 'rocket_launch', route: '/launch', badge: 'PRO', badgeColor: 'accent' },
        { label: 'Test Execution', icon: 'play_circle_filled', route: '/execution', badge: 'LIVE', badgeColor: 'primary' },
        { label: 'Accessibility Audit', icon: 'accessibility_new', route: '/accessibility', badge: 'WCAG', badgeColor: 'warn' }
      ]
    },
    {
      title: 'Management & Specs',
      items: [
        { label: 'Projects', icon: 'account_tree', route: '/projects' },
        { label: 'Feature Scenarios', icon: 'description', route: '/features' }
      ]
    },
    {
      title: 'Insights & CI/CD',
      items: [
        { label: 'Advanced Analytics', icon: 'insights', route: '/reports', badge: 'v2.1', badgeColor: 'warn' },
        { label: 'CI/CD Integration', icon: 'sync_alt', route: '/cicd', badge: 'NEW', badgeColor: 'accent' }
      ]
    }
  ];

  showScanModal = false;
  targetUrl = 'https://example.com';
  isScanning = false;

  constructor(
    public themeService: ThemeService,
    public router: Router,
    private http: HttpClient,
    public authService: PlatformAuthService
  ) {}

  onLogout(): void {
    this.authService.logout();
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  toggleScanModal(): void {
    this.showScanModal = !this.showScanModal;
  }

  scanStatusMessage = '';
  showScanStatus = false;

  startLiveWcagScan(): void {
    if (!this.targetUrl) return;
    this.isScanning = true;

    this.http.post('http://localhost:3000/api/accessibility/live-scan', {
      url: this.targetUrl,
      standard: 'wcag21aa',
      browserMode: 'interactive'
    }).subscribe({
      next: () => {
        this.isScanning = false;
        this.showScanModal = false;
        this.scanStatusMessage = `🌐 Interactive browser opening for ${this.targetUrl} — watch your desktop!`;
        this.showScanStatus = true;
        setTimeout(() => { this.showScanStatus = false; }, 12000);
      },
      error: (err) => {
        this.isScanning = false;
        this.scanStatusMessage = '❌ Failed to launch browser scan. Is the backend running?';
        this.showScanStatus = true;
        setTimeout(() => { this.showScanStatus = false; }, 8000);
        console.error('Failed to dispatch live scan:', err);
      }
    });
  }

  hasActiveSession = false;
  activeProject = 'customerportal';
  activeEnvironment = 'QA';
  keepBrowserOpen = true;

  checkSessionStatus(): void {
    this.http.get<any>(`http://localhost:3000/api/sessions/status?projectId=${this.activeProject}&environment=${this.activeEnvironment}`)
      .subscribe({
        next: (res) => {
          this.hasActiveSession = !!res?.hasSavedSession;
        },
        error: () => {
          this.hasActiveSession = false;
        }
      });
  }

  recordSession(): void {
    this.http.post<any>('http://localhost:3000/api/sessions/login', {
      url: this.targetUrl,
      projectId: this.activeProject,
      environment: this.activeEnvironment
    }).subscribe({
      next: () => {
        this.scanStatusMessage = `🔑 Interactive login active. Authenticate on desktop browser...`;
        this.showScanStatus = true;
        setTimeout(() => this.checkSessionStatus(), 5000);
      }
    });
  }

  clearActiveSession(): void {
    this.http.delete<any>(`http://localhost:3000/api/sessions?projectId=${this.activeProject}&environment=${this.activeEnvironment}`)
      .subscribe({
        next: () => {
          this.hasActiveSession = false;
          this.scanStatusMessage = `🧹 Authenticated session cleared for ${this.activeProject} [${this.activeEnvironment}].`;
          this.showScanStatus = true;
        }
      });
  }

  isEngineOnline = false;
  latencyMs = 0;
  private socket?: any;

  ngOnInit(): void {
    this.initSocket();
    this.checkSessionStatus();
    this.updateActivePageTitle(this.router.url);

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.closeMobileMenu();
        this.updateActivePageTitle(event.urlAfterRedirects || event.url);
      });
  }

  private initSocket(): void {
    try {
      this.socket = io('http://localhost:3000', { reconnection: true, reconnectionDelay: 2000, timeout: 3000 });
      this.socket.on('connect', () => {
        this.isEngineOnline = true;
        this.latencyMs = 12;
      });
      this.socket.on('disconnect', () => {
        this.isEngineOnline = false;
        this.latencyMs = 0;
      });
      this.socket.on('connect_error', () => {
        this.isEngineOnline = false;
        this.latencyMs = 0;
      });
    } catch (e) {
      this.isEngineOnline = false;
    }
  }

  private updateActivePageTitle(url: string): void {
    if (url.includes('/dashboard')) this.activePageTitle = 'Overview Dashboard';
    else if (url.includes('/launch')) this.activePageTitle = 'Unified QA Launch Center';
    else if (url.includes('/execution')) this.activePageTitle = 'Real-Time Test Execution';
    else if (url.includes('/accessibility')) this.activePageTitle = 'WCAG Accessibility Audit Center';
    else if (url.includes('/projects')) this.activePageTitle = 'Projects Explorer';
    else if (url.includes('/features')) this.activePageTitle = 'BDD Feature Management';
    else if (url.includes('/reports')) this.activePageTitle = 'Advanced Analytics & Reports';
    else if (url.includes('/cicd')) this.activePageTitle = 'CI/CD Pipeline Hub';
    else this.activePageTitle = 'Krodux Dashboard';
  }
}
