import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { countChars } from '../../utils/rich-text';
import { POST_MAX_CHARS } from '../../utils/post-limit';

/** Live "123/500" counter (Unicode code points). Host exposes data-state = ok | warn | error. */
@Component({
  selector: 'ui-char-counter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'state()', '[class]': '"counter " + state()' },
  template: `{{ count() }}/{{ max }}`,
  styles: [`
    :host { display: block; text-align: right; font-size: 12px; color: #666; }
    :host(.warn) { color: #e65100; }
    :host(.error) { color: #d32f2f; font-weight: 600; }
  `]
})
export class CharCounterComponent {
  text = input.required<string>();
  protected readonly max = POST_MAX_CHARS;
  protected readonly count = computed(() => countChars(this.text()));
  protected readonly state = computed(() =>
    this.count() > POST_MAX_CHARS ? 'error' : this.count() > 450 ? 'warn' : 'ok');
}
