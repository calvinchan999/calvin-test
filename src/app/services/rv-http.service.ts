import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, timer } from 'rxjs';
import { catchError, map, retry, share, switchMap, takeUntil } from 'rxjs/operators';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { SignalRService } from './signal-r.service';
import { UiService } from './ui.service';

@Injectable({
  providedIn: 'root'
})
export class RvHttpService {
  
  constructor(public http: HttpClient,  private generalUtil: GeneralUtil , private uiSrv : UiService , private signalRSrv : SignalRService) { 

  }

  stopPollings = new Subject()
  pollingcontrollers = [this.stopPollings]
  
  public async rvRequest(method : 'POST' | 'PUT' | 'GET' | 'DELETE', rvEndpoint: string, body: object = {} , fullResponse = true, dispMsg = null , extraMsgPaths = null ,  throwErr = false ): Promise<any>{
    try{
      
      let resp = await this.http.request('post', this.generalUtil.getRvApiUrl() + '/rv', 
                                     { body: {
                                       method:method,
                                       parameter:'/' + rvEndpoint,
                                       data:body
                                     } , observe: fullResponse ? 'response' : 'body'}).toPromise()
      if (dispMsg && resp?.status == 200) {
        let getResultFromPath = (resp , paths)=>{
          return paths.length == 0 ? resp : getResultFromPath(resp[paths.shift()], paths)
        }
        let extraMsg = extraMsgPaths ? getResultFromPath(JSON.parse(resp.body), extraMsgPaths) : ''
        this.uiSrv.showNotificationBar(this.uiSrv.translate("Operation Successs") + '- ' + this.uiSrv.translate(dispMsg)  + extraMsg, 'success')
      } else if(dispMsg){
        this.uiSrv.showNotificationBar(this.uiSrv.translate("Operation Failed") + '- ' + this.uiSrv.translate(dispMsg) , 'error')
      }
      return fullResponse ? resp : JSON.parse(resp)
    } catch (err) {
        console.log(err)
      if (throwErr) {
        throw err;
      } else {
        //PENDING : Confirm with RV error message param replace logic
        this.uiSrv.showNotificationBar(`API HTTP [${method.toUpperCase()  + ' ' +  rvEndpoint}] ERROR ` +  (err.error?.message? ' : ': '') +  this.uiSrv.translate(err.error?.message ) ,'error') //TBD : arguments
        return err?.error
      }
    }
  }

