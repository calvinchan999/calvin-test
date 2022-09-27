import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import * as flvjs from 'flv.js/dist/flv.min.js';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
// import WebsocketTransport from 'html5_rtsp_player/src/transport/websocket.js';
// import RTSPClient from 'html5_rtsp_player/src/client/rtsp/client.js';
// import HLSClient from 'html5_rtsp_player/src/client/hls/client.js';

@Component({
  selector: 'app-video-player',
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.scss'],
})

export class VideoPlayerComponent implements OnInit, OnDestroy {
  @ViewChild('video') videoElRef : ElementRef
  @Input() src = this.util.config.IP_CAMERA_URL
  @Input() width = 800
  @Input() height = 450
  player 
  constructor(private elementRef: ElementRef, private uiSrv: UiService , private util : GeneralUtil) {
    // rtsp.RTSP_CONFIG['websocket.url'] = "ws://127.0.0.1:8090/ws";
  }

  ngOnInit() { }
  // Instantiate a Video.js player OnInit
  ngAfterViewInit() {
    console.log(this.src)
    if (flvjs.isSupported()) {   
      this.load()
    } else {
      console.log('FLV player not supported')
    }

  }

  unload(){
    this.player.unload();
    this.player.destroy()
  }

  load(){
    var videoElement = this.videoElRef.nativeElement
    this.player = flvjs.createPlayer({
      type: 'flv',
      url: this.src,
      isLive:true
    } , {enableStashBuffer : true});
    this.player.attachMediaElement(videoElement);
    this.player.muted = true
    this.player.on(flvjs.Events.ERROR, (err) => {
      if (err === flvjs.ErrorTypes.NETWORK_ERROR) {
        this.uiSrv.showNotificationBar("Disconnected from video streaming source ... trying to reconnect ...",'error')
        setTimeout(()=>{
          this.refreshFlvUrl()
          this.unload()
          this.load()
        }, 3000)
      }
    })
    this.player.load();
    this.player.play();
  }

  refreshFlvUrl(){
 
  }  

  ngOnDestroy() {
    this.unload()
  }

}
