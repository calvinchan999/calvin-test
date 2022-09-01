import { Injectable } from '@angular/core';
import { WebPubSubServiceClient } from '@azure/web-pubsub'
import { RvHttpService } from './rv-http.service';
import { UiService } from './ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

type Payload = {
  type? : string
  data? : string
  group? :  string
  ackId ? : number
}

@Injectable({
  providedIn: 'root'
})

export class AzurePubsubService {
  constructor(public httpSrv : RvHttpService , private uiSrv : UiService, private util: GeneralUtil ) {  
    if(this.util.config.USE_SIGNALR){
      return
    }
  }

  keepAliveSeconds = 15
  webSocket : WebSocket = null
  singletonSubject =  new Subject<any>();
  topicSubjStore = {

  }
  pingInterval 
  pingTimeoutSeconds = 3
  reconnectionSeconds = 3
  reconnecting = false
  pongReceived = true
  pongSubscription
  subscribedTopics = []
  hasEverConnected = false
  _autoId = 0
  get autoId(){
    this._autoId += 1
    return Number(new Date().getTime().toString() + this._autoId.toString())
  }
  
  async init(){
    await this.makeWebSocketConnection()
  }

  async getWssUrl(){
    //return `wss://rv-arcs.webpubsub.azure.com/client/hubs/Hub?access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ3c3M6Ly9ydi1hcmNzLndlYnB1YnN1Yi5henVyZS5jb20vY2xpZW50L2h1YnMvSHViIiwiaWF0IjoxNjU5NjA1MDkzLCJleHAiOjE2NTk2MDg2OTN9.gFAKGc82mtRnhtx9xeIPPq4dCNSY_0-3EETCcFQd-n8`
    //return `wss://rv-arcs.webpubsub.azure.com/client/hubs/Hub?access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ3c3M6Ly9ydi1hcmNzLndlYnB1YnN1Yi5henVyZS5jb20vY2xpZW50L2h1YnMvSHViIiwiaWF0IjoxNjU5NTk0NTI5LCJleHAiOjE2NTk1OTgxMjl9.7Kk5j0S-JrW457Z14uEIH9xX29tZB_ntwMA4AX6DinQ`
    return await this.httpSrv.get('api/sysparas/pubsub/negotiate/v1')
  }

  async makeWebSocketConnection(isReconnect = false) : Promise<Subject<any>>{
    if((isReconnect && this.reconnecting) || this.webSocket){
      return
    }
    this.reconnecting = isReconnect
    this.webSocket = new WebSocket(await this.getWssUrl() , 'json.webpubsub.azure.v1')
    var awaiter = new Subject<any>();
    this.webSocket.onmessage = (e: MessageEvent) => {
      this.singletonSubject.next(JSON.parse(e.data))
    }
    this.webSocket.onerror = (e) => console.log(e)
    this.webSocket.onopen = ()=> awaiter.next()
    this.webSocket.onclose = ()=> {
        this.reconnecting = false
        this.uiSrv.showNotificationBar(isReconnect ? "Azure Web Pub Sub Reconnect fail" : "Fail to connect Azure Web Pub Sub" , 'error')
        setTimeout(()=>{
          this.disposeWebSocket()
          this.makeWebSocketConnection(true)
        } ,this.reconnectionSeconds * 1000 )
    }
    await awaiter.pipe(take(1)).toPromise() 
    this.subscribedTopics.forEach(t=> this.webSocket.send(JSON.stringify({ type: "joinGroup", group: t , ackId : this.autoId})))
    if(isReconnect){
      this.reconnecting = false   
      this.uiSrv.showNotificationBar("Azure Web Pub Sub Reconnected Successfully")
    }
    this.setHeartBeat()   
    this.hasEverConnected = true
    return this.singletonSubject;
  }

  resetHeartBeat(){
    clearInterval(this.pingInterval)
    this.setHeartBeat()
  }
  
  setHeartBeat(){
    this.pingInterval = setInterval(()=> this.ping() , this.keepAliveSeconds * 1000)
  }  

  async ping(){
    let pongReceived = false
    let ackId = this.autoId
    this.pongSubscription?.unsubscribe()
    this.pongSubscription = this.singletonSubject.pipe(filter((msg : Payload) => msg.type == 'ack' && msg.ackId == ackId)).subscribe(()=>{
      pongReceived = true
    })
    await this.publish('gui-heartbeat' , '' , ackId)
    setTimeout(()=>{  
      if(!pongReceived){
        this.disposeWebSocket()
        this.uiSrv.showNotificationBar("Azure Web Pub Sub Connection Lost" , 'error')
        this.makeWebSocketConnection(true)
      }
    },this.pingTimeoutSeconds * 1000)  
  }

  disposeWebSocket() {
    clearInterval(this.pingInterval)
    this.webSocket.onclose = null
    this.webSocket.onmessage = null
    this.webSocket.onerror = null
    this.webSocket = null
  }

  async publish(topic: string = null, payload: string , ackId = undefined) {
    await this.webSocket.send(JSON.stringify({ type: "sendToGroup", group: topic, data: payload , ackId : ackId}))
  }

  async subscribeTopic(topic: string)  {
    if (this.topicSubjStore[topic] == null) {
      this.topicSubjStore[topic] = new Subject<any>();
      this.topicSubjStore[topic]['$unsubscribed'] = new Subject<any>();
      this.singletonSubject.pipe(
        takeUntil(this.topicSubjStore[topic]['$unsubscribed']),
        filter((msg : Payload) => msg && msg.group == topic)
      ).subscribe((msg) => {   
        this.resetHeartBeat()
        this.topicSubjStore[topic].next(msg.data)
      })
    }
    if (this.webSocket?.readyState != WebSocket.CLOSED) {
      this.webSocket?.send(JSON.stringify({ type: "joinGroup", group: topic, ackId: this.autoId }))
    }
    this.subscribedTopics = this.subscribedTopics.filter(t => t != topic).concat([topic])
    return this.topicSubjStore[topic]
  }

  async unsubscribeTopic(topic: string) {
    this.topicSubjStore[topic]['$unsubscribed']?.next()
    this.topicSubjStore[topic] = null
    this.webSocket?.send(JSON.stringify({type: "leaveGroup", group: topic, ackId : this.autoId}))
    this.subscribedTopics = this.subscribedTopics.filter(t=>t!=topic)
  }

  getCreatedTopics(){
    return this.subscribedTopics
   }
}
