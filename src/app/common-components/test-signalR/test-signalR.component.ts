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
    this.getArcsPoseContent()
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

  getArcsPoseContent(){
    const test = `-5.2,8.5,5
    -4.8,7.5,5
    -4.6,6.5,5
    -4.4,4.5,5
    -4.2,3.4,5
    -4,2.3,5
    -3.8,1.2,5
    -3.4,0.2,5
    -3.4,0.2,-0.7
    -3.4,0.2,0.2
    -2.5,0.2,0.2
    -1,0.2,0.2    
    `
    let ret = []
    test.split("\n").filter(s=>s.trim().length > 0).forEach(str=> {
      let splited = str.split(",")
      let x = Number(splited[0].trim())
      let y = Number(splited[1])
      let angle = Number(splited[2])
      ret.push({
        robotId : "RV-ROBOT-102" , 
        mapName : "TEST_5W_GF",
        x : x,
        y : y,
        angle : angle
      })
    })
    return JSON.stringify(ret)
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
        "timestamp": 1683707877000,
        "pose": {
          "mapName" : "5W2023",
          "x" : 0,
          "y" : 0 ,
          "angle" : 0
        },
        "detectionType": "HIGH_BODY_TEMPERATURE",
        "base64Image": "${highBodyTempBase64}",
        "metadata": "",
        "count": 1,
        "confidence": 0.851
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
      topic: 'rvautotech/fobo/ARCS/robot/nextPoint/RV-ROBOT-418',
      content : `
     {
      "robotCode":"RV-ROBOT-418",
      "pointCode":"WP-07"
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
      seriesInterval: 2,
      topic: 'rvautotech/fobo/pose/TEST_5W_GF',
      content: this.getArcsPoseContent()
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
        robotId: 'RV-ROBOT-104',
          co_ppb: 1.8,
          co2_ppm : 1600,
          hcho_ppb : 60,
          light_lux : 4,
          no2_ppb : 5,
          noise_dB : 6,
          o3_ppb: 8,
          p_mb : 9,
          pm1_ugPerM3: 10,
          pm2_ugPerM3: 11, 
          pm10_ugPerM3: 12,
          rh_percent : 13,
          t_degreeC : 14,
          tvoc_ppb : 90
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
            "x": 1.8672983884811401,
            "y": 1.8787097930908203
          },
          {
            "x": 1.8665380716323853,
            "y": 1.866902470588684
          },
          {
            "x": 1.8650241136550903,
            "y": 1.8549879789352417
          },
          {
            "x": 1.864506983757019,
            "y": 1.8431344032287598
          },
          {
            "x": 1.8641087055206299,
            "y": 1.8312633037567139
          },
          {
            "x": 1.8696950912475586,
            "y": 1.8201162815093994
          },
          {
            "x": 1.8686931371688843,
            "y": 1.808152198791504
          },
          {
            "x": 1.8735336303710938,
            "y": 1.7969837188720703
          },
          {
            "x": 1.8736096858978271,
            "y": 1.7851431369781494
          },
          {
            "x": 1.8729959964752197,
            "y": 1.773160696029663
          },
          {
            "x": 1.872346544265747,
            "y": 1.7611274719238281
          },
          {
            "x": 1.8729728698730469,
            "y": 1.7492763996124268
          },
          {
            "x": 1.8735443592071533,
            "y": 1.7373887300491333
          },
          {
            "x": 1.8724985361099243,
            "y": 1.7251516580581665
          },
          {
            "x": 1.8733208417892456,
            "y": 1.713240623474121
          },
          {
            "x": 1.8752297401428223,
            "y": 1.701535701751709
          },
          {
            "x": 1.8697669744491577,
            "y": 1.6881595849990845
          },
          {
            "x": 1.8738572835922241,
            "y": 1.6768747568130493
          },
          {
            "x": 1.8763789176940918,
            "y": 1.6652328968048096
          },
          {
            "x": 1.873029375076294,
            "y": 1.652100682258606
          },
          {
            "x": 1.8767794609069824,
            "y": 1.6407134532928467
          },
          {
            "x": 1.8784810543060303,
            "y": 1.6287832260131836
          },
          {
            "x": 1.8774454832077026,
            "y": 1.6160571575164795
          },
          {
            "x": 1.8834845066070557,
            "y": 1.6053048372268677
          },
          {
            "x": 1.8798636436462402,
            "y": 1.59170663356781
          },
          {
            "x": 1.876691722869873,
            "y": 1.5781127214431763
          },
          {
            "x": 1.879042649269104,
            "y": 1.56615149974823
          },
          {
            "x": 1.8808911085128784,
            "y": 1.553999423980713
          },
          {
            "x": 1.8834961891174316,
            "y": 1.5420658588409424
          },
          {
            "x": 1.8846839904785156,
            "y": 1.5296138525009155
          },
          {
            "x": 1.8819408655166626,
            "y": 1.515699863433838
          },
          {
            "x": 1.8797024726867676,
            "y": 1.5018362998962402
          },
          {
            "x": 1.8809917211532593,
            "y": 1.4891767501831055
          },
          {
            "x": 1.8781520366668701,
            "y": 1.4748550653457642
          },
          {
            "x": 1.8769628047943115,
            "y": 1.4610430002212524
          },
          {
            "x": 1.8790687561035156,
            "y": 1.4484580755233765
          },
          {
            "x": 1.8827684164047241,
            "y": 1.4364867210388184
          },
          {
            "x": 1.8897305965423584,
            "y": 1.4258900880813599
          },
          {
            "x": 1.889120364189148,
            "y": 1.4120131731033325
          },
          {
            "x": 1.8818214178085327,
            "y": 1.3950138092041016
          },
          {
            "x": 1.882460379600525,
            "y": 1.3814024925231934
          },
          {
            "x": 1.882777714729309,
            "y": 1.3675414323806763
          },
          {
            "x": 1.8810373783111572,
            "y": 1.3525816202163696
          },
          {
            "x": 1.884379768371582,
            "y": 1.339965581893921
          },
          {
            "x": 1.8820854663848877,
            "y": 1.324465036392212
          },
          {
            "x": 1.8822030067443848,
            "y": 1.3100268840789795
          },
          {
            "x": 1.885565423965454,
            "y": 1.2971638441085815
          },
          {
            "x": 1.886025333404541,
            "y": 1.2826855182647705
          },
          {
            "x": 1.89366295337677,
            "y": 1.272007703781128
          },
          {
            "x": 1.8965808391571045,
            "y": 1.258724331855774
          },
          {
            "x": 1.8854176044464111,
            "y": 1.2373325824737549
          },
          {
            "x": 1.8852581024169922,
            "y": 1.2219334840774536
          },
          {
            "x": 1.885787034034729,
            "y": 1.2067831754684448
          },
          {
            "x": 1.891969347000122,
            "y": 1.1949070692062378
          },
          {
            "x": 1.8928511381149292,
            "y": 1.1797407865524292
          },
          {
            "x": 1.890869402885437,
            "y": 1.1626226902008057
          },
          {
            "x": 1.880393409729004,
            "y": 1.1398290395736694
          },
          {
            "x": 1.8777605533599854,
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
            "y": -1.8551113843917847
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

const highBodyTempBase64 = `data:image/png;base64,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`