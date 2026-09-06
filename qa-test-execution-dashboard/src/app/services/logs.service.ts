import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';
import { BehaviorSubject } from 'rxjs';

export interface LogEntry {
  type: 'info' | 'error' | 'end';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class LogsService {

  private socket = io('http://localhost:3000');

  private logsSubject = new BehaviorSubject<LogEntry[]>([]);
  logs$ = this.logsSubject.asObservable();

  private logs: LogEntry[] = [];

  constructor() {
    this.socket.on('test-log', (data: LogEntry) => {
      this.logs.push(data);
      this.logsSubject.next([...this.logs]);
    });
  }

  clearLogs() {
    this.logs = [];
    this.logsSubject.next([]);
  }
}