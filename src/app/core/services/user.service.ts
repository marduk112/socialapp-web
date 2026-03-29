import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateUserRequest, LoginRequest, User } from '../models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  getUser(id: string): Observable<User> {
    return this.http.get<User>(`${this.base}/${id}`);
  }

  createUser(request: CreateUserRequest): Observable<User> {
    return this.http.post<User>(this.base, request);
  }

  findByUsername(username: string): Observable<User> {
    return this.http.get<User>(this.base, { params: { username } });
  }

  login(request: LoginRequest): Observable<User> {
    return this.http.post<User>(`${this.base}/login`, request);
  }

  updateUser(id: string, request: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.base}/${id}`, request);
  }

  uploadAvatar(userId: string, file: File): Observable<{ avatarUrl: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ avatarUrl: string }>(`${this.base}/${userId}/avatar`, form);
  }
}
