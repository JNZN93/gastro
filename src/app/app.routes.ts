import { Routes } from '@angular/router';
import { ArtikelCardComponent } from './artikel-card/artikel-card.component';
import { LoginComponent } from './login/login.component';
import { RegistrationComponent } from './registration/registration.component';
import { HeaderComponent } from './header/header.component';
import { LoadingScreenComponent } from './loading-screen/loading-screen.component';
import { AdminComponent } from './admin/admin.component';

export const routes: Routes = [
    { path: '', component: LoadingScreenComponent },
    { path: 'login', component: LoginComponent },
    { path: 'products', component: ArtikelCardComponent },
    { path: 'registration', component: RegistrationComponent },
    { path: 'admin', component: AdminComponent}
];
