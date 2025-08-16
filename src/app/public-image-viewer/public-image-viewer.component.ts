import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-public-image-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="viewer-container">
      <div class="viewer-header">
        <button class="back-btn" (click)="goBack()">Zurück</button>
        <div class="title">{{ title || 'Bildansicht' }}</div>
      </div>
      <div class="viewer-content">
        <img *ngIf="imageUrl" [src]="imageUrl" [alt]="title || 'Produktbild'" />
        <div *ngIf="!imageUrl" class="no-image">Kein Bild verfügbar</div>
      </div>
    </div>
  `,
  styles: [`
    .viewer-container { width: 100%; height: 100vh; display: flex; flex-direction: column; background: #111; color: #fff; }
    .viewer-header { display: flex; align-items: center; padding: 12px; background: #000; }
    .back-btn { background: #fff; color: #000; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
    .title { margin-left: 12px; font-weight: 600; }
    .viewer-content { flex: 1; display: flex; align-items: center; justify-content: center; }
    img { max-width: 100%; max-height: 90vh; object-fit: contain; }
    .no-image { color: #bbb; }
  `]
})
export class PublicImageViewerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  token = '';
  articleNumber = '';
  imageUrl: string | null = null;
  title: string | null = null;

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.token = params['token'];
      this.articleNumber = params['articleNumber'];
    });

    const state = history.state || {};
    this.imageUrl = state.imageUrl || null;
    this.title = state.title || null;
  }

  goBack() {
    this.router.navigate([`/customer-order/${this.token}`]);
  }
}


