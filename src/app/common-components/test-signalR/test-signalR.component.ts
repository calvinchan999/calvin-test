import { Component, OnInit } from '@angular/core';
import { AzurePubsubService } from 'src/app/services/azure-pubsub.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { SignalRService } from 'src/app/services/signal-r.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-test-signalR',
  templateUrl: './test-signalR.component.html',
  styleUrls: ['./test-signalR.component.scss']
})
export class TestSignalRComponent implements OnInit {
  content = ''
  topic = ''
  seriesInterval = 1
  environment = environment
  constructor(private signalRSrv: SignalRService , private uiSrv : UiService , private httpSrv : RvHttpService , private util : GeneralUtil , private pubsubSrv : AzurePubsubService) {
    if(this.util.arcsApp && !this.util.config.USE_SIGNALR){
      this.pubsubSrv.makeWebSocketConnection()
    }
  }

  ngOnInit(): void {
  }

  publish(topic: string, payload) {
    if (this.util.arcsApp && !this.util.config.USE_SIGNALR) {
      this.pubsubSrv.publish(topic, payload)
    } else {
      this.signalRSrv.invoke("Publish", [topic, payload])
    }
  }

  async invokeSignalR(topic , content , interval = this.seriesInterval ) {
    content = JSON.parse(content)
    if (content instanceof Array && topic != 'rvautotech/fobo/wifi') {
      for (let i = 0; i < content.length; i++) {
        // if(topic == 'rvautotech/fobo/map/occupancyGrid'){
        //   content[i]['mapMetadata'] = {
        //     resolution: 0.05,
        //     width : 722 / 20,
        //     height : 466 / 20,
        //     x : - 15 + (i/20),
        //     y:  - 12 + (i/20),
        //   }
        // }
        setTimeout(() => { this.publish(topic, JSON.stringify(content[i])) }, i * 1000 * interval)
      }
    } else {
      try{
        this.publish(topic, JSON.stringify(content))
        this.uiSrv.showNotificationBar('Published successfully' , 'success')
      }catch{
        this.uiSrv.showNotificationBar('Fail to publish the topic' , 'error')
      }
    }
  }

  getSampleData(type) {
    ['content','seriesInterval','topic'].forEach(k=>this[k] = this.sampleData[type][k])
  }

  getPoseList(){
    let ret = []
    for(let i = 0 ; i< 5000 ; i++){
      ret.push([ Math.random() * 200 + 4000 , Math.random() * 200 + 4500 ])
    }
    return ret
  }

  invokeDashboardSignalR(){
    ['ieq' , 'battery' , 'cellular'].forEach(t=>{
      this.invokeSignalR(this.sampleData[t]['topic'] , this.sampleData[t]['content'] , this.sampleData[t]['seriesInterval'])
    })
  }

  async invokeARCSposes(){
    let poses = (await this.httpSrv.http.get('assets/dummy/pose/5W.json').toPromise());
    ['POSE7','POSE8'].forEach(r=>{
      let content = poses[r]
      let interval = 0
      for (let i = 0; i < content.length; i++) {     
        let payload = {
          robotId: r,
          mapName: '5W_0429', //r == 'POSE7' &&  i > 5 && i< 10? 'XXX' : '5W v2'
          x: content[i][0],
          y: content[i][1],
          angle:  0
        }         
        setTimeout(() => { 
          this.publish("rvautotech/fobo/pose/5W_0429" , payload)
        }, interval)
        interval += content[i][2]
      }
    })
  }

