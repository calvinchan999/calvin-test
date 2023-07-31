//import standard library
import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../../services/auth.service';

//import custom library
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private router      : Router,
		        private generalUtil : GeneralUtil,
				private authSrv: AuthService) {
	}

	canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
		if (this.generalUtil.isLoggedIn()) {
			if (this.generalUtil.arcsApp) {
				return true
			} else if (this.authSrv.hasAccessToPath(route.routeConfig.path)) {
				return true;
			}
		} 
		// this.router.navigate(['login'], { queryParams: { returnUrl: state.url }, skipLocationChange: true });
        return false;
	}
}