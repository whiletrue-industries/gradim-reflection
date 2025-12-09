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
}
