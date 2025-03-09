import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GlobalService {
  public warenkorb: any[] = [];
  public orderData:any = {};

  constructor() { }
}
