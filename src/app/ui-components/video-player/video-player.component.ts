import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation , Output  ,EventEmitter , HostBinding} from '@angular/core';
import * as flvjs from 'flv.js/dist/flv.min.js';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
// import WebsocketTransport from 'html5_rtsp_player/src/transport/websocket.js';
// import RTSPClient from 'html5_rtsp_player/src/client/rtsp/client.js';
// import HLSClient from 'html5_rtsp_player/src/client/hls/client.js';

@Component({
  selector: 'uc-video-player',
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.scss'],
})

export class VideoPlayerComponent implements OnInit, OnDestroy {
  @ViewChild('video') videoElRef : ElementRef
  @Input() src = this.util.config.IP_CAMERA_URL
  @Input() width = 800
  @Input() height = 450
  player 
  @Input() isAzure = false
  @Output() ended: EventEmitter<any> = new EventEmitter();
  @Output() seeking: EventEmitter<any> = new EventEmitter();
  @HostBinding('class') cssClass = 'video-player' 
    
  constructor(private elementRef: ElementRef, private uiSrv: UiService , private util : GeneralUtil) {
    // rtsp.RTSP_CONFIG['websocket.url'] = "ws://127.0.0.1:8090/ws";
  }

  ngOnInit() { }
  // Instantiate a Video.js player OnInit
  ngAfterViewInit() {
    if(this.isAzure){
      this.player = amp('vid1' );
      let player : amp.Player = this.player 
      player.addEventListener('error',(e)=>{
        console.log(e)
      })      
      player.autoplay(true);
      player.controls(true);
      player.src({
          type: "application/dash+xml",
          src: this.src,
      });

    }else{
      if (flvjs.isSupported()) {   
        this.loadFlv()
      } else {
        console.log('FLV player not supported')
      }
    }
  }

  unload(){
    if(!this.isAzure){
      this.player.unload();
      this.player.destroy()
    }else{
      this.player.dispose()
    }
  }

  loadFlv(){
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
          this.loadFlv()
        }, 3000)
      }
    })
    this.player.load();
    this.player.play();
  }

  refreshFlvUrl(){
 
  }  

  ngOnDestroy() {
    console.log('onDestroy')
    this.unload()
  }

}
