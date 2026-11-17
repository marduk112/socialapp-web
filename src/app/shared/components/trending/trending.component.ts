import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { TrendingHashtag, TrendsService } from '../../../core/services/trends.service';

/** "Trending": hashtags used in the last 24 hours. Hidden while empty or on error. */
@Component({
  selector: 'ui-trending',
  standalone: true,
  imports: [RouterLink, MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (trends().length > 0) {
      <mat-card class="trending-card" data-testid="trending">
        <mat-card-header>
          <mat-card-title>Trending</mat-card-title>
          <mat-card-subtitle>Last 24 hours</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @for (t of trends(); track t.tag) {
            <a class="trend" data-testid="trend" [routerLink]="['/tags', t.tag]">
              <span class="trend-tag">#{{ t.tag }}</span>
              <span class="trend-count">{{ t.posts === 1 ? '1 post' : t.posts + ' posts' }}</span>
            </a>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: [`
    .trending-card { margin-bottom: 16px; }
    .trend { display: flex; flex-direction: column; padding: 8px 0; color: inherit; text-decoration: none; }
    .trend:hover .trend-tag { text-decoration: underline; }
    .trend-tag { font-weight: 500; overflow-wrap: anywhere; }
    .trend-count { font-size: 12px; color: #777; }
  `]
})
export class TrendingComponent implements OnInit {
  private readonly trendsService = inject(TrendsService);

  protected readonly trends = signal<TrendingHashtag[]>([]);

  ngOnInit(): void {
    // Best effort: the card simply stays hidden when the request fails.
    this.trendsService.getTrendingHashtags().subscribe({
      next: list => this.trends.set(list),
      error: () => this.trends.set([]),
    });
  }
}
