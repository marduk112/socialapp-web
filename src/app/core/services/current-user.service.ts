import { Injectable, signal } from '@angular/core';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly _user = signal<User | null>(this.loadFromStorage());
  readonly user = this._user.asReadonly();

  setUser(user: User): void {
    this._user.set(user);
    localStorage.setItem('socialapp_current_user', JSON.stringify(user));
  }

  clearUser(): void {
    this._user.set(null);
    localStorage.removeItem('socialapp_current_user');
  }

  private loadFromStorage(): User | null {
    try {
      const stored = localStorage.getItem('socialapp_current_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }
}
