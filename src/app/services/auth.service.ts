//import standard library
import { map, mergeMap,catchError } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

//import custom library
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { CldrIntlService, IntlService } from '@progress/kendo-angular-intl';
import { RvHttpService } from './rv-http.service';
import { Router } from '@angular/router';
import { ConfigService } from './config.service';
import { DataService } from './data.service';
import {  loginResponse } from './data.models';
import { MqService } from './mq.service';
import { MapService } from './map.service';

@Injectable()
export class AuthService {
	public username
	public tenantId
	public userAccessList = []
	public isGuestMode = false
	sessionStorageCredentialsMap = {
		currentUser : 'user_name',
		userId : 'user_id',
		accessToken : 'access_token',
		refreshToken: 'refresh_token'
	}
	constructor( public mapSrv : MapService, public mqSrv : MqService ,  private httpSrv: RvHttpService, private dataSrv : DataService, private generalUtil : GeneralUtil, public intlService: IntlService, private router : Router, public configSrv : ConfigService) { 
		this.username = this.generalUtil.getCurrentUser()
		this.isGuestMode = JSON.parse(this.dataSrv.getSessionStorage('isGuestMode'))
		this.userAccessList = JSON.parse(this.generalUtil.getUserAccess())
	}

	
	public hasAccessToPath(path){
		path = path?.toLowerCase()
		if(path == 'control'){
			return ['ACTION' , 'ROBOT' , 'CONTROL'].some(p=>this.userAccessList?.includes(p))
		}else if(path == 'map'){
			return ['MAP' , 'FLOORPLAN' ].some(p=>this.userAccessList?.includes(p))
		}else if(path == 'user'){
			return ['USER' , 'USERGROUP' , 'PASSWORD_POLICY'].some(p=>this.userAccessList?.includes(p))
		}else if(path == 'task'){
			return ['TASK' , 'TASK_TEMPLATE' ].some(p=>this.userAccessList?.includes(p))
		}else{			
			return true
			// !Object.keys(this.routeAccessMap).includes(path) || this.userAccessList?.includes(this.routeAccessMap[path])
		}
	}

	hasRight(functionId){
		if(functionId == 'SYNC_LOG'){
			return this.userAccessList.filter(f=>f.includes("_IMPORT") || f.includes("_EXPORT")).length > 0
		}else{
			return this.userAccessList.includes(functionId.toUpperCase())
		}
	}
	

	public login(username, password , lang = 'EN' , guestMode = false , clientId = null , authId = null , recaptchaToken =  null) {
		// username = "Administrator"//testing
		// this.configSrv.loadDbConfig(true)
		this.tenantId = clientId ? clientId : this.generalUtil.config.CLIENT_ID
		var dataObj = {
			localeId:  lang,
			request: {
				userId: username,
				password: password,
				clientId: clientId ? clientId : this.generalUtil.config.CLIENT_ID,
				accountType: "W",
				authId : authId,
				recaptchaToken : recaptchaToken
			}
		}


		return this.httpSrv.http.post<any>(this.generalUtil.getAPIUrl() + '/api/Auth/login', dataObj)
			.pipe(map((response: loginResponse) => {
				if (response?.result == true && response.validationResults) {
					Object.keys(this.sessionStorageCredentialsMap).forEach(k => sessionStorage.setItem(k, response.validationResults[this.sessionStorageCredentialsMap[k]]))
					this.username = this.generalUtil.getCurrentUser()
					this.userAccessList = response.validationResults?.accessFunctionList.map(f => f.functionCode)
					// console.log(response.validationResults.access_token)
					// this.dataSrv.setSessionStorage('userAccess', JSON.stringify(this.userAccessList))
					this.dataSrv.setSessionStorage('isGuestMode', JSON.stringify(guestMode))
					this.isGuestMode = guestMode
					this.dataSrv.init()
					this.mqSrv.init()
					this.mapSrv.init()
					this.configSrv.setDbConfig(response.validationResults.configurations)
				}
				return response;
			}), catchError((e: any) => {
				//do your processing here
				return throwError(e);
			}));
			// response['data'][this.sessionStorageCredentialsMap[k]]
	}

	public async logout(lang = 'EN' , queryParams = null) {
		let username = this.generalUtil.getCurrentUser()
		Object.keys(this.sessionStorageCredentialsMap).forEach(k => sessionStorage.removeItem(k))
		// sessionStorage.removeItem('userAccess')
		sessionStorage.clear()
		this.username = this.generalUtil.getCurrentUser()
		this.userAccessList = []
		this.httpSrv.stopAllPollings()
		if(username){
			this.httpSrv.post('api/Auth/logout', {
				localeId: lang,
				request: {
					userId: username
				}
			})
		}
		if(this.dataSrv._USE_AZURE_PUBSUB){
			this.mqSrv.pubsubSrv.webSocket.close()
			this.mqSrv.pubsubSrv.disposeWebSocket()
		}else{
			this.mqSrv.signalRSrv.disconnect()
		}
		
		queryParams = queryParams? queryParams: {  }
		queryParams.clientId = this.tenantId
		this.router.navigate(['login'] ,{ queryParams: queryParams})
		// var dataObj = {
		// 	userId : username
		// }

		// return this.http.post<any>(this.generalUtil.getAPIUrl() + '/rest/authentication/logout', this.generalUtil.convertToFormStr(dataObj))
		// 	.pipe(map((response) => {
		// 		sessionStorage.removeItem('currentUser');
		// 		sessionStorage.removeItem('accessToken');
		// 		sessionStorage.removeItem('refreshToken');
		// 		sessionStorage.removeItem('userId');
		// 		return true;
		// 	}));
    }
}