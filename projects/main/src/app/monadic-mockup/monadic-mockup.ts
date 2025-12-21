import { Component, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Layout } from 'common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-monadic-mockup',
  imports: [Layout],
  templateUrl: './monadic-mockup.html',
  styleUrl: './monadic-mockup.less',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonadicMockup {
  private readonly sanitizer = inject(DomSanitizer);
  
  protected readonly isExpanded = signal(false);
  protected readonly baseUrl = 'https://lab.jona.im/monadic-embedded/#240222';

  protected readonly iframeSrc = computed(() => {
    const url = this.isExpanded() ? `${this.baseUrl}/expanded` : this.baseUrl;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected toggleView(): void {
    this.isExpanded.update(value => !value);
  }
}
