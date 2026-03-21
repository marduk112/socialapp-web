import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  inject,
  signal,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UserService } from '../../core/services/user.service';
import { CurrentUserService } from '../../core/services/current-user.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-center">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>Sign in</mat-card-title>
          <mat-card-subtitle>Use your username or email address</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form #loginForm="ngForm">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Username or Email</mat-label>
              <input matInput
                     name="identifier"
                     [(ngModel)]="identifier"
                     required
                     autocomplete="username"
                     [disabled]="loading()"
                     placeholder="e.g. alice or alice@example.com" />
              <mat-error>This field is required</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput
                     type="password"
                     name="password"
                     [(ngModel)]="password"
                     required
                     autocomplete="current-password"
                     [disabled]="loading()"
                     (keydown.enter)="submit(loginForm)" />
              <mat-error>Password is required</mat-error>
            </mat-form-field>
          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <a mat-button routerLink="/create-profile">Create account</a>
          <button mat-flat-button color="primary"
                  [disabled]="loginForm.invalid || loading()"
                  (click)="submit(loginForm)">
            @if (loading()) {
              <mat-spinner diameter="18" />
            } @else {
              Sign in
            }
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .page-center { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
    .login-card { width: 100%; max-width: 420px; }
    .full-width { width: 100%; margin-top: 16px; }
    mat-spinner { display: inline-block; }
  `],
})
export class LoginComponent {
  private readonly userService = inject(UserService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly snackBar = inject(MatSnackBar);

  identifier = '';
  password = '';
  protected readonly loading = signal(false);

  submit(form: NgForm): void {
    form.form.markAllAsTouched();
    if (form.invalid) return;

    this.loading.set(true);
    this.userService.login({
      identifier: this.identifier.trim(),
      password: this.password,
    }).subscribe({
      next: user => {
        this.currentUser.setUser(user);
        this.ngZone.run(() => this.router.navigate(['/feed']));
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Invalid credentials. Check your username/email and password.', 'Dismiss', { duration: 4000 });
      },
    });
  }
}
