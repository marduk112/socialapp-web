import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

type QueryParams = { [param: string]: string | number | boolean };

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`, params ? { params } : {});
  }

  post<T>(path: string, body: unknown, params?: QueryParams): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body, params ? { params } : {});
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.base}${path}`, body);
  }

  delete<T>(path: string, options?: { params?: QueryParams; body?: unknown }): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`, options ?? {});
  }
}
