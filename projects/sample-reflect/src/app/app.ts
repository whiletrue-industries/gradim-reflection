import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Layout, Canvas } from 'common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Layout, Canvas],
  templateUrl: './app.html',
  styleUrl: './app.less'
})
export class App {
  protected readonly title = signal('sample-reflect');
}
