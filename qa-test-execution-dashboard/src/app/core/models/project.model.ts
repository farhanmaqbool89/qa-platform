export type BrowserOption = 'Chrome' | 'Firefox' | 'Edge';

export interface Project {
  id: number;
  name: string;
  baseUrl: string;
  browser: BrowserOption;
  username: string;
  password: string;
}
