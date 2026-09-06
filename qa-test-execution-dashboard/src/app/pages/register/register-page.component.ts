import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PlatformAuthService } from '../../core/services/platform-auth.service';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './register-page.component.html',
  styleUrls: ['../login/login-page.component.scss']
})
export class RegisterPageComponent {
  name = '';
  email = '';
  password = '';
  organizationName = '';
  loading = false;
  errorMessage = '';

  constructor(private authService: PlatformAuthService, private router: Router) {}

  onSubmit(): void {
    if (!this.email || !this.password) {
      this.errorMessage = 'Email address and password are required.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService
      .register({
        email: this.email,
        password: this.password,
        name: this.name,
        organizationName: this.organizationName
      })
      .subscribe({
        next: (res) => {
          this.loading = false;
          if (res.success) {
            this.router.navigate(['/dashboard']);
          } else {
            this.errorMessage = res.message || 'Registration failed.';
          }
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err?.error?.message || 'Registration failed.';
        }
      });
  }
}
