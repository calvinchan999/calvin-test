import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import * as flvjs from 'flv.js/dist/flv.min.js';
import { UiService } from 'src/app/services/ui.service';
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
  @Input() src =`https://d1--ov-gotcha07.bilivideo.com/live-bvc/735291/live_411182763_87894717_1500.flv?expires=1652343761&len=0&oi=3674148446&pt=web&qn=0&trid=100037cc4ed86ff6415090dc915e9854188c&sigparams=cdn,expires,len,oi,pt,qn,trid&cdn=ov-gotcha07&sign=bd897eee1f15fdce2d9df16edba18d2f&sk=2935686d6cb9146c7a6a6a0b4e120e2557adc0b48de99725a5887e843ee476a1&p2p_type=0&src=909441&sl=2&free_type=0&flowtype=1&machinezone=ylf&pp=srt&source=onetier&order=1&site=5c1dfe9cfd8af12868b0fe7619258a9d`
  @Input() width = 800
  @Input() height = 450
  player 
  constructor(private elementRef: ElementRef, private uiSrv: UiService) {
    // rtsp.RTSP_CONFIG['websocket.url'] = "ws://127.0.0.1:8090/ws";
  }

  ngOnInit() { }
  // Instantiate a Video.js player OnInit
  ngAfterViewInit() {
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
