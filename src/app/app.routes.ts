import { Routes } from '@angular/router';
import { ProductCatalogComponent } from './product-catalog/product-catalog.component';
import { LoginComponent } from './login/login.component';
import { RegistrationComponent } from './registration/registration.component';
import { HeaderComponent } from './header/header.component';
import { LoadingScreenComponent } from './loading-screen/loading-screen.component';
import { AdminComponent } from './admin/admin.component';
import { GuestLinkComponent } from './guest-link/guest-link.component';
import { VerifyComponent } from './verify/verify.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { ImpressComponent } from './impress/impress.component';
import { ImageManagementComponent } from './image-management/image-management.component';
import { EmployeesComponent } from './employees/employees.component';
import { LabelManagementComponent } from './label-management/label-management.component';
import { CustomerOrdersComponent } from './customer-orders/customer-orders.component';
import { OrderOverviewComponent } from './order-overview/order-overview.component';
import { UserManagementComponent } from './user-management/user-management.component';

export const routes: Routes = [
    { path: '', component: LoadingScreenComponent },
    { path: 'login', component: LoginComponent },
    { path: 'products', component: ProductCatalogComponent },
    { path: 'registration', component: RegistrationComponent },
    { path: 'admin', component: AdminComponent},
    { path: 'guest-link', component: GuestLinkComponent},
    { path: 'verify', component: VerifyComponent},
    { path: 'privacy', component: PrivacyPolicyComponent},
    { path: 'impress', component: ImpressComponent},
    { path: 'image-management', component: ImageManagementComponent},
    { path: 'employees', component: EmployeesComponent },
    { path: 'label-management', component: LabelManagementComponent },
    { path: 'customer-orders', component: CustomerOrdersComponent },
    { path: 'order-overview', component: OrderOverviewComponent },
    { path: 'user-management', component: UserManagementComponent }
];
