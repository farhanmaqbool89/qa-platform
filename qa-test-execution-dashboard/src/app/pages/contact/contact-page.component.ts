import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule
  ],
  templateUrl: './contact-page.component.html',
  styleUrl: './contact-page.component.scss'
})
export class ContactPageComponent implements OnInit {
  contactForm: FormGroup;
  copiedEmail = false;
  emailSentNotification = false;
  readonly teamEmail = 'kroduxteam@gmail.com';

  inquiryCategories = [
    { value: 'General Inquiry', label: 'General Inquiry / Questions' },
    { value: 'Enterprise & Demo', label: 'Enterprise Platform Demo & Sales' },
    { value: 'Technical Support', label: 'Technical Support & Integration' },
    { value: 'Feature Request', label: 'Feature Request & Feedback' },
    { value: 'Security & Compliance', label: 'Security & Compliance (WCAG/SOC2)' }
  ];

  faqs = [
    {
      question: 'How quickly will the KRODUX team respond to my email?',
      answer: 'Our global engineering and support team reviews all inquiries promptly. You can expect a response within 12 to 24 business hours.'
    },
    {
      question: 'Can I request a tailored demo for our QA / DevOps team?',
      answer: 'Yes! Select "Enterprise Platform Demo" in the inquiry form and specify your test framework requirements. We will coordinate a live technical walkthrough.'
    },
    {
      question: 'How do I report an issue or request an integration?',
      answer: 'Send us details regarding your CI/CD pipeline, Playwright/Cucumber test suites, or custom webhooks, and our engineers will assist you.'
    }
  ];

  constructor(private fb: FormBuilder) {
    this.contactForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      senderEmail: ['', [Validators.required, Validators.email]],
      category: ['General Inquiry', Validators.required],
      subject: ['', [Validators.required, Validators.minLength(4)]],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  copyEmail(): void {
    navigator.clipboard.writeText(this.teamEmail).then(() => {
      this.copiedEmail = true;
      setTimeout(() => {
        this.copiedEmail = false;
      }, 3000);
    });
  }

  sendEmail(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const { fullName, senderEmail, category, subject, message } = this.contactForm.value;

    const emailSubject = encodeURIComponent(`[${category}] ${subject}`);
    const emailBody = encodeURIComponent(
      `Hi KRODUX Team,\n\n` +
      `Name: ${fullName}\n` +
      `Email: ${senderEmail}\n` +
      `Category: ${category}\n\n` +
      `Message:\n${message}\n\n` +
      `---\nSent via KRODUX Platform Contact Portal`
    );

    const mailtoUrl = `mailto:${this.teamEmail}?subject=${emailSubject}&body=${emailBody}`;

    // Open user's default email client
    window.location.href = mailtoUrl;

    this.emailSentNotification = true;
    setTimeout(() => {
      this.emailSentNotification = false;
    }, 6000);
  }
}
