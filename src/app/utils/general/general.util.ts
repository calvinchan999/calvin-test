//import standard library
import { formatDate } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, LOCALE_ID ,Inject} from '@angular/core';
import {Pipe, PipeTransform} from "@angular/core";
import { FormGroup } from '@angular/forms';
import { BehaviorSubject, Subject, fromEvent } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { localStorageKey, sessionStorageKey } from 'src/app/services/data.service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class GeneralUtil {
	isConfigInit:boolean = false;
	isDbConfigInit:boolean = false;
	isFormConfigInit:boolean = false;
	public config:any = {};
	public dbConfig:any = {};
	public formConfig:any = {};
	public $initDone = new BehaviorSubject(null);
	public $formConfigInitDone = new BehaviorSubject(null);
	public standaloneApp = false;
	public arcsApp = false
	get initDone(){
	  return this.$initDone.pipe(filter(v => ![null,undefined].includes(v)), take(1))
	}
	get formConfigLoaded(){
	 return this.$formConfigInitDone.pipe(filter(v => ![null,undefined].includes(v)), take(1))
	}

	locationList : any[] = [];

	constructor(private http : HttpClient) {
		this.standaloneApp = environment.app.toUpperCase() == 'STANDALONE'
		this.arcsApp = environment.app.toUpperCase() == 'ARCS'
		console.log('**************************************************************************************')
		console.log(`FOBO-AMR-WEB [${ environment.app.toUpperCase()}] BUILD ${environment.version} By RV Automation Technology Company Limited `)
		console.log('**************************************************************************************')
	}
	

	public trimNum(value , decimalPlaces = 3){
		return isNaN(Number(value))? 0 : Number(Number(value).toFixed(decimalPlaces))
	}

	public convertNumberToStringWithZero(number, size) {
		if(!number) return "";

		var str = number.toString();
		while(str.length != size && str.length < size) {
			str = "0" + str;
		}

		return str;
	}

	public getISODateStr(source) {
		var date = new Date(source);

		var year  = date.getFullYear();
		var month = date.getMonth() + 1;
		var dt    = date.getDate();

		return year + '-' 
		     + (month < 10 ? '0' + month : month.toString()) + '-' 
		     + (dt < 10 ? '0' + dt : dt.toString());
	}

	public convertToFormStrForFilter(dataObj) {
		var dataStrArray = [];
		Object.keys(dataObj).forEach(function(key, index) {
			if(dataObj[key] && Array.isArray(dataObj[key])){
				dataObj[key].forEach(value => {
					dataStrArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
				})
			} else if(dataObj[key]){
				dataStrArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(dataObj[key]));
			} 
				
		});
		
		return dataStrArray || dataStrArray.length > 0 ? dataStrArray.join('&') : '';
	}

	public convertToFormStr(dataObj) {
		var dataStrArray = [];
		Object.keys(dataObj).forEach(function(key, index) {
			if(dataObj[key] && Array.isArray(dataObj[key])){
				dataObj[key].forEach(value => {
					dataStrArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
				})
			} else if(dataObj[key]) {
				dataStrArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(dataObj[key]));
			} else {
				dataStrArray.push(encodeURIComponent(key) + '=');
			}
				
		});
		
		return dataStrArray || dataStrArray.length > 0 ? dataStrArray.join('&') : '';
	}

	public getSQLFmtDateStr(date: Date): string {
		return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${(date.getDate()).toString().padStart(2, '0')}`
	}

	public compareTimestamp(time1, time2) {
		if(time1 > time2) return 1;
		if(time2 > time1) return -1;

		return 0;
	}

	public decodeJWT(token) {
		var tokenArray = token.split('.');
		if(tokenArray.length != 3) return null;

		return JSON.parse(atob(tokenArray[1]));
	}

	public setConfig(config) {
		this.config = config;
		this.isConfigInit = true;
		console.log('config set')
		console.log(this.config)
		this.$initDone.next(true)
	}

	public setFormConfig(config){
		this.formConfig = config;
		this.isFormConfigInit = true;
		this.$formConfigInitDone.next(true)
	}
	
	public setDbConfig(config) {
		this.dbConfig = config;
		this.isDbConfigInit = true;
	}

	public updateSystemConfig(config) {
		this.config.PAGE_CONFIG.EVENT_SUMMARY_INTERVAL_MINUTE = parseInt(config["system.eventSummaryIntervalInMinute"]);
		this.config.PAGE_CONFIG.REFRESH_TIME_SECOND = parseInt(config["system.eventSummaryDelayInSecond"]);

		this.config.MQTT.USER_NAME = config["mqtt.username"];
		this.config.MQTT.PASSWORD = config["mqtt.password"];

		this.config.MQTT.TOPIC_LIST = [];
		this.config.MQTT.TOPIC_LIST.push(config["mqtt.topic.device"]);
		this.config.MQTT.TOPIC_LIST.push(config["mqtt.topic.deviceCommand"]);
		this.config.MQTT.TOPIC_LIST.push(config["mqtt.topic.deviceReplyTo"]);
		this.config.MQTT.TOPIC_LIST.push(config["mqtt.topic.deviceStatus"]);
		this.config.MQTT.TOPIC_LIST.push(config["mqtt.topic.exception"]);
		this.isConfigInit = true;
	}

	// public getLocationList() {
	// 	return sessionStorage.getItem('locationList') ? JSON.parse(sessionStorage.getItem('locationList')) : [];
	// }

	// public setLocationList(locationList) {
	// 	sessionStorage.setItem('locationList', JSON.stringify(locationList));
	// }

	public getPageConfig() {
		return this.config.PAGE_CONFIG;
	}

	public getMQTT() {
		return this.config.MQTT;
	}

	public getAPIUrl() {
		let hostname = !this.config.SERVER_URL || this.config.SERVER_URL.length == 0 ? window.location.hostname : this.config.SERVER_URL
		return this.config.PROTOCOL + '://' + hostname + (this.config.PORT_NO?.length > 0 ? ':' : '') + this.config.PORT_NO  +  this.config.APPLICATION;
	}

	public getRvApiUrl(){ //Changed to call Only 1 API for the whole APP
		return  this.getAPIUrl()//this.config.PROTOCOL + '://' + this.config.SERVER_URL + ':' + this.config.PORT_NO  + this.config.APPLICATION_RV
	}

	public isLoggedIn() {
		return this.getUserAccessToken() ? true : false;
	}

	public isAccessTokenExpired() {
		var token = this.getUserAccessToken();

		if(!token) return true;
		var userInfor = this.decodeJWT(token);
		if(this.compareTimestamp(userInfor['exp'], Math.floor(new Date().getTime() / 1000)) == -1)
			return true;

		return false;
	}

	public isRefreshTokenExpired() {
		var token = this.getUserRefreshToken();

		if(!token) return true;

		var userInfor = this.decodeJWT(token);

		if(this.compareTimestamp(userInfor['exp'], Math.floor(new Date().getTime() / 1000)) == -1)
			return true;

		return false;
	}

	public refreshToken() {
        var dataObj = {
            userId: this.getUserId(),
            clientId: this.config.CLIENT_ID,
            refreshToken: this.getUserRefreshToken()
        }
        return this.http.post<any>( this.getAPIUrl() + '/api/Auth/refreshtoken',dataObj)
    }

	public setRefreshToken(refreshResp){
		if (refreshResp?.['data']?.['validationResults']?.['access_token']) {
			sessionStorage.setItem('accessToken', refreshResp['data']?.['validationResults']?.['access_token'])
			sessionStorage.setItem('refreshToken', refreshResp['data']?.['validationResults']?.['refresh_token'])
			console.log('Token Refreshed Sucessfully')
		}
	}

	public getUserId() {
		return sessionStorage.getItem('userId') || '';
	}

	// public getUserName() {
	// 	return this.getCurrentUser().name || '';
	// }
	
	public getApiKey(){
		return this.config.API_KEY;
	}

	public getUserAccessToken() {		
		// return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJSVl9BRE1JTiIsInRlbmFudF9jb2RlIjoicnYiLCJ0aWQiOiIxMWI3ZWQ3Ni1iOTc4LTQxMWItOGVjYi0zNmIyMTIyMGRlM2UiLCJBdXRob3JpemVkRnVuY3Rpb25zIjoiMm1zUWJzNTBVbXVlUVgzdUVkcm5jNkNlTFp1TGtJbFpxY2pKbThxekFOMGJmYmI5ZXJWWjl5R2xTV0tQcEJsd1FVdEdvRGlzZ0xYMU5aTVhqTDE1eDk5clc4bmU5YXJEMXZLU29JakhTUEs4dW51dU9kb3hSdVNmWEYxL2Q5VGl0aWsyTmd3Y2JRRHJUNENkK2RzN2hjcmhabjg0WXFnV25lSjBwRTRla2dQaEo4NEZITTNEMXBOckI4YVRLVjRTVENzYVpkM1puUXc2OC9WTndaZzgxZmZZaHNLVHF5aTZpNDl1RHdmajlhYjZpbXYwUy9Sd2oyWkZXUDN2RGFHV2N6cnFBQlozNm5qMXY4MmpZMGN3bGJmcklLdjVqbUI5dFdwNWpscUxObWcxVlZLcUxaU1g5bFhvQ29ER1NmY3RDeGpKZVNjQTdlTm4vUkY5YU5kWjRQL1d4VnN1QTN1UGlHM0dyYUZqYkVlSXFYd1N2OUExY1N0UlM5VndubEZaRzFXWmdidnE0SWtBalFWemFZRytFUT09IiwibmJmIjoxNjY1MTcwMDE0LCJleHAiOjE2NjUxNzAwMTQsImlzcyI6InNjaG1pZHQiLCJhdWQiOiJkZW1vYXBwIn0.R0vAALQLwUJ8huoLW8wo9tEVOqO5a1pgl1pAuuMR1MM`
		return sessionStorage.getItem('accessToken') || '';
	}

	public getUserRefreshToken() {
		return sessionStorage.getItem('refreshToken') || '';
	}

	public getCurrentUser() {
		return sessionStorage.getItem('currentUser') ? sessionStorage.getItem('currentUser'): null;
	}

	public getTenantCode(){
		return this.decodeJWT(this.getUserAccessToken())?.['tenant_code']
	}

	public getUserAccess() {
		var token = this.getUserAccessToken();
		if(token){
			return JSON.stringify(JSON.parse(atob(token.split('.')[1]))?.['AuthorizedFunctions']?.split(";"))
		}else{
			return null
		}
		//return sessionStorage.getItem('userAccess') ? sessionStorage.getItem('userAccess'): null;
	}

	public loadToFrmgrp(frmGrp: FormGroup , data ){
		Object.keys(frmGrp.controls).filter(k=>Object.keys(data).includes(k)).forEach(k=> frmGrp.controls[k].setValue(data[k]))
	}

	public validateFrmGrp(frmGrp){
		frmGrp.markAllAsTouched()
		// frmGrp.controls.forEach(ctrl=> ctrl.updateValueAndValidity())
		frmGrp.updateValueAndValidity()
		return !frmGrp.invalid
	}
	
	// {result ? :boolean ,msgCode : string , msg : string ,  }
	public showErrors(validationResults , ucMap, resp = null) {
		validationResults.forEach(result => {
			if (resp && !resp.msg) {
				resp.msg = result.message
			}

			// if(resp?.exceptionDetail){
			// 	console.log(resp?.exceptionDetail)
			// }
			if (!ucMap || result?.fields.length <= 0) {
				return
			}
			let setFrmGrpErr = (frmGrp: FormGroup, key, msg) => {
				if (Object.keys(frmGrp.controls).includes(key)) {
					frmGrp.controls[key].markAllAsTouched()
					frmGrp.controls[key].setErrors({ message: msg })
				}
			}
			if (ucMap instanceof FormGroup) {
				setFrmGrpErr(ucMap, result.fields[0], result.message)
			} else {
				Object.keys(ucMap).forEach(k => {
					let keys = k.split(',').map(k2 => k2.trim())
					if (keys.every(k2 => result.fields[keys.indexOf(k2)] == k2)) {
						if (ucMap[k] instanceof FormGroup) {
							setFrmGrpErr(ucMap[k], result.fields[keys.length], result.message)
						} else if (ucMap[k]?.setErrors) { // ListviewComponents
							ucMap[k].setErrors(result.fields[keys.length], result.fields[keys.length + 1], result.message)
						}
					}
				})
			}
		})
	}

	public isString(v){
		return (typeof v === 'string' || v instanceof String)
	}

	public isFunction(v){
		return typeof v === 'function'
	}

	public getConfigColors(){
		return this.config.robot.visuals.map(v=>v['fillColor'].replace('0x' , '#'))
	}

	public getGroupedListsObject(array, key) {
		// Return the end result
		return JSON.parse(JSON.stringify(array)).reduce((result, currentValue) => {
			// If an array already present for key, push it to the array. Else create an array and push the object
			(result[currentValue[key]] = result[currentValue[key]] || []).push(
				currentValue
			);
			// Return the current iteration `result` value, this will be taken as next iteration `result` value and accumulate
			return result;
		}, {}); // empty object is the initial value for result object
	}
}