  public async request(method : 'put' | 'post' | 'get' ,endpoint: string, body: object = {}, queryParm = null, header = null, throwErr = false , fullResponse = false): Promise<any>{
    try{
      return await this.http.request(method, this.generalUtil.getRvApiUrl() + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), 
                                     { headers:header, body: body , observe: fullResponse ? 'response' : 'body'}).toPromise()
      

    } catch (err) {
        console.log(err)
      if (throwErr) {
        throw err;
      } else {
        this.uiSrv.showNotificationBar('API HTTP [' + method.toUpperCase() + '] ERROR : ' +  endpoint ,'error')
        return err?.error
      }
    }
  }

  // public async postRV(endpoint: string, body: object = {}, queryParm = null, header = null, throwErr = false): Promise<any> {
  //   return await this.rvRequest('POST' ,endpoint, body , true, queryParm , header, throwErr)
  // }

  // public async getRV(endpoint: string, body: object = {}, queryParm = null, header = null, throwErr = false): Promise<any> {
  //   return await this.rvRequest('GET' ,endpoint, body , true , queryParm , header, throwErr)
  // }

  // public async putRV(endpoint: string, body: object = {}, queryParm = null, header = null, throwErr = false): Promise<any>{
  //   return await this.rvRequest('PUT' ,endpoint, body , true,  queryParm , header, throwErr)
  // }

  public async pollingRV(endpoint: string, body: object = {}, queryParm = null, header: object = {}, pollingRefreshIntervalMs = 1000, effectiveTill = null){
    let apiUrl = '';
    return await this.polling(endpoint ,body,queryParm,header, apiUrl, pollingRefreshIntervalMs,effectiveTill )
  }

  //^ * * * call proxy API to get result from RV API * * * ^

  //v * * * internal API , mainly for schmidt DB CRUD * * * v

  public async get(endpoint: string, body: object = {}, queryParm = null, header = null, apiUrl: string = this.generalUtil.getAPIUrl(), throwErr = false , isPolling = false , returnDataPartOnly = true ): Promise<any> {
    try{
      let resp = await this.http.request('get', apiUrl + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), { headers:header, body: body}).toPromise()
      let returnRawEndpoints = [] 
      return (!returnRawEndpoints.includes(endpoint) && returnDataPartOnly) ? resp?.['data'] : resp
    } catch (err) {
      if(!isPolling){
        this.uiSrv.showNotificationBar('API HTTP [GET] ERROR : ' +  endpoint ,'error')
        console.log(err)
      }
      if (throwErr) {
        throw err;
      } else {
        return err?.error
      }
    }
    // return this.http.get<any>(apiUrl + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), body)
    //   .pipe(map((res) => {
    //     return res;
    // })).toPromise();
  }

  public async getWithTotalCount(endpoint: string, body: object = {}, queryParm = null, header = null, apiUrl: string = this.generalUtil.getAPIUrl(), throwErr = false , isPolling = false): Promise<any> {
    return this.get(endpoint , body , queryParm , header , apiUrl , throwErr, isPolling , false)
  }

  // , catchError(err => {
  //   if(err.error){
  //     return of(err?.error)
  //   }else{
  //     throw of(err);
  //   }
  // })

  public async post(endpoint: string, body: object = {}, queryParm = null, header = null, apiUrl: string = this.generalUtil.getAPIUrl(), throwErr = false , returnDatapartOnly = true): Promise<any> {
    try {
      // let newStructEndPoints = ['api/robot/v1', 'api/robot/action/v1'] //new structure implementing : wrap the data in the data property & err in err property
      let resp = await this.http.post<any>(apiUrl + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), body , {headers:header}).toPromise() 
      return (returnDatapartOnly? resp?.['data'] : resp)
    } catch (err) {
      this.uiSrv.showNotificationBar('API HTTP [POST] ERROR : ' +  endpoint ,'error')
      if (throwErr) {
        throw err;
      } else {
        return err?.error
      }
    }


    //  let resp = this.http.post<any>(apiUrl + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), body).toPromise()
    //   .pipe(map((res) => {
    //     return res;
    //   })).toPromise();
  }
  
  
  public async put(endpoint: string, body: object = {}, queryParm = null, header = null, apiUrl: string = this.generalUtil.getAPIUrl(), throwErr = false , returnDatapartOnly = true): Promise<any> {
    try {
      // let newStructEndPoints = ['api/robot/v1', 'api/robot/action/v1'] //new structure implementing : wrap the data in the data property & err in err property
      let resp = await this.http.put<any>(apiUrl + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), body , {headers:header}).toPromise() 
      return (returnDatapartOnly? resp?.['data'] : resp)
    } catch (err) {
      this.uiSrv.showNotificationBar('API HTTP [POST] ERROR : ' +  endpoint ,'error')
      if (throwErr) {
        throw err;
      } else {
        return err?.error
      }
    }


    //  let resp = this.http.post<any>(apiUrl + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), body).toPromise()
    //   .pipe(map((res) => {
    //     return res;
    //   })).toPromise();
  }

  public async delete(endpoint: string, body: object = {}, queryParm = null, header = null, apiUrl: string = this.generalUtil.getAPIUrl(), throwErr = false): Promise<any> {
    try {
      return (await this.http.request('delete', apiUrl + '/' + endpoint + (queryParm ? this.generalUtil.convertToFormStr(queryParm) : ''), { headers:header, body: body}).toPromise())['data']
    } catch (err) {
      this.uiSrv.showNotificationBar('API HTTP [DELETE] ERROR : ' +  endpoint ,'error')
      if (throwErr) {
        throw err;
      } else {
        return err?.error
      }
    }
  }
  

  public async polling(endpoint: string, body: object = {}, queryParm = null, header: object = {}, apiUrl: string = this.generalUtil.getAPIUrl(),
                 pollingRefreshIntervalMs = 1000, effectiveTill = null): Promise<Observable<any> | Subject<any>> {
    let ret$ 
    if(this.generalUtil.config.USE_SIGNALR){
      ret$ = (await this.signalRSrv.subscribeTopic(endpoint)).pipe(takeUntil(effectiveTill ? effectiveTill : this.stopPollings))
    }else{
       ret$ = timer(1, pollingRefreshIntervalMs).pipe(
        switchMap(() => {
          return this.get(endpoint, body, queryParm, header, apiUrl, false, true, false)
        }),
        retry(),
        share(),
        takeUntil((effectiveTill ? effectiveTill : this.stopPollings))
      );
  
      if (effectiveTill) {
        this.pollingcontrollers.push(effectiveTill)
      }
    }
   
    return ret$
  }

  public stopAllPollings(){ //NOT USED ANYMORE SINCE USE_SIGNALR should always be true
    this.pollingcontrollers.forEach(c=>c.next())
  }
}
