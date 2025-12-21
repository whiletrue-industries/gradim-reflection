import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { Layout } from 'common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, Layout],
  templateUrl: './app.html',
  styleUrl: './app.less'
})
export class App {
  protected readonly title = signal('main');
}
