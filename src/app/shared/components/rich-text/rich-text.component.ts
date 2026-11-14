import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostMention, tokenizeRichText } from '../../utils/rich-text';

/** Renders text with #hashtag / @mention links. Segments are rendered via interpolation, never innerHTML. */
@Component({
  selector: 'ui-rich-text',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (seg of segments(); track $index) {@switch (seg.type) {@case ('hashtag') {<a class="rt-link" data-testid="hashtag-link" [routerLink]="['/tags', seg.tag]">{{ seg.text }}</a>}@case ('mention') {<a class="rt-link" data-testid="mention-link" [routerLink]="['/users', seg.userId]">{{ seg.text }}</a>}@default {<span>{{ seg.text }}</span>}}}`,
  styles: [`.rt-link { color: #3f51b5; text-decoration: none; } .rt-link:hover { text-decoration: underline; }`]
})
export class RichTextComponent {
  text = input.required<string>();
  mentions = input<PostMention[] | null | undefined>([]);
  /** Server's normalised tags for this text; omit (null) to link every syntactically valid #tag. */
  hashtags = input<string[] | null | undefined>(null);

  protected readonly segments = computed(() =>
    tokenizeRichText(this.text(), this.mentions() ?? [], this.hashtags() ?? null));
}
