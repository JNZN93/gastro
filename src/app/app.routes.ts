import { Routes } from '@angular/router';
// import { ProductCatalogComponent } from './product-catalog/product-catalog.component';
import { LoginComponent } from './login/login.component';
import { RegistrationComponent } from './registration/registration.component';
import { HeaderComponent } from './header/header.component';
import { LoadingScreenComponent } from './loading-screen/loading-screen.component';
import { AdminComponent } from './admin/admin.component';
import { GuestLinkComponent } from './guest-link/guest-link.component';
import { VerifyComponent } from './verify/verify.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { ImpressComponent } from './impress/impress.component';
import { ProductManagementComponent } from './product-management/product-management.component';
import { EmployeesComponent } from './employees/employees.component';
import { LabelManagementComponent } from './label-management/label-management.component';
import { CustomerOrdersComponent } from './customer-orders/customer-orders.component';
import { OrderOverviewComponent } from './order-overview/order-overview.component';
import { UserManagementComponent } from './user-management/user-management.component';
import { CategoryDetailComponent } from './category-detail/category-detail.component';
import { RoutePlanningComponent } from './route-planning/route-planning.component';
import { ReportsComponent } from './reports/reports.component';
import { AuthGuard } from './auth.guard';
import { AdminAuthGuard } from './admin-auth.guard';

export const routes: Routes = [
    { 
        path: '', 
        loadComponent: () => import('./product-catalog/product-catalog.component').then(m => m.ProductCatalogComponent)
    },
    { path: 'loading', component: LoadingScreenComponent },
    { path: 'login', component: LoginComponent },
    { 
        path: 'products', 
        loadComponent: () => import('./product-catalog/product-catalog.component').then(m => m.ProductCatalogComponent)
    },
    { path: 'registration', component: RegistrationComponent },
    { path: 'admin', component: AdminComponent, canActivate: [AuthGuard]},
    { path: 'guest-link', component: GuestLinkComponent, canActivate: [AdminAuthGuard]},
    { path: 'verify', component: VerifyComponent},
    { path: 'privacy', component: PrivacyPolicyComponent},
    { path: 'impress', component: ImpressComponent},
    { path: 'product-management', component: ProductManagementComponent, canActivate: [AuthGuard] },
    { path: 'employees', component: EmployeesComponent, canActivate: [AuthGuard] },
    { path: 'label-management', component: LabelManagementComponent, canActivate: [AuthGuard] },
    { path: 'customer-orders', component: CustomerOrdersComponent, canActivate: [AdminAuthGuard] },
    { path: 'order-overview', component: OrderOverviewComponent, canActivate: [AuthGuard] },
    { path: 'user-management', component: UserManagementComponent },
    { path: 'route-planning', component: RoutePlanningComponent, canActivate: [AuthGuard] },
    { path: 'reports', component: ReportsComponent, canActivate: [AuthGuard] },
    { path: 'category/:categoryName', component: CategoryDetailComponent },
    // Neue Route für kundenspezifische Bestellungen (öffentlich zugänglich)
    { 
        path: 'customer-order/:customerId', 
        loadComponent: () => import('./customer-order-public/customer-order-public.component').then(m => m.CustomerOrderPublicComponent)
    }
];