export function setLocalStorage(key: localStorageKey, value: string) { //Manage All LocalStorage Keys here!!!
	localStorage.setItem(key, value)
}

export function getLocalStorage(key: localStorageKey) {
	return localStorage.getItem(key)
}

export function setSessionStorage(key: sessionStorageKey, value: string) { //Manage All SessionStorage Keys here!!!
	sessionStorage.setItem(key, value)
}

export function getSessionStorage(key: sessionStorageKey) {
	return sessionStorage.getItem(key)
}


export async function blobToBase64(blob: Blob) {
	const reader = new FileReader();
	reader.readAsDataURL(blob);
	return fromEvent(reader, 'load').pipe(take(1), map(() => (reader.result as string).split(',')[1])).toPromise();
}

export async function base64ToBlob(b64Data : string, contentType = '', sliceSize = 512) {
	const byteCharacters = atob(b64Data);
	const byteArrays = [];

	for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
		const slice = byteCharacters.slice(offset, offset + sliceSize);

		const byteNumbers = new Array(slice.length);
		for (let i = 0; i < slice.length; i++) {
			byteNumbers[i] = slice.charCodeAt(i);
		}

		const byteArray = new Uint8Array(byteNumbers);
		byteArrays.push(byteArray);
	}

	const blob = new Blob(byteArrays, { type: contentType });
	return blob;

}
