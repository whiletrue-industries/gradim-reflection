import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Layout } from 'common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Layout],
  templateUrl: './app.html',
  styleUrl: './app.less'
})
export class App {
  protected readonly title = signal('sample-reflect');
  protected readonly uploadedImageUrl = signal<string | null>(null);

  protected onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        this.uploadedImageUrl.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }
}
