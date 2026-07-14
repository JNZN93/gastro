import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-upload-loading',
  imports: [CommonModule],
  templateUrl: './upload-loading.component.html',
  styleUrl: './upload-loading.component.scss'
})
export class UploadLoadingComponent {
  @Input() progress = 0;
  @Input() statusMessage = 'Lädt...';
}
