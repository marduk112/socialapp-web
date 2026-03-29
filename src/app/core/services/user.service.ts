import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateUserRequest, LoginRequest, User } from '../models/user.model';
import { ApiClient } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiClient);

  getUser(id: string): Observable<User> {
    return this.api.get<User>(`/users/${id}`);
  }

  createUser(request: CreateUserRequest): Observable<User> {
    return this.api.post<User>('/users', request);
  }

  findByUsername(username: string): Observable<User> {
    return this.api.get<User>('/users', { username });
  }

  login(request: LoginRequest): Observable<User> {
    return this.api.post<User>('/users/login', request);
  }

  updateUser(id: string, request: Partial<User>): Observable<User> {
    return this.api.put<User>(`/users/${id}`, request);
  }

  uploadAvatar(userId: string, file: File): Observable<{ avatarUrl: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.api.post<{ avatarUrl: string }>(`/users/${userId}/avatar`, form);
  }
}