  matterPortStressTest(verify = false){
    if(verify && this.content!='CHRIS'){
      console.log('Please authorise to use this function')
      return
    }
    for(let i = 1 ; i < 10 ; i++){
      let content = 
      `[
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${0 + i * 2},"y":0 ,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x":${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${1 + i * 2},"y":0.5,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${2 + i * 2},"y":1.1,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${3 + i * 2},"y":1.5,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${4 + i * 2},"y":2.0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${5 + i * 2},"y":2.5,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${6 + i * 2},"y":3.0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${7 + i * 2},"y":3.5,"angle":0.2},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${8 + i * 2},"y":3.8,"angle":0},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${9 + i * 2},"y":3.5,"angle":-0.3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${9.5 + i * 2},"y":3,"angle":-0.5},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${9.5 + i * 2},"y":3,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x":${9 + i * 2},"y":3,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${8 + i * 2},"y":3,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${7.5 + i * 2},"y":2.5,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${7 + i * 2},"y":2.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x":${6 + i * 2},"y":2.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${5 + i * 2},"y":2,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${4 + i * 2},"y":1.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${3 + i * 2},"y":1,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${2 + i * 2},"y":0.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${1 + i * 2},"y":0.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x": ${0 + i * 2},"y":0,"angle":-2},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x":${0 + i * 2},"y":0,"angle":-0.9},
        {"robotId":"DUMMY-ROBOT","mapName":"ASD","x":${0 + i * 2},"y":0,"angle":0.7}
      ]`
      //30
      content = content.split("DUMMY-ROBOT").join("DUMMY-TEST" + '-' + i)
      this.invokeSignalR('rvautotech/fobo/pose/ASD', content , 1)
      // let content2 = `
      //   [{"robotId":"${"DUMMY-TEST-" + i}","percentage":0.8},{"robotId":"${"DUMMY-TEST-" + i}","percentage":0.4},{"robotId":"${"DUMMY-TEST-" + i}","percentage":0.2}]
      // `
      // this.invokeSignalR(`rvautotech/fobo/battery/${"DUMMY-TEST-" + i}` , content2 , 10)
    }
    setTimeout(()=>this.matterPortStressTest(), 30 * 1000)

  }

  stressTest(verify = false){
    if(verify && this.content!='CHRIS'){
      console.log('Please authorise to use this function')
      return
    }
    for(let i = 1 ; i < 10 ; i++){
      let content = 
      `[
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${0 + i * 2},"y":0 ,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x":${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${0 + i * 2},"y":0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${1 + i * 2},"y":0.5,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${2 + i * 2},"y":1.1,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${3 + i * 2},"y":1.5,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${4 + i * 2},"y":2.0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${5 + i * 2},"y":2.5,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${6 + i * 2},"y":3.0,"angle":0.7},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${7 + i * 2},"y":3.5,"angle":0.2},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${8 + i * 2},"y":3.8,"angle":0},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${9 + i * 2},"y":3.5,"angle":-0.3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${9.5 + i * 2},"y":3,"angle":-0.5},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${9.5 + i * 2},"y":3,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x":${9 + i * 2},"y":3,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${8 + i * 2},"y":3,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${7.5 + i * 2},"y":2.5,"angle":-2.5},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${7 + i * 2},"y":2.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x":${6 + i * 2},"y":2.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${5 + i * 2},"y":2,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${4 + i * 2},"y":1.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${3 + i * 2},"y":1,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${2 + i * 2},"y":0.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${1 + i * 2},"y":0.5,"angle":-3},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x": ${0 + i * 2},"y":0,"angle":-2},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x":${0 + i * 2},"y":0,"angle":-0.9},
        {"robotId":"DUMMY-ROBOT","mapName":"DIM_TEST","x":${0 + i * 2},"y":0,"angle":0.7}
      ]`
      //30
      content = content.split("DUMMY-ROBOT").join("DUMMY-TEST" + '-' + i)
      this.invokeSignalR('rvautotech/fobo/pose/DIM_TEST', content , 1)
      let content2 = `
        [{"robotId":"${"DUMMY-TEST-" + i}","percentage":0.8},{"robotId":"${"DUMMY-TEST-" + i}","percentage":0.4},{"robotId":"${"DUMMY-TEST-" + i}","percentage":0.2}]
      `
      this.invokeSignalR(`rvautotech/fobo/battery/${"DUMMY-TEST-" + i}` , content2 , 10)
    }
    setTimeout(()=>this.stressTest(), 30 * 1000)
  }

