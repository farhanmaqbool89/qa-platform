import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-public-testing-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './public-testing-demo.component.html',
  styleUrl: './public-testing-demo.component.scss'
})
export class PublicTestingDemoComponent {
  requirementText = 'User story: As a customer, I want to reset my account password using a secure email magic link so that I can regain access if I forget my login credentials.';
  isGenerating = false;
  aiResult: any = null;
  errorMessage = '';

  constructor(private http: HttpClient) {}

  generatePublicScenarios(): void {
    if (!this.requirementText) return;
    this.isGenerating = true;
    this.aiResult = null;
    this.errorMessage = '';

    this.http.post<any>('http://localhost:3000/api/public/ai-demo', { requirementText: this.requirementText }).subscribe({
      next: (res) => {
        this.isGenerating = false;
        if (res.success) {
          this.aiResult = res;
        } else {
          this.errorMessage = res.message || 'AI scenario generation failed.';
        }
      },
      error: (err) => {
        this.isGenerating = false;
        this.errorMessage = err.error?.message || 'Failed to generate public AI scenarios.';
      }
    });
  }
}
