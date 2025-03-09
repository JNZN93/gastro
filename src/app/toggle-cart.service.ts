import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ToggleCartService {

  private isVisible = new BehaviorSubject<boolean>(false); // Startwert: false
  isVisible$ = this.isVisible.asObservable(); // Observable für Komponenten

  constructor() { }

  toggle() {
    this.isVisible.next(!this.isVisible.value); // Zustand umschalten
  }
}