  sampleData = {
    ai:{
      seriesInterval: 0,
      topic: 'rvautotech/fobo/armitage/vision/detection',
      content : `{
        "robotId": "FNB-ROBOT",
        "pose": {
          "mapName" : "5W2023",
          "x" : 0,
          "y" : 0 ,
          "angle" : 0
        },
        "detectionType": "EMERGENCY_DOOR_OPEN",
        "base64Image": "iVBORw0KGgoAAAANSUhEUgAAAe…",
        "metadata": "",
        "count": 1,
        "confidence": 0.851,
        "timestamp": 1683707877
      }`
    }
    ,
    poseDeviation:{
      seriesInterval: 0,
      topic: 'rvautotech/fobo/poseDeviation',
      content:`{"robotId":"RV-ROBOT-100", "poseValid": false ,  "translationDeviation" : 0.8 , "angleDeviation":0.7}`
    },
    lift:{
      seriesInterval: 1,
      topic: 'rvautotech/fobo/lift',
      content : `[
        {"liftId":"LIFT-2", "floor" : "1F", "robotId":"RV-ROBOT-104","status" : "OPENED"}
      ]`
    },
    arcsRobotDestination:{
      seriesInterval: 0,
      topic: 'rvautotech/fobo/ARCS/task/bo/RV-ROBOT-418',
      content : `
     {
      "taskId":"Task20230207100745105",
      "robotCode":"RV-ROBOT-418",
      "movementDTOList":
      [{"actionListTimeout":0,"movement":{"floorPlanCode":"5W_2022","pointCode":"WP-07","navigationMode":"AUTONOMY","orientationIgnored":true},"actionList":[{"alias":"NIL","properties":{}}]},{"actionListTimeout":0,"movement":{"floorPlanCode":"5W_2022","pointCode":"WP-06","navigationMode":"AUTONOMY","orientationIgnored":true},"actionList":[{"alias":"NIL","properties":{}}]}],
      "currentTaskItemIndex":0,
      "isCancelled":false
     }
      `
    },
    inno2:{
      seriesInterval: 1,
      topic: 'rvautotech/fobo/pose/DIM_TEST',
      content:`[
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":1,"y":0.5,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":2,"y":1.1,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":3,"y":1.5,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":4,"y":2.0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":5,"y":2.5,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":6,"y":3.0,"angle":0.7},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":7,"y":3.5,"angle":0.2},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":8,"y":3.8,"angle":0},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":9,"y":3.5,"angle":-0.3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":9.5,"y":3,"angle":-0.5},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":9.5,"y":3,"angle":-2.5},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":9,"y":3,"angle":-2.5},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":8,"y":3,"angle":-2.5},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":7.5,"y":2.5,"angle":-2.5},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":7,"y":2.5,"angle":-3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":6,"y":2.5,"angle":-3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":5,"y":2,"angle":-3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":4,"y":1.5,"angle":-3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":3,"y":1,"angle":-3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":2,"y":0.5,"angle":-3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":1,"y":0.5,"angle":-3},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":-2},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":-0.9},
          {"robotId":"RV-ROBOT-105","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":1,"y":0.5,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":2,"y":1.1,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":3,"y":1.5,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":4,"y":2.0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":5,"y":2.5,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":6,"y":3.0,"angle":0.7},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":7,"y":3.5,"angle":0.2},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":8,"y":3.8,"angle":0},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":9,"y":3.5,"angle":-0.3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":9.5,"y":3,"angle":-0.5},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":9.5,"y":3,"angle":-2.5},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":9,"y":3,"angle":-2.5},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":8,"y":3,"angle":-2.5},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":7.5,"y":2.5,"angle":-2.5},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":7,"y":2.5,"angle":-3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":6,"y":2.5,"angle":-3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":5,"y":2,"angle":-3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":4,"y":1.5,"angle":-3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":3,"y":1,"angle":-3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":2,"y":0.5,"angle":-3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":1,"y":0.5,"angle":-3},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":-2},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":-0.9},
          {"robotId":"RV-ROBOT-104","mapName":"DIM_TEST","x":0,"y":0,"angle":0.7}
      ]`
    },
    matterport:{
      seriesInterval: 1,
      topic: 'rvautotech/fobo/pose/ASD',
      content:`[
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":1,"y":0.5,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":2,"y":1.1,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":3,"y":1.5,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":4,"y":2.0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":5,"y":2.5,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":6,"y":3.0,"angle":0.7},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":7,"y":3.5,"angle":0.2},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":8,"y":3.8,"angle":0},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":9,"y":3.5,"angle":-0.3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":9.5,"y":3,"angle":-0.5},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":9.5,"y":3,"angle":-2.5},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":9,"y":3,"angle":-2.5},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":8,"y":3,"angle":-2.5},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":7.5,"y":2.5,"angle":-2.5},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":7,"y":2.5,"angle":-3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":6,"y":2.5,"angle":-3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":5,"y":2,"angle":-3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":4,"y":1.5,"angle":-3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":3,"y":1,"angle":-3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":2,"y":0.5,"angle":-3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":1,"y":0.5,"angle":-3},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":-2},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":-0.9},
        {"robotId":"RV-ROBOT-104","mapName":"ASD","x":0,"y":0,"angle":0.7}
      ]`//`{"robotId":"RV-ROBOT-105","mapName":"ASD","x":12.002865711592390685,"y":-0.010194407119371363,"angle":-2.7410346655388328272}`
    },
    arcsSyncLog:{
      seriesInterval: 0,
      topic: 'rvautotech/fobo/ARCS/data/sync/log',
      content:`{"dataSyncId":"CHRIS-TEST-1","objectCode":"CHRIS-1","objectType":"FLOOR_PLAN","robotCode":"ROBOT-01","dataSyncType":"EXPORT","startDateTime":"2022-11-02T11:34:14.57+08:00","endDateTime":"2022-11-02T11:36:50.73+08:00","dataSyncStatus":"TRANSFERRING"}`
    },
    arcsPose:{
      seriesInterval: 0,
      topic: 'rvautotech/fobo/pose/5W_2022',
      content:`{"robotId":"RV-ROBOT-100","mapName":"5W_2022","x":0.002865711592390685,"y":-0.010194407119371363,"angle":-2.7410346655388328272}`
    },
    scanMap: {
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/map/occupancyGrid',
      content: `[{"robotId":"J6-RV-FR-001","data":"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","mapMetadata":{"resolution":0.05,"width":320,"height":210,"x":-12.25,"y":-1.6500000000000001,"angle":0.0}},{"robotId":"J6-RV-FR-001","data":"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","mapMetadata":{"resolution":0.05,"width":320,"height":210,"x":-12.25,"y":-1.6500000000000001,"angle":0.0}}]`
    },
    scanMapPose:{
      seriesInterval: 1,
      topic: 'rvautotech/fobo/pose',
      content:`[{"robotId":"J6-RV-FR-001","mapName":"","x":0.002865711592390685,"y":-0.010194407119371363,"angle":-2.7410346655388328272},{"robotId":"J6-RV-FR-001","mapName":"","x":0.002865711592390685,"y":-0.010194407119371363,"angle":-2.7410346655388328272},{"robotId":"J6-RV-FR-001","mapName":"","x":0.0028180405346973636,"y":-0.009997019708276156,"angle": 3.13448},{"robotId":"J6-RV-FR-001","mapName":"","x":0.002865711592390685,"y":-0.010194407119371363,"angle":3.13448},{"robotId":"J6-RV-FR-001","mapName":"","x":0.0028180405346973636,"y":-0.009997019708276156,"angle": 3.13448}]`
    },
    taskProgress:{
      content:JSON.stringify({actionIndex:0 , taskItemIndex: 1}),
      topic: 'rvautotech/fobo/action/completion'
    },
    taskComplete:{
      content:JSON.stringify({completed:true , cancelled: false , exception : null}),
      topic:'rvautotech/fobo/completion'
    },
    taskExecute:{
      // content:`{"moveTask":{"taskId":1647850491494,"taskItemList":[{"actionListTimeout":0,"movement":{"waypointName":"5W%R2","navigationMode":"AUTONOMY","orientationIgnored":true,"fineTuneIgnored":true},"actionList":[]},{"actionListTimeout":0,"movement":{"waypointName":"5W%D5","navigationMode":"PATH_FOLLOWING","orientationIgnored":true,"fineTuneIgnored":true},"actionList":[]},{"actionListTimeout":0,"movement":{"waypointName":"5W%R5","navigationMode":"PATH_FOLLOWING","orientationIgnored":true,"fineTuneIgnored":true},"actionList":[]},{"actionListTimeout":0,"movement":{"waypointName":"5W%D7","navigationMode":"PATH_FOLLOWING","orientationIgnored":true,"fineTuneIgnored":true},"actionList":[]}]}}`,
      content:`{
       "robotId" : "RV-ROBOT-100",
       "moveTask" : {
              "taskId":0,
              "taskItemList":[
                 {
                    "actionListTimeout":0,
                    "movement":{
                       "waypointName":"wp4",
                       "navigationMode":"AUTONOMY",
                       "orientationIgnored":true,
                       "fineTuneIgnored":true
                    },
                    "actionList":[
                      {
                         "alias":"SAFETY_ZONE_CHANGE",
                         "properties":{
                               "mode":"NORMAL"
                         }
                      }
                   ]
                 },
                 {
                    "actionListTimeout":0,
                    "movement":{
                       "waypointName":"wp3",
                       "navigationMode":"PATH_FOLLOWING",
                       "orientationIgnored":false,
                       "fineTuneIgnored":true
                    },
                    "actionList":[
                       {
                          "alias":"FAN_SWITCH",
                          "properties":{
                             "switchOn":"true"
                          }
                       }
                    ]
                 },
                 {
                    "actionListTimeout":0,
                    "movement":{
                       "waypointName":"wp5",
                       "navigationMode":"PATH_FOLLOWING",
                       "orientationIgnored":false,
                       "fineTuneIgnored":true
                    },
                    "actionList":[
                       {
                          "alias":"SAFETY_ZONE_CHANGE",
                          "properties":{
                             "mode":"NORMAL"
                          }
                       },
                       {
                          "alias":"FAN_SWITCH",
                          "properties":{
                             "switchOn":"true"
                          }
                       }
                    ]
                 },
                 {
                    "actionListTimeout":0,
                    "movement":{
                       "waypointName":"abc123",
                       "navigationMode":"PATH_FOLLOWING",
                       "orientationIgnored":true,
                       "fineTuneIgnored":true
                    },
                    "actionList":[
                       {
                          "alias":"NIL",
                          "properties":{
                             
                          }
                       }
                    ]
                 },
                 {
                    "actionListTimeout":0,
                    "movement":{
                       "waypointName":"wp5",
                       "navigationMode":"AUTONOMY",
                       "orientationIgnored":true,
                       "fineTuneIgnored":true
                    },
                    "actionList":[
                       {
                          "alias":"BATTERY_CHARGE",
                          "properties":{
                             "upperLimit":"0.9",
                             "duration":"28800000"
                          }
                       }
                    ]
                 },
                 {
                    "actionListTimeout":0,
                    "movement":{
                       "waypointName":"wp3",
                       "navigationMode":"AUTONOMY",
                       "orientationIgnored":true,
                       "fineTuneIgnored":true
                    },
                    "actionList":[
                       {
                          "alias":"NIL",
                          "properties":{
                             
                          }
                       }
                    ]
                 },
                 {
                    "actionListTimeout":0,
                    "movement":{
                       "waypointName":"wp4",
                       "navigationMode":"AUTONOMY",
                       "orientationIgnored":true,
                       "fineTuneIgnored":true
                    },
                    "actionList":[
                       {
                          "alias":"BUTTON_PRESS",
                          "properties":{
                             "buttonId":"DEFAULT_BUTTON_ID"
                          }
                       }
                    ]
                 }
              ]
           }
      }
      `,
      seriesInterval: 0.5,
      topic:'rvautotech/fobo/execution'
    },
    taskMoveEnd:{
      topic:'rvautotech/fobo/arrival',
      content:`{"taskItemIndex":1}`,
      seriesInterval: 0.5
    },
    taskMoveStart:{
      topic:'rvautotech/fobo/departure',
      content:`{"taskItemIndex":0}`,
      seriesInterval: 0.5
    },
    mode:{
      content: JSON.stringify({
        robotId: "J6-RV-FR-001",
        state: "MAPPING",
        followMeStandalone: false,
        manual: false
      }),
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/state'
    },
    wifi:{
      content: JSON.stringify([
        { ssid: "Fake Wifi 1",  signal: 3, preSharedKey : true} , 
        { ssid: "Fake Wifi 2",  signal: 4, preSharedKey : true} , 
        { ssid: "Fake Wifi 3",  signal: 3, preSharedKey : true} , 
        { ssid: "Fake Wifi 4",  signal: 2, preSharedKey : true , inUse : true} , 
        { ssid: "Fake Wifi 5",  signal: 1, preSharedKey : true} , 
        { ssid: "Fake Wifi 6",  signal: 2, preSharedKey : true} , 
        { ssid: "Fake Wifi 7",  signal: 1, preSharedKey : true} , 
        { ssid: "Fake Wifi 8",  signal: 2, preSharedKey : true} , 
        { ssid: "Fake Wifi 9",  signal: 1, preSharedKey : true} 
      ]),
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/wifi'
    },
    obstacleDetection:{
      content: JSON.stringify({
        robotId: 'ROBOT-01',
        detected: true
      }),
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/obstacle/detection'
    },
    cabinet:{
      content: JSON.stringify({
        "robotId": "J6-RV-FR-001",
        "doorList": [
          {
            "id": 1,
            "status": "CLOSED",
            "trayFull": false,
            "lightOn": false
          },
          {
            "id": 2,
            "status": "CLOSED",
            "trayFull": false,
            "lightOn": false
          },
          {
            "id": 3,
            "status": "CLOSED",
            "trayFull": false,
            "lightOn": false
          }
        ]
      }),
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/cabinet'
    },
    cellular:{
      content: JSON.stringify({
        robotId: 'ROBOT-01',
        bars: '4/5'
      }),
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/cellular'
    },
    ieq:{
      content: JSON.stringify({
        robotId: 'ROBOT-01',
         ieq:{
          co: 1,
          co2 : 2,
          hcho : 3,
          light : 4,
          no2 : 5,
          noise_moy : 6,
          noise_max : 7,
          o3: 8,
          p : 9,
          pm1: 10,
          pm2_5: 11, 
          pm10: 12,
          rh : 13,
          t : 14,
          tvoc_mos : 15,
          tvoc_pid: 16
         }
      }),
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/ieq'
    },
    battery: {
      content: JSON.stringify([
        {
          robotId: 'ROBOT-01',
          percentage: 0.77
        },
        {
          robotId: 'ROBOT-01',
          percentage: 0.76
        },
        {
          robotId: 'ROBOT-01',
          percentage: 0.75
        },
        {
          robotId: 'ROBOT-01',
          percentage: 0.74
        },
        {
          robotId: 'ROBOT-01',
          percentage: 0.73
        },
      ]),
      seriesInterval: 10,
      topic: 'rvautotech/fobo/battery'
    },
    brake: {
      content: JSON.stringify({
        robotId: 'ROBOT-01',
        switchedOn: true
      }),
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/brake'
    },
    pose:{
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/pose',
      content : `[{"robotId":"J6-RV-FR-001","mapName":"5W_2022","x":-0.005500810045392157,"y":-0.0028780331186872843,"angle":-0.0016407569922452046}]`
    },
    lidar:{
      seriesInterval: 0.5,
      topic: 'rvautotech/fobo/lidar',
      content : `{
        "robotId": "J6-RV-FR-001",
        "mapName": "5W_0429",
        "pointList": [
          {
            "x": 1.9672983884811401,
            "y": 1.8787097930908203
          },
          {
            "x": 1.9665380716323853,
            "y": 1.866902470588684
          },
          {
            "x": 1.9650241136550903,
            "y": 1.8549879789352417
          },
          {
            "x": 1.964506983757019,
            "y": 1.8431344032287598
          },
          {
            "x": 1.9641087055206299,
            "y": 1.8312633037567139
          },
          {
            "x": 1.9696950912475586,
            "y": 1.8201162815093994
          },
          {
            "x": 1.9686931371688843,
            "y": 1.808152198791504
          },
          {
            "x": 1.9735336303710938,
            "y": 1.7969837188720703
          },
          {
            "x": 1.9736096858978271,
            "y": 1.7851431369781494
          },
          {
            "x": 1.9729959964752197,
            "y": 1.773160696029663
          },
          {
            "x": 1.972346544265747,
            "y": 1.7611274719238281
          },
          {
            "x": 1.9729728698730469,
            "y": 1.7492763996124268
          },
          {
            "x": 1.9735443592071533,
            "y": 1.7373887300491333
          },
          {
            "x": 1.9724985361099243,
            "y": 1.7251516580581665
          },
          {
            "x": 1.9733208417892456,
            "y": 1.713240623474121
          },
          {
            "x": 1.9752297401428223,
            "y": 1.701535701751709
          },
          {
            "x": 1.9697669744491577,
            "y": 1.6881595849990845
          },
          {
            "x": 1.9738572835922241,
            "y": 1.6768747568130493
          },
          {
            "x": 1.9763789176940918,
            "y": 1.6652328968048096
          },
          {
            "x": 1.973029375076294,
            "y": 1.652100682258606
          },
          {
            "x": 1.9767794609069824,
            "y": 1.6407134532928467
          },
          {
            "x": 1.9784810543060303,
            "y": 1.6287832260131836
          },
          {
            "x": 1.9774454832077026,
            "y": 1.6160571575164795
          },
          {
            "x": 1.9834845066070557,
            "y": 1.6053048372268677
          },
          {
            "x": 1.9798636436462402,
            "y": 1.59170663356781
          },
          {
            "x": 1.976691722869873,
            "y": 1.5781127214431763
          },
          {
            "x": 1.979042649269104,
            "y": 1.56615149974823
          },
          {
            "x": 1.9808911085128784,
            "y": 1.553999423980713
          },
          {
            "x": 1.9834961891174316,
            "y": 1.5420658588409424
          },
          {
            "x": 1.9846839904785156,
            "y": 1.5296138525009155
          },
          {
            "x": 1.9819408655166626,
            "y": 1.515699863433838
          },
          {
            "x": 1.9797024726867676,
            "y": 1.5018362998962402
          },
          {
            "x": 1.9809917211532593,
            "y": 1.4891767501831055
          },
          {
            "x": 1.9781520366668701,
            "y": 1.4748550653457642
          },
          {
            "x": 1.9769628047943115,
            "y": 1.4610430002212524
          },
          {
            "x": 1.9790687561035156,
            "y": 1.4484580755233765
          },
          {
            "x": 1.9827684164047241,
            "y": 1.4364867210388184
          },
          {
            "x": 1.9897305965423584,
            "y": 1.4258900880813599
          },
          {
            "x": 1.989120364189148,
            "y": 1.4120131731033325
          },
          {
            "x": 1.9818214178085327,
            "y": 1.3950138092041016
          },
          {
            "x": 1.982460379600525,
            "y": 1.3814024925231934
          },
          {
            "x": 1.982777714729309,
            "y": 1.3675414323806763
          },
          {
            "x": 1.9810373783111572,
            "y": 1.3525816202163696
          },
          {
            "x": 1.984379768371582,
            "y": 1.339965581893921
          },
          {
            "x": 1.9820854663848877,
            "y": 1.324465036392212
          },
          {
            "x": 1.9822030067443848,
            "y": 1.3100268840789795
          },
          {
            "x": 1.985565423965454,
            "y": 1.2971638441085815
          },
          {
            "x": 1.986025333404541,
            "y": 1.2826855182647705
          },
          {
            "x": 1.99366295337677,
            "y": 1.272007703781128
          },
          {
            "x": 1.9965808391571045,
            "y": 1.258724331855774
          },
          {
            "x": 1.9854176044464111,
            "y": 1.2373325824737549
          },
          {
            "x": 1.9852581024169922,
            "y": 1.2219334840774536
          },
          {
            "x": 1.985787034034729,
            "y": 1.2067831754684448
          },
          {
            "x": 1.991969347000122,
            "y": 1.1949070692062378
          },
          {
            "x": 1.9928511381149292,
            "y": 1.1797407865524292
          },
          {
            "x": 1.990869402885437,
            "y": 1.1626226902008057
          },
          {
            "x": 1.980393409729004,
            "y": 1.1398290395736694
          },
          {
            "x": 1.9777605533599854,
            "y": 1.1217256784439087
          },
          {
            "x": -0.9162338376045227,
            "y": -0.8243995308876038
          },
          {
            "x": -0.835849940776825,
            "y": -0.8232772350311279
          },
          {
            "x": -0.7903231382369995,
            "y": -0.8448595404624939
          },
          {
            "x": -0.7782213687896729,
            "y": -0.8894774317741394
          },
          {
            "x": -0.7396490573883057,
            "y": -0.9154194593429565
          },
          {
            "x": -0.7323909401893616,
            "y": -0.9639236927032471
          },
          {
            "x": -0.747251033782959,
            "y": -1.0294058322906494
          },
          {
            "x": -0.7435011267662048,
            "y": -1.0818840265274048
          },
          {
            "x": -0.7509958148002625,
            "y": -1.1436846256256104
          },
          {
            "x": -0.7506275177001953,
            "y": -1.2002702951431274
          },
          {
            "x": -0.7558069825172424,
            "y": -1.2620753049850464
          },
          {
            "x": -0.9241551160812378,
            "y": -1.550987720489502
          },
          {
            "x": -0.8500384092330933,
            "y": -1.551024079322815
          },
          {
            "x": -0.7633897066116333,
            "y": -1.5388861894607544
          },
          {
            "x": -0.6637645363807678,
            "y": -1.5135819911956787
          },
          {
            "x": -0.610251247882843,
            "y": -1.527567982673645
          },
          {
            "x": -0.5567825436592102,
            "y": -1.5408744812011719
          },
          {
            "x": -0.5106861591339111,
            "y": -1.5603150129318237
          },
          {
            "x": -0.4761466681957245,
            "y": -1.5902084112167358
          },
          {
            "x": -0.4536023437976837,
            "y": -1.6315522193908691
          },
          {
            "x": -0.5199309587478638,
            "y": -1.760360836982727
          },
          {
            "x": -0.5211942195892334,
            "y": -1.8276257514953613
          },
          {
            "x": -0.5166462659835815,
            "y": -1.8901934623718262
          },
          {
            "x": -0.5133677124977112,
            "y": -1.9551113843917847
          },
          {
            "x": -0.5960541367530823,
            "y": -2.1115596294403076
          },
          {
            "x": -0.696076512336731,
            "y": -2.2909162044525146
          },
          {
            "x": -0.7019374966621399,
            "y": -2.372864007949829
          },
          {
            "x": -0.6356481313705444,
            "y": -2.376518964767456
          },
          {
            "x": -0.5483750104904175,
            "y": -2.3554065227508545
          },
          {
            "x": -0.47881630063056946,
            "y": -2.352673053741455
          },
          {
            "x": -0.42064011096954346,
            "y": -2.3619582653045654
          },
          {
            "x": -0.344558447599411,
            "y": -2.349113702774048
          },
          {
            "x": -0.3243808150291443,
            "y": -2.4023358821868896
          },
          {
            "x": -0.3110983371734619,
            "y": -2.464836359024048
          },
          {
            "x": -0.305088609457016,
            "y": -2.5375850200653076
          },
          {
            "x": 0.9134411811828613,
            "y": -1.1753305196762085
          }
        ]
      }`
    }
    // pose: {
    //   content: JSON.stringify(this.getPoseList().map(p => {
    //     return {
    //       robotId: 'ROBOT-01',
    //       mapName: '5W',
    //       x: p[0],
    //       y: p[1],
    //       angle: 0
    //     }
    //   })
    //   ),
    //   seriesInterval: 0.5,
    //   topic: 'rvautotech/fobo/pose'
    // }
  }
}