import { Routes } from '@angular/router';
import { ArtikelCardComponent } from './artikel-card/artikel-card.component';
import { LoginComponent } from './login/login.component';
import { RegistrationComponent } from './registration/registration.component';

export const routes: Routes = [
    { path: '', redirectTo: '/login', pathMatch: 'full' }, // Startseite auf Login
    { path: 'login', component: LoginComponent },
    { path: 'products', component: ArtikelCardComponent },
    { path: 'registration', component: RegistrationComponent }
];
