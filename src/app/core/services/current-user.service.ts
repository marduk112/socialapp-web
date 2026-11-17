import { Injectable, computed, signal } from '@angular/core';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly _user = signal<User | null>(this.loadFromStorage());
  readonly user = this._user.asReadonly();

  readonly token = computed(() => this._user()?.token ?? null);

  /** Stores the user; keeps the existing token when the given user carries none (e.g. profile updates). */
  setUser(user: User): void {
    const token = user.token ?? this._user()?.token;
    const stored: User = { ...user, token };
    this._user.set(stored);
    localStorage.setItem('socialapp_current_user', JSON.stringify(stored));
  }

  clearUser(): void {
    this._user.set(null);
    localStorage.removeItem('socialapp_current_user');
  }

  private loadFromStorage(): User | null {
    try {
      const stored = localStorage.getItem('socialapp_current_user');
      const user: User | null = stored ? JSON.parse(stored) : null;
      // Sessions stored before JWT auth have no token — treat as logged out.
      return user?.token ? user : null;
    } catch {
      return null;
    }
  }
}
