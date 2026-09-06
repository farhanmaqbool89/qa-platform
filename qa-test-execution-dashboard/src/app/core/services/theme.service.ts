import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private isDarkThemeSubject = new BehaviorSubject<boolean>(false);
  public isDarkTheme$ = this.isDarkThemeSubject.asObservable();

  constructor() {
    // Check for saved theme preference; default to dark theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      this.setDarkTheme(false);
    } else {
      this.setDarkTheme(true);
    }
  }

  toggleTheme(): void {
    const currentTheme = this.isDarkThemeSubject.value;
    this.setDarkTheme(!currentTheme);
  }

  private setDarkTheme(isDark: boolean): void {
    this.isDarkThemeSubject.next(isDark);
    const body = document.body;
    if (isDark) {
      body.classList.add('dark-theme');
      body.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      body.classList.remove('dark-theme');
      body.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  get isDarkTheme(): boolean {
    return this.isDarkThemeSubject.value;
  }
}