import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { UserService } from '../../core/services/user.service';
import { CurrentUserService } from '../../core/services/current-user.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDividerModule
],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-wrapper">
      <mat-card class="settings-card">
        <mat-card-header>
          <mat-card-title>Settings</mat-card-title>
        </mat-card-header>

        <mat-card-content>

          <!-- Avatar section -->
          <section class="section">
            <h3 class="section-title">Avatar</h3>

            <div class="avatar-row">
              @if (avatarPreviewUrl()) {
                <img class="avatar-preview" [src]="avatarPreviewUrl()!"
                     alt="Avatar preview" (error)="onPreviewError($event)" />
              } @else {
                <div class="avatar-placeholder"><span>No avatar</span></div>
              }

              <div class="avatar-controls">
                <div class="upload-row">
                  <button mat-stroked-button [disabled]="uploading()"
                          (click)="fileInput.click()">
                    <mat-icon>upload_file</mat-icon>
                    {{ uploading() ? 'Uploading…' : 'Upload file' }}
                  </button>
                  <span class="upload-hint">JPG, PNG, GIF, WebP · max 2 MB</span>
                  <input #fileInput type="file"
                         accept="image/jpeg,image/png,image/gif,image/webp"
                         style="display:none"
                         (change)="onFileSelected($event)" />
                </div>
              </div>
            </div>
          </section>

          <mat-divider />

          <!-- Profile section -->
          <section class="section">
            <h3 class="section-title">Profile</h3>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Bio</mat-label>
              <textarea matInput [(ngModel)]="editBio" rows="3" maxlength="500"
                        placeholder="Tell something about yourself…"></textarea>
              <mat-hint align="end">{{ editBio.length }}/500</mat-hint>
            </mat-form-field>
          </section>

        </mat-card-content>

        <mat-card-actions align="end">
          <button mat-flat-button color="primary"
                  [disabled]="saving() || uploading()"
                  (click)="save()">
            {{ saving() ? 'Saving…' : 'Save changes' }}
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .settings-wrapper { max-width: 540px; margin: 0 auto; padding: 24px 16px; }
    .section { padding: 16px 0; }
    .section-title { margin: 0 0 14px; font-size: 13px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: .5px; }
    .avatar-row { display: flex; align-items: flex-start; gap: 20px; }
    .avatar-preview {
      width: 80px; height: 80px; border-radius: 50%;
      object-fit: cover; border: 2px solid #ddd; flex-shrink: 0; margin-top: 4px;
    }
    .avatar-placeholder {
      width: 80px; height: 80px; border-radius: 50%;
      background: #f5f5f5; border: 2px dashed #ccc; flex-shrink: 0; margin-top: 4px;
      display: flex; align-items: center; justify-content: center;
    }
    .avatar-placeholder span { font-size: 11px; color: #aaa; }
    .avatar-controls { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .upload-row { display: flex; align-items: center; gap: 12px; }
    .upload-hint { font-size: 12px; color: #999; }
    .full-width { width: 100%; }
    mat-divider { margin: 0; }
  `]
})
export class SettingsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly avatarPreviewUrl = signal('');

  editAvatarUrl = '';
  editBio = '';

  ngOnInit(): void {
    const user = this.currentUser.user();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }
    this.editAvatarUrl = user.avatarUrl ?? '';
    this.editBio = user.bio ?? '';
    this.avatarPreviewUrl.set(this.editAvatarUrl);
  }

  protected onPreviewError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.snackBar.open('File too large — max 2 MB', 'Dismiss', { duration: 3000 });
      return;
    }

    const user = this.currentUser.user();
    if (!user) return;

    this.uploading.set(true);
    this.userService.uploadAvatar(user.id, file).subscribe({
      next: ({ avatarUrl }) => {
        this.editAvatarUrl = avatarUrl;
        this.avatarPreviewUrl.set(avatarUrl);
        this.currentUser.setUser({ ...user, avatarUrl });
        this.uploading.set(false);
        this.snackBar.open('Avatar updated', undefined, { duration: 2000 });
      },
      error: (err) => {
        this.uploading.set(false);
        const msg = err.status === 413 ? 'File too large'
                  : err.status === 415 ? 'Unsupported file type'
                  : 'Upload failed';
        this.snackBar.open(msg, 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected save(): void {
    const user = this.currentUser.user();
    if (!user) return;

    this.saving.set(true);
    this.userService.updateUser(user.id, {
      username: user.username,
      bio: this.editBio.trim() || undefined,
      avatarUrl: this.editAvatarUrl.trim() || undefined,
    }).subscribe({
      next: updated => {
        this.currentUser.setUser(updated);
        this.editAvatarUrl = updated.avatarUrl ?? '';
        this.editBio = updated.bio ?? '';
        this.avatarPreviewUrl.set(this.editAvatarUrl);
        this.saving.set(false);
        this.snackBar.open('Settings saved', undefined, { duration: 2000 });
      },
      error: () => {
        this.saving.set(false);
        this.snackBar.open('Failed to save', 'Dismiss', { duration: 3000 });
      }
    });
  }
}
