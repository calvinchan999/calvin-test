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

    // Intercepts all HTTP requests
    // intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    //     if(request.url !=  this.generalUtil.getAPIUrl() + '/api/Auth/refreshtoken' && !request.url.startsWith('assets/')){
    //         return from(this.handle(request, next))
    //     }else{
    //         return next.handle(request)
    //     }
    // }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<Object>> {
        let authReq = req;
        const token = this.generalUtil.getUserAccessToken();
        if (token != null ) {
          authReq = this.addTokenHeader(req, token);
        }
        return next.handle(authReq).pipe(catchError(error => {
          console.log(error)
          if (error instanceof HttpErrorResponse && error.status == 401 && !authReq.url.endsWith('/api/Auth/refreshtoken') && !authReq.url.startsWith('assets/')) {
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

    
    // private async handle(req: HttpRequest<any>, next: HttpHandler) {
    //     try {
    //         if (sessionStorage.getItem('accessToken') && (this.generalUtil.isAccessTokenExpired())) {
    //             var dataObj = {
    //                 userId: this.generalUtil.getUserId(),
    //                 clientId: '162666ad46c4495a857776a9fd4e273e',
    //                 refreshToken: this.generalUtil.getUserRefreshToken()
    //             }

    //             try{
    //                 console.log('Token expired. Trying to refresh the token ...')
    //                 let resp = await this.http.post<any>( this.generalUtil.getAPIUrl() + '/api/Auth/refreshtoken',dataObj).toPromise()
    //                 if (resp['data']?.['validationResults']?.['access_token']) {
    //                     sessionStorage.setItem('accessToken', resp['data']?.['validationResults']?.['access_token'])
    //                     sessionStorage.setItem('refreshToken', resp['data']?.['validationResults']?.['refresh_token'])
    //                     console.log('Token Refreshed Sucessfully')
    //                 }
    //             } catch (e) {
    //                 setTimeout(() => {
    //                     if (this.generalUtil.isAccessTokenExpired()) {
    //                         console.log('Failed to Refresh Token')
    //                         if (this.authService.username) {
    //                             this.uiSrv.showNotificationBar(this.uiSrv.translate('Session Timeout , Please Login Again'), 'error')
    //                         }
    //                         this.authService.logout()
    //                         // this.uiSrv.showMsgDialog("ERROR : " + JSON.stringify(e))
    //                     }
    //                 },3000)      
    //                 // const maxRefreshReqWaitMs = 10000
    //                 // setTimeout(()=>{
    //                 //     if(this.generalUtil.isAccessTokenExpired()){
    //                 //         throw e;
    //                 //     }
    //                 // } , maxRefreshReqWaitMs)  
    //             }
    //         }
    //     } catch (e) {
    //         this.authService.logout()
    //         // this.uiSrv.showMsgDialog("ERROR : " + JSON.stringify(e))
    //         console.log(e)
    //     }
        
    //     const headers = {
    //         'Accept': 'application/json',
    //         'Content-Type': 'application/json',
    //         'localeId' : this.uiSrv.selectedLangOption?.['value'],
    //         'userId': this.generalUtil.getUserId() 
    //         // 'Accept'        : '*',
    //         // 'Content-Type'  : 'application/x-www-form-urlencoded',
    //     }

    //     if (this.generalUtil.getUserAccessToken() && this.generalUtil.getUserAccessToken() != '') {
    //         headers['Authorization'] = 'Bearer ' + this.generalUtil.getUserAccessToken()
    //     }
    //     const authReq = req.clone({
    //         setHeaders:headers
    //     })

    //     // Important: Note the .toPromise()
    //     return next.handle(authReq).pipe(catchError(error => {
    //         if (error instanceof HttpErrorResponse && !authReq.url.includes('auth/signin') && error.status === 401) {
    //             return this.handle401Error(authReq, next);
    //         }
    //         return throwError(error);
    //     }));
    // }

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
                        // this.isRefreshing = false;
                        // this.uiSrv.showNotificationBar(this.uiSrv.translate('Session Timeout , Please Login Again'), 'error')
                        // this.authService.logout()
                        // this.uiSrv.loadingTickets = []
                        // location.reload()
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
        // return request.clone({
        //   headers: request.headers.set( 'Authorization' , 'Bearer ' + token)
        // })

        // const headers = {
        //     'Accept': request.headers.get("Accept") ? request.headers.get("Accept")  : 'application/json',
        //     'Content-Type': request.headers.get("Content-Type") ? request.headers.get("Content-Type")  :  'application/json',
        //     'localeId' : this.uiSrv.selectedLangOption?.['value'],
        //     'userId': this.generalUtil.getUserId() 
        //     // 'Accept'        : '*',
        //     // 'Content-Type'  : 'application/x-www-form-urlencoded',
        // }

        // if (token && token != '') {
        //     headers['Authorization'] = 'Bearer ' + token
        // }

        // return request.clone({setHeaders:headers})
      }


    // async handle(request: HttpRequest<any>, next: HttpHandler) {
  
    //     this.EXCLUDE_URL_ARRAY = [
    //         "assets/config/config.json",
    //         // this.generalUtil.getAPIUrl() + "/rest/authentication/login",
    //         // this.generalUtil.getAPIUrl() + "/rest/authentication/logout",
    //         // this.generalUtil.getAPIUrl() + "/rest/authentication/refresh"
    //     ];

    //     // this.IMPORT_FILE_URL_ARRAY = [
    //     //     this.generalUtil.getAPIUrl() + "/rest/test/import/inputStream",
    //     //     this.generalUtil.getAPIUrl() + "/rest/test/import/file",
    //     //     this.generalUtil.getAPIUrl() + "/rest/device/import",
    //     //     this.generalUtil.getAPIUrl() + "/rest/user/import",
    //     //     this.generalUtil.getAPIUrl() + "/rest/eventPerHour/import/archive"
    //     // ];
        

    //     if(this.EXCLUDE_URL_ARRAY.includes(request.url)) {
    //         var cloneRequest = this.addToken(request, '');

    //         return next.handle(cloneRequest).pipe(catchError(error => {
    //             return throwError(error);
    //         }));
    //     } else {
    //         return this.cloneRequest(request, next);
    //     //     var dataObj = {};
    //     }
    // }
    // private async cloneRequest(request: HttpRequest<any>, next: HttpHandler) {
    //     // //Retrieve token
    //     // var token = this.generalUtil.getUserAccessToken();
    //     // //Clone a new request by using the token
    //     // //Check is token expired
    //     if (sessionStorage.getItem('accessToken') && this.generalUtil.isAccessTokenExpired()) {
    //         // dataObj = {
    //         //     userId: this.generalUtil.getUserId()
    //         // }

    //         // return this.http.post<any>(this.generalUtil.getAPIUrl() + '/rest/authentication/logout', this.generalUtil.convertToFormStr(dataObj))
    //         //     .pipe(
    //         //         mergeMap((response) => {
    //         //             this.router.navigate(['/pages/login'], { skipLocationChange: true });
    //         //             return of<any>([]);
    //         //         }),
    //         //         catchError(error => {
    //         //             this.router.navigate(['/pages/login'], { skipLocationChange: true });
    //         //             return of<any>([]);
    //         //         })
    //         //     );

            
    //         // if(!this.generalUtil.isRefreshTokenExpired()){
    //             var dataObj = {
    //                 userId: this.generalUtil.getUserId(),
    //                 clientId:'162666ad46c4495a857776a9fd4e273e',
    //                 refreshToken: this.generalUtil.getUserRefreshToken()
    //             }

    //         this.http.post<any>(this.generalUtil.getAPIUrl() + '/api/Auth/refreshtoken', this.generalUtil.convertToFormStr(dataObj))
    //             .pipe(mergeMap((response) => {
    //                 sessionStorage.setItem('accessToken', response['access_token']);
    //                 return this.cloneRequest(request, next);
    //             }));
    //         // }else{
    //         //     this.uiSrv.showMsgDialog("Session Expired. Please Login Again.")
    //         //     this.router.navigate(['login']);                
    //         // }       

    //     }else{
    //         var cloneRequest = this.addToken(request, this.generalUtil.getUserAccessToken());

    //         //var cloneRequest = this.addApiKey(request);
    
    //         //Execute the request
    //         return next.handle(cloneRequest).pipe(catchError(error => {
    //             return throwError(error);
    //         }));
    //     }
    // } 

    // private addApiKey(request: HttpRequest<any>) {
    // 	//If token exists, clone a new request
    //     let clone: HttpRequest<any>;
        
    //     var apiKey = this.generalUtil.getApiKey();
    //     if (apiKey !== '') {
    //         clone = request.clone({
    //             setHeaders: {
    //                 'Accept'        : 'application/json',
    //                 'Content-Type'  : 'application/json',
    //                 // 'Accept'        : '*',
    //                 // 'Content-Type'  : 'application/x-www-form-urlencoded',

    //                 // 'Access-Control-Allow-Origin': '40.83.126.63',
    //                 // 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    //                 // 'Access-Control-Max-Age': '86400',
    //                 'X-API-Key'     : apiKey
    //             }
    //         });
    //     } else {
    //         clone = request.clone({
    //             setHeaders: {
    //                 'Accept'        : 'application/json',
    //                 'Content-Type'  : 'application/json',
    //                 // 'Accept'        : '*',
    //                 // 'Content-Type'  : 'application/x-www-form-urlencoded',
                    
    //                 // 'Access-Control-Allow-Origin': '40.83.126.63',
    //                 // 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    //                 // 'Access-Control-Max-Age': '86400',
    //             }
    //         });
    //     }
    //     //Return cloned request
    //     return clone;
    // }

    // //Adds the token to your headers if it exists
    // private addToken(request: HttpRequest<any>, token: any) {
    // 	//If token exists, clone a new request
    //     let clone: HttpRequest<any>;
    //     if (token) {
    //         // if((this.IMPORT_FILE_URL_ARRAY?this.IMPORT_FILE_URL_ARRAY:[]).includes(request.url)) 
    //         //     clone = request.clone({
    //         //         setHeaders: {
    //         //             'Accept'        : 'application/json',
    //         //             'Content-Type'  : 'application/json',
    //         //             // 'Accept'        : '*',
    //         //             // 'Content-Type'  : 'application/x-www-form-urlencoded',
    //         //             'Authorization' : 'Bearer ' + token
    //         //         }
    //         //     });
    //         // else 
    //             clone = request.clone({
    //                 setHeaders: {
    //                     'Accept'        : 'application/json',
    //                     'Content-Type'  : 'application/json',
    //                     // 'Accept'        : '*',
    //                     // 'Content-Type'  : 'application/x-www-form-urlencoded',
    //                     'Authorization' : 'Bearer ' + token
    //                 }
    //             });
    //     } else {
    //         clone = request.clone({
    //             setHeaders: {
    //                 'Accept'        : 'application/json',
    //                 'Content-Type'  : 'application/json',
    //                 // 'Accept'        : '*',
    //                 // 'Content-Type'  : 'application/x-www-form-urlencoded',
    //             }
    //         });
    //     }
    //     //Return cloned request
    //     return clone;
    // }
}