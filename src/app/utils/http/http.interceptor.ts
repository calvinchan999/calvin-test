//import standard library
// import { pipe } from 'rxjs/Rx';
import { mergeMap, catchError, map, retryWhen, flatMap, take, switchMap, filter } from 'rxjs/operators';
import { of, Observable, throwError, config, from, BehaviorSubject } from 'rxjs';
import { Injectable } from '@angular/core';
import { Router, ActivatedRoute } from "@angular/router";
import { HttpClient, HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';

//import custom service provider
import { AuthService } from '../../services/auth.service';

//import custom library
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { UiService } from 'src/app/services/ui.service';
import { RvHttpService } from 'src/app/services/rv-http.service';

@Injectable()
export class CustomHttpInterceptor implements HttpInterceptor {
    //PENDING : REFRESH TOKEN LOGIC , WHEN MSG_CODE = E00012
    EXCLUDE_URL_ARRAY: any[];

    IMPORT_FILE_URL_ARRAY: any[];

	constructor(private router      : Router,
                private route       : ActivatedRoute,
                private http        : HttpClient,
                private generalUtil : GeneralUtil,
                private uiSrv : UiService,
                private authService : AuthService) {
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<Object>> {
        let authReq = req;
        const token = this.generalUtil.getUserAccessToken();
        if (token != null ) {
          authReq = this.addTokenHeader(req, token);
        }
        return next.handle(authReq).pipe(catchError(error => {
          console.log(error)
          console.trace()
          if (error instanceof HttpErrorResponse && error.status == 0 && this.authService.username) {
            this.uiSrv.navigateToErrorPage('offline')
            // if(!this.router.url?.startsWith('/error')){
            //   this.router.navigate(['/error'],{queryParams:{type : 'offline' , prevRoute : this.router.url}})
            // }
            return next.handle(req);
          }  else if (error instanceof HttpErrorResponse && error.status == 401 && !authReq.url.endsWith('/api/Auth/refreshtoken') && !authReq.url.startsWith('assets/')) {
            return this.handle401Error(authReq, next);
          }          
          this.uiSrv.loadingTickets = []
          if(authReq.url.endsWith('/api/Auth/refreshtoken')){
            this.forceLogout()
            // this.isRefreshing = false;
            // this.uiSrv.showNotificationBar('Session Timeout , Please Login Again', 'error')
            // this.authService.logout()
            // location.reload()
            return of(error)
          }else{
            console.log(`HTTP ERROR [${error.status }] ${error.message? ' : ' + error.message : ''  }`)
            // this.uiSrv.showNotificationBar(`HTTP ERROR [${error.status }] ${error.message? ' : ' + error.message : ''  }` , 'error' )
            return throwError(error)
          }       
        }));
    }

    
    private isRefreshing = false
    private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);
    private handle401Error(request: HttpRequest<any>, next: HttpHandler) {
        if (!this.isRefreshing) {
            this.isRefreshing = true;
            this.refreshTokenSubject.next(null);
            const token = this.generalUtil.getUserRefreshToken()
            if (token)
                return this.generalUtil.refreshToken().pipe(
                    switchMap((refreshResp: any) => {
                        this.generalUtil.setRefreshToken(refreshResp)
                        this.isRefreshing = false;
                        this.refreshTokenSubject.next(this.generalUtil.getUserAccessToken());
                        return next.handle(this.addTokenHeader(request,this.generalUtil.getUserAccessToken()));
                    }),
                    catchError((err) => {
                        this.forceLogout()
                        return of(err); 
                    })
                );
        }
        return this.refreshTokenSubject.pipe(
            filter(token => token !== null),
            take(1),
            switchMap((token) => next.handle(this.addTokenHeader(request, token)))
        );
    }

    async forceLogout(){
      this.uiSrv.loadingTickets = []
      await this.uiSrv.showMsgDialog(this.uiSrv.translate('Session Timeout , Please Login Again'))
      this.authService.logout()
      location.reload()
    }

    private addTokenHeader(request: HttpRequest<any>, token: string = this.generalUtil.getUserAccessToken()) {
        var req = request.clone({headers: request.headers.set( 'localeId' ,  this.uiSrv.selectedLangOption?.['value'])})
        if(token && token != ''){
          req = req.clone({headers: req.headers.set( 'Authorization' ,  ('Bearer ' + token))})
        }
        return req;    
    }

  }