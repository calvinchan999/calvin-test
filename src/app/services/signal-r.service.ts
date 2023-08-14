import { EventEmitter, Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { BehaviorSubject, concat, Subject, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { AuthService } from './auth.service';
import { UiService } from './ui.service';

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  connection : HubConnection
  topicSubjMap = {} 
  subscribedTopics = []
  reconnectLoadingTicket = null
  isRefreshingToken = false
  tokenRefreshed = false
  
  public get onConnected() : EventEmitter<any>{
    return this.connection['onConnected']
  }
  public get enabled(){
    return this.generalUtil.config.USE_SIGNALR
  }

  constructor( private generalUtil: GeneralUtil, private uiSrv : UiService ) { 
    this.resetConnection()  
  }

  resetConnection(){
    this.connection?.stop()
    delete this.connection
    this.connection = new HubConnectionBuilder().withUrl(this.getUrl() , { accessTokenFactory: () => this.generalUtil.getUserAccessToken() }).build();
  }

  getUrl(){
    if(this.generalUtil.config.SIGNALR_ENDPOINT && this.generalUtil.config.SIGNALR_PORT ){
      let hostname = !this.generalUtil.config.SERVER_URL || this.generalUtil.config.SERVER_URL.length == 0 ? window.location.hostname : this.generalUtil.config.SERVER_URL
      let port = this.generalUtil.config.SIGNALR_PORT?.length  >  0 ? ':' +  this.generalUtil.config.SIGNALR_PORT : ''
      return  this.generalUtil.config.PROTOCOL + '://' + hostname + port + '/' + this.generalUtil.config.SIGNALR_ENDPOINT 
    }else{
      return this.generalUtil.config.SIGNALR_URL ? this.generalUtil.config.SIGNALR_URL : "/signalR" 
    }
  }

  async invoke(method , args = null, connection : HubConnection = this.connection){
    try{
      if(this.connection){
        if(connection.state != HubConnectionState.Connected){
          await this.connect(connection).pipe(take(1)).toPromise()
        }
        return await connection.invoke.apply(connection, [method].concat(args? args:[]))
      }
    }catch(err){
        this.uiSrv.showNotificationBar(`Error on invoking signalR method [${method}]. ${err?.message}`,'error')
    }
  }

  connect( connection : HubConnection = this.connection , autoReconnect = true , reconnectDelayMs = 3000){
    if(!this.connection){
      this.resetConnection()
      connection = this.connection
    }
    connection.onclose(()=>{
      if(this.getUrl() != this.connection.baseUrl){
        this.resetConnection()
      }
      if(autoReconnect && !connection['aborted'] ){
        setTimeout(()=>{
          this.connect(connection)
        } , reconnectDelayMs)
      }
    })
    if (connection.state == HubConnectionState.Connected || connection.state == HubConnectionState.Connecting) {
      return connection['onConnected'] 
    }
    connection['onConnected'] =  connection['onConnected'] ?   connection['onConnected'] :new EventEmitter()
    connection.baseUrl = this.getUrl()
    if(!connection['aborted']){
      connection.start().then(()=>{
        this.tokenRefreshed = false
        connection['onConnected'].emit()
        //make sure the connection is in the user groups , so that the topic subscription can be substained on reconnected
        this.subscribedTopics.forEach(topic => {
          this.invoke("Subscribe", topic)
        })
        if(this.reconnectLoadingTicket){
         this.uiSrv.loadAsyncDone( this.reconnectLoadingTicket)
         this.reconnectLoadingTicket = null
        }
        this.uiSrv.disconnected.next(false)
        console.log('Connected To SignalR Successfully')

      }).catch(async(err) => {
        if( err?.toString().includes(`Error: Unauthorized: Status code '401'`) && !this.isRefreshingToken ){
          if(!this.tokenRefreshed){
            this.isRefreshingToken = true
            this.generalUtil.setRefreshToken(await this.generalUtil.refreshToken().toPromise())
            this.resetConnection()
            this.isRefreshingToken = false
            this.tokenRefreshed = false
          }else{
            console.log('Refresh token failed')
          }
        }
        // if(!this.reconnectLoadingTicket){
        //   this.reconnectLoadingTicket = this.uiSrv.loadAsyncBegin()
        // }
        // this.uiSrv.showNotificationBar('Network Error : Disconnected','error')
        this.uiSrv.disconnected.next(true)
        if(autoReconnect && this.generalUtil.getUserAccessToken()){
          if(!document.hidden){
            console.log('SignalR will retry to connect in ' + reconnectDelayMs + ' ms ...')
          }
          setTimeout(() =>{
            if(connection.state != HubConnectionState.Connected){
              this.connect(connection)
              // this.uiSrv.showNotificationBar('Trying to reconnect ...', 'info')
              if(!document.hidden){
                console.log('SignalR retrying to connect ... ')
              }
            }          
          }, reconnectDelayMs)
        }     
      })
    }
    return connection['onConnected']
  }

  //### MUST USE THIS FUNCTION TO STOP CONNECTION WHICH WONT AUTO RECONNECT IF autoReconnect = true ###
  disconnect(){
    this.connection['aborted'] = true
    this.connection.stop()
    this.topicSubjMap = {}
    this.connection = null
  }

  async subscribeTopic(topic , invoke = false) : Promise<Subject<any>>{
    this.connect()
    if ([null, undefined].includes(this.topicSubjMap[topic])) {
      this.topicSubjMap[topic] = new Subject<any>()
      this.topicSubjMap[topic]['unsubscribedSubject'] = new Subject<any>()
      this.connection.on(topic, (message) => {      
          this.topicSubjMap[topic].next(message)        
      });
    }
    if(invoke){
      this.invoke("Subscribe", topic)
    }
    this.subscribedTopics = this.subscribedTopics.concat(this.subscribedTopics.includes(topic) ? [] : [topic])
    return this.topicSubjMap[topic]
  }

  unsubscribeTopic(topic){
    // (<Subject<any>>this.topicSubjMap[topic])?.complete()
    //unsubscription of the Subject should be handled in data service
    this.getUnsubscribedSubject(topic)?.next()
    this.invoke("Unsubscribe", topic) //stop receiving messages from server side
    this.subscribedTopics = this.subscribedTopics.filter(t=>t!=topic)
    //delete this.topicSubjMap[topic] *** be careful this line could cause repeated subscription of pose ***
  }

  getUnsubscribedSubject(topic) : Subject<any>{
    return this.topicSubjMap[topic]?.['unsubscribedSubject']
  }

  getCreatedTopics(){
   return Object.keys(this.topicSubjMap).filter(k=>this.topicSubjMap[k]) 
  }
}


