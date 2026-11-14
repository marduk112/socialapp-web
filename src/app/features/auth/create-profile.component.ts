import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
  selector: 'app-create-profile',
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
      <mat-card class="profile-card">
        <mat-card-header>
          <mat-card-title>Create your profile</mat-card-title>
          <mat-card-subtitle>Fill in your details to get started</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form #createForm="ngForm">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Username</mat-label>
              <input matInput
                     name="username"
                     [(ngModel)]="username"
                     required
                     minlength="3"
                     maxlength="30"
                     placeholder="e.g. alice"
                     [disabled]="loading()" />
              <mat-error>Username must be 3–30 characters</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <input matInput
                     type="email"
                     name="email"
                     [(ngModel)]="email"
                     required
                     email
                     placeholder="e.g. alice@example.com"
                     [disabled]="loading()" />
              <mat-error>Valid email address is required</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput
                     type="password"
                     name="password"
                     [(ngModel)]="password"
                     required
                     minlength="8"
                     maxlength="72"
                     [disabled]="loading()" />
              <mat-error>Password must be 8–72 characters</mat-error>
            </mat-form-field>
          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <a mat-button routerLink="/login">Sign in</a>
          <button mat-flat-button color="primary"
                  [disabled]="createForm.invalid || loading()"
                  (click)="submit(createForm)">
            @if (loading()) {
              <mat-spinner diameter="18" />
            } @else {
              Create Profile
            }
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .page-center { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
    .profile-card { width: 100%; max-width: 420px; }
    .full-width { width: 100%; margin-top: 16px; }
    mat-spinner { display: inline-block; }
  `],
})
export class CreateProfileComponent {
  private readonly userService = inject(UserService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly snackBar = inject(MatSnackBar);

  username = '';
  email = '';
  password = '';
  protected readonly loading = signal(false);

  submit(form: NgForm): void {
    form.form.markAllAsTouched();
    if (form.invalid) return;

    this.loading.set(true);
    this.userService.createUser({
      username: this.username.trim(),
      email: this.email.trim(),
      password: this.password,
    }).subscribe({
      next: user => {
        this.currentUser.setUser(user);
        this.ngZone.run(() => this.router.navigate(['/feed']));
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // 400 = validation failed (server explains which field), 409 = username/email taken
        const message =
          err.status === 400 && err.error?.error
            ? String(err.error.error)
            : err.status === 409
              ? 'Username or email is already taken.'
              : 'Failed to create profile — please try again.';
        this.snackBar.open(message, 'Dismiss', { duration: 5000 });
      },
    });
  }
}
