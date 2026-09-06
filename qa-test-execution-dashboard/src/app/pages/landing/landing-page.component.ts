import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface FieldParticle {
  id: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
}

interface NetworkNode {
  id: string;
  label: string;
  sublabel?: string;
  ratioX: number;
  ratioY: number;
  baseX: number;
  baseY: number;
  currX: number;
  currY: number;
  radius: number;
  color: string;
  isCore?: boolean;
}

interface Connection {
  from: NetworkNode;
  to: NetworkNode;
  isCoreSpoke?: boolean;
}

interface SignalPulse {
  connection: Connection;
  progress: number;
  speed: number;
  color: string;
}

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss'
})
export class LandingPageComponent implements OnInit, OnDestroy {
  @ViewChild('heroCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('enterpriseCanvas', { static: true }) enterpriseCanvasRef!: ElementRef<HTMLCanvasElement>;

  private animFrameId: number | null = null;
  
  // Hero background particles
  private heroParticles: FieldParticle[] = [];
  private heroMouse = { x: -1000, y: -1000 };
  private heroCtx: CanvasRenderingContext2D | null = null;

  // Enterprise AI Quality Intelligence Network System (Left & Right Flanks)
  private entNodes: NetworkNode[] = [];
  private entConnections: Connection[] = [];
  private entPulses: SignalPulse[] = [];
  private entMouse = { x: -1000, y: -1000 };
  private entCtx: CanvasRenderingContext2D | null = null;
  private entAnimTime = 0;

  private resizeListener?: () => void;
  private heroMouseMoveListener?: (e: MouseEvent) => void;
  private entMouseMoveListener?: (e: MouseEvent) => void;

  readonly workflowSteps = [
    { step: '01', title: 'Requirements', desc: 'Ingest user stories & specifications', icon: 'description' },
    { step: '02', title: 'AI Analysis', desc: 'Synthesize scenarios & edge cases', icon: 'auto_awesome' },
    { step: '03', title: 'Test Design', desc: 'Generate structured BDD Gherkin', icon: 'design_services' },
    { step: '04', title: 'Automation', desc: 'Synthesize Playwright workflows', icon: 'code' },
    { step: '05', title: 'Execution', desc: 'Run parallel cross-browser suites', icon: 'play_circle' },
    { step: '06', title: 'Failure Intelligence', desc: 'Self-healing locators & diagnostics', icon: 'psychology' },
    { step: '07', title: 'Quality Analytics', desc: 'Track longitudinal coverage & flaky tests', icon: 'insights' },
    { step: '08', title: 'Release Confidence', desc: 'Validate WCAG & shipping readiness', icon: 'verified' }
  ];

  readonly capabilities = [
    { title: 'AI Test Generation', desc: 'Automatically transform user stories into exhaustive BDD test scenarios.', icon: 'auto_awesome', color: 'blue' },
    { title: 'Intelligent Automation', desc: 'Generate robust Playwright test scripts with page object patterns.', icon: 'smart_toy', color: 'indigo' },
    { title: 'Smart Failure Diagnostics', desc: 'AI-assisted root cause analysis pinpoints stack traces and DOM shifts.', icon: 'psychology', color: 'rose' },
    { title: 'Locator Self-Healing', desc: 'Detect broken element selectors and auto-heal test steps dynamically.', icon: 'build_circle', color: 'amber' },
    { title: 'Accessibility / WCAG Audits', desc: 'Evaluate web pages against WCAG 2.1/2.2 AA and ADA standards.', icon: 'accessibility_new', color: 'emerald' },
    { title: 'Release Analytics & RTM', desc: 'Connect requirements to test executions for 100% traceability.', icon: 'insights', color: 'cyan' }
  ];

  readonly personas = [
    { title: 'QA Engineers', desc: 'Accelerate test creation, eliminate flaky selectors, and automate execution.', icon: 'engineering' },
    { title: 'QA Leads', desc: 'Gain complete visibility into test coverage, WCAG compliance, and release health.', icon: 'analytics' },
    { title: 'Developers', desc: 'Understand test failure root causes instantly with actionable AI stack trace insights.', icon: 'code_off' },
    { title: 'Engineering Leadership', desc: 'Ship releases faster with continuous quality signals and confidence metrics.', icon: 'business' }
  ];

  constructor(public router: Router) {}

  ngOnInit(): void {
    this.initHeroCanvasAnimation();
    this.initEnterpriseCanvasAnimation();
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
    if (this.heroMouseMoveListener) {
      window.removeEventListener('mousemove', this.heroMouseMoveListener);
    }
    if (this.entMouseMoveListener) {
      window.removeEventListener('mousemove', this.entMouseMoveListener);
    }
  }

  scrollToSection(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ==========================================
   * HERO BACKGROUND PARTICLE FIELD
   * ========================================== */
  private initHeroCanvasAnimation(): void {
    const canvas = this.canvasRef.nativeElement;
    this.heroCtx = canvas.getContext('2d');
    if (!this.heroCtx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || 540;
      this.setupHeroParticles(canvas.width, canvas.height);
    };

    resize();
    this.resizeListener = resize;
    window.addEventListener('resize', this.resizeListener);

    if (!prefersReducedMotion) {
      this.heroMouseMoveListener = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        this.heroMouse.x = e.clientX - rect.left;
        this.heroMouse.y = e.clientY - rect.top;
      };
      window.addEventListener('mousemove', this.heroMouseMoveListener);
    }

    const animate = () => {
      this.entAnimTime += 16;
      if (!document.hidden) {
        if (this.heroCtx) this.drawHeroParticles(canvas.width, canvas.height, prefersReducedMotion);
        if (this.entCtx && this.enterpriseCanvasRef) {
          const entCanvas = this.enterpriseCanvasRef.nativeElement;
          this.drawEnterpriseNetwork(entCanvas.width, entCanvas.height);
        }
      }
      this.animFrameId = requestAnimationFrame(animate);
    };

    this.animFrameId = requestAnimationFrame(animate);
  }

  private setupHeroParticles(width: number, height: number): void {
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const totalCount = isMobile ? 25 : (isTablet ? 45 : 75);
    this.heroParticles = [];
    const colors = ['#38bdf8', '#60a5fa', '#818cf8', '#c084fc', '#34d399'];

    for (let i = 0; i < totalCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      this.heroParticles.push({
        id: i,
        x,
        y,
        baseX: x,
        baseY: y,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: isMobile ? 1.8 : (2.2 + Math.random() * 2.3),
        color: colors[i % colors.length],
        alpha: 0.20 + Math.random() * 0.25
      });
    }
  }

  private drawHeroParticles(width: number, height: number, prefersReducedMotion: boolean): void {
    if (!this.heroCtx) return;
    this.heroCtx.clearRect(0, 0, width, height);

    const isMobile = width < 768;
    const interactionRadius = 170;

    for (let i = 0; i < this.heroParticles.length; i++) {
      const p = this.heroParticles[i];

      if (!prefersReducedMotion) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        const dx = this.heroMouse.x - p.x;
        const dy = this.heroMouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < interactionRadius && dist > 0) {
          const angle = Math.atan2(dy, dx);
          const force = ((interactionRadius - dist) / interactionRadius) * 2.8;
          p.x -= Math.cos(angle) * force;
          p.y -= Math.sin(angle) * force;
        }
      }

      this.heroCtx.beginPath();
      this.heroCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.heroCtx.fillStyle = p.color;
      this.heroCtx.globalAlpha = p.alpha;
      this.heroCtx.fill();
      this.heroCtx.globalAlpha = 1.0;

      if (!isMobile) {
        for (let j = i + 1; j < this.heroParticles.length; j++) {
          const p2 = this.heroParticles[j];
          const ldx = p.x - p2.x;
          const ldy = p.y - p2.y;
          const ldist = Math.sqrt(ldx * ldx + ldy * ldy);

          if (ldist < 125) {
            this.heroCtx.beginPath();
            this.heroCtx.moveTo(p.x, p.y);
            this.heroCtx.lineTo(p2.x, p2.y);
            const lineAlpha = 0.12 * (1 - ldist / 125);
            this.heroCtx.strokeStyle = `rgba(56, 189, 248, ${lineAlpha})`;
            this.heroCtx.lineWidth = 0.8;
            this.heroCtx.stroke();
          }
        }
      }
    }
  }

  /* ==========================================================
   * ENTERPRISE AI QUALITY INTELLIGENCE NETWORK SYSTEM (LEFT & RIGHT FLANKS)
   * ========================================================== */
  private initEnterpriseCanvasAnimation(): void {
    const canvas = this.enterpriseCanvasRef.nativeElement;
    this.entCtx = canvas.getContext('2d');
    if (!this.entCtx) return;

    const resizeEnt = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || 450;
      this.setupEnterpriseNetwork(canvas.width, canvas.height);
    };

    resizeEnt();
    window.addEventListener('resize', resizeEnt);

    this.entMouseMoveListener = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.entMouse.x = e.clientX - rect.left;
      this.entMouse.y = e.clientY - rect.top;
    };
    window.addEventListener('mousemove', this.entMouseMoveListener);
  }

  private setupEnterpriseNetwork(width: number, height: number): void {
    const isMobile = width < 768;

    // Nodes positioned strictly on LEFT side (ratioX 0.08 - 0.22) and RIGHT side (ratioX 0.78 - 0.92)
    // Central area ratioX 0.25 to 0.75 remains 100% clean and clear of nodes!
    this.entNodes = [
      // Left Flank Nodes
      { id: 'req', label: 'Requirements Ingest', ratioX: isMobile ? 0.10 : 0.12, ratioY: 0.20, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#38bdf8' },
      { id: 'tests', label: 'Test Cases', ratioX: isMobile ? 0.18 : 0.22, ratioY: 0.42, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#60a5fa' },
      { id: 'auto', label: 'Automation Synthesis', ratioX: isMobile ? 0.10 : 0.10, ratioY: 0.64, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#818cf8' },
      { id: 'rel', label: 'Release Gate', ratioX: isMobile ? 0.18 : 0.22, ratioY: 0.84, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#10b981' },

      // Right Flank Nodes
      { id: 'exec', label: 'Execution Engine', ratioX: isMobile ? 0.90 : 0.88, ratioY: 0.20, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#a78bfa' },
      { id: 'ai', label: 'AI Diagnostics', ratioX: isMobile ? 0.82 : 0.78, ratioY: 0.42, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#f43f5e' },
      { id: 'diag', label: 'Locator Self-Healing', ratioX: isMobile ? 0.90 : 0.90, ratioY: 0.64, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#c084fc' },
      { id: 'score', label: 'Quality Score', ratioX: isMobile ? 0.82 : 0.78, ratioY: 0.84, baseX: 0, baseY: 0, currX: 0, currY: 0, radius: isMobile ? 5 : 8, color: '#34d399' }
    ];

    this.entNodes.forEach(node => {
      node.baseX = node.ratioX * width;
      node.baseY = node.ratioY * height;
      if (node.currX === 0) {
        node.currX = node.baseX;
        node.currY = node.baseY;
      }
    });

    const nodeMap = new Map(this.entNodes.map(n => [n.id, n]));

    this.entConnections = [
      // Left side pipeline
      { from: nodeMap.get('req')!, to: nodeMap.get('tests')! },
      { from: nodeMap.get('tests')!, to: nodeMap.get('auto')! },
      { from: nodeMap.get('auto')!, to: nodeMap.get('rel')! },

      // Right side pipeline
      { from: nodeMap.get('exec')!, to: nodeMap.get('ai')! },
      { from: nodeMap.get('ai')!, to: nodeMap.get('diag')! },
      { from: nodeMap.get('diag')!, to: nodeMap.get('score')! },

      // Outer margin transverse links (top & bottom edges)
      { from: nodeMap.get('req')!, to: nodeMap.get('exec')!, isCoreSpoke: true },
      { from: nodeMap.get('rel')!, to: nodeMap.get('score')!, isCoreSpoke: true }
    ];

    this.entPulses = this.entConnections.map((conn, idx) => ({
      connection: conn,
      progress: (idx * 0.22) % 1,
      speed: 0.0035 + Math.random() * 0.002,
      color: conn.isCoreSpoke ? '#38bdf8' : '#818cf8'
    }));
  }

  private drawEnterpriseNetwork(width: number, height: number): void {
    if (!this.entCtx) return;
    this.entCtx.clearRect(0, 0, width, height);

    const isMobile = width < 768;

    // 1. Mouse Repulsion Physics
    this.entNodes.forEach(node => {
      node.baseX = node.ratioX * width;
      node.baseY = node.ratioY * height;

      let targetX = node.baseX;
      let targetY = node.baseY;

      const dx = this.entMouse.x - node.baseX;
      const dy = this.entMouse.y - node.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const repelRadius = 140;

      if (dist < repelRadius && dist > 0) {
        const force = ((repelRadius - dist) / repelRadius) * 22;
        const angle = Math.atan2(dy, dx);
        targetX = node.baseX - Math.cos(angle) * force;
        targetY = node.baseY - Math.sin(angle) * force;
      }

      node.currX += (targetX - node.currX) * 0.08;
      node.currY += (targetY - node.currY) * 0.08;
    });

    // 2. Draw Connection Lines
    this.entConnections.forEach(conn => {
      this.entCtx!.beginPath();
      this.entCtx!.moveTo(conn.from.currX, conn.from.currY);
      this.entCtx!.lineTo(conn.to.currX, conn.to.currY);

      if (conn.isCoreSpoke) {
        this.entCtx!.strokeStyle = 'rgba(56, 189, 248, 0.12)';
        this.entCtx!.lineWidth = 1;
      } else {
        this.entCtx!.strokeStyle = 'rgba(148, 163, 184, 0.18)';
        this.entCtx!.lineWidth = 1.2;
      }
      this.entCtx!.stroke();
    });

    // 3. Draw Signal Pulses
    this.entPulses.forEach(pulse => {
      pulse.progress += pulse.speed;
      if (pulse.progress > 1) pulse.progress = 0;

      const px = pulse.connection.from.currX + (pulse.connection.to.currX - pulse.connection.from.currX) * pulse.progress;
      const py = pulse.connection.from.currY + (pulse.connection.to.currY - pulse.connection.from.currY) * pulse.progress;

      this.entCtx!.beginPath();
      this.entCtx!.arc(px, py, 3, 0, Math.PI * 2);
      this.entCtx!.fillStyle = pulse.color;
      this.entCtx!.shadowColor = pulse.color;
      this.entCtx!.shadowBlur = 8;
      this.entCtx!.fill();
      this.entCtx!.shadowBlur = 0;
    });

    // 4. Draw Nodes & Labels on Left & Right Flanks
    this.entNodes.forEach(node => {
      this.entCtx!.beginPath();
      this.entCtx!.arc(node.currX, node.currY, node.radius, 0, Math.PI * 2);
      this.entCtx!.fillStyle = node.color;
      this.entCtx!.shadowColor = node.color;
      this.entCtx!.shadowBlur = 10;
      this.entCtx!.fill();
      this.entCtx!.shadowBlur = 0;

      if (!isMobile) {
        this.entCtx!.font = '600 11px Inter, sans-serif';
        this.entCtx!.fillStyle = 'rgba(255, 255, 255, 0.9)';
        // Left side text aligns right, right side text aligns left
        this.entCtx!.textAlign = node.currX < width * 0.5 ? 'right' : 'left';

        const offsetX = node.currX < width * 0.5 ? -12 : 12;
        this.entCtx!.fillText(node.label, node.currX + offsetX, node.currY + 4);
      }
    });
  }
}
