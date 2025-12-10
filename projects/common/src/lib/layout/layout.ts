import { Component, ChangeDetectionStrategy, inject, PLATFORM_ID, signal, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'lib-layout',
  templateUrl: './layout.html',
  styleUrl: './layout.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-iframe]': 'isInIframe()',
  }
})
export class Layout {
  private platformId = inject(PLATFORM_ID);

  // Signal to track if the app is running inside an iframe
  protected isInIframe = signal(false);

  constructor() {
    // Only run in browser environment
    if (isPlatformBrowser(this.platformId)) {
      // Check if we're in an iframe
      this.isInIframe.set(window !== window.parent);

      // Set up parent/child communication protocol
      this.setupIframeCommunication();
    }
  }

  private setupIframeCommunication(): void {
    if (!this.isInIframe()) {
      return;
    }

    // Listen for messages from parent
    window.addEventListener('message', (event) => {
      this.handleParentMessage(event);
    });

    // Notify parent that the app is ready
    this.postMessageToParent({
      type: 'APP_READY',
      timestamp: Date.now()
    });
  }

  private handleParentMessage(event: MessageEvent): void {
    // Validate origin for security
    // TODO: Configure allowed origins from environment
    // if (!this.isAllowedOrigin(event.origin)) {
    //   return;
    // }

    const { type, data } = event.data;

    switch (type) {
      case 'REQUEST_DATA':
        this.handleDataRequest();
        break;
      case 'CONFIG_UPDATE':
        this.handleConfigUpdate(data);
        break;
      default:
        console.warn('Unknown message type from parent:', type);
    }
  }

  private handleDataRequest(): void {
    // Send current app data to parent
    this.postMessageToParent({
      type: 'DATA_RESPONSE',
      data: {
        // This would be populated by the actual app
        // Example structure from architecture doc:
        title: '',
        description: '',
        link: '',
        imageUrl: '',
        imageBlob: null,
        metadata: {
          itemsUsed: [],
          tags: [],
          userId: '',
          username: '',
          email: ''
        }
      }
    });
  }

  private handleConfigUpdate(config: unknown): void {
    // Handle configuration updates from parent
    console.log('Config update received:', config);
  }

  protected postMessageToParent(message: unknown): void {
    if (this.isInIframe() && isPlatformBrowser(this.platformId)) {
      window.parent.postMessage(message, '*');
      // TODO: Replace '*' with specific origin from environment
    }
  }

  // Helper method for child apps to send data to parent
  public sendDataToParent(data: {
    title?: string;
    description?: string;
    link?: string;
    imageUrl?: string;
    imageBlob?: Blob | null;
    metadata?: {
      itemsUsed?: string[];
      tags?: string[];
      userId?: string;
      username?: string;
      email?: string;
    };
  }): void {
    this.postMessageToParent({
      type: 'DATA_UPDATE',
      data
    });
  }
}
