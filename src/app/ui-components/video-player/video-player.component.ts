import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation, Output, EventEmitter, HostBinding, HostListener } from '@angular/core';
import * as flvjs from 'flv.js/dist/flv.min.js';
import { UiService } from 'src/app/services/ui.service';
import { WsVideoStreamingService } from 'src/app/services/ws-video-streaming.service';
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
  @ViewChild('video') videoElRef: ElementRef
  @Input() src = this.util.config.IP_CAMERA_URL
  @Input() width = 800
  @Input() height = 450
  player
  @Input() isAzure = false
  @Output() ended: EventEmitter<any> = new EventEmitter();
  @Output() seeking: EventEmitter<any> = new EventEmitter();
  @HostBinding('class') cssClass = 'video-player'
  terminated = false;
  ws = null;
  pc = null;
  restartTimeout = null;

  constructor(private elementRef: ElementRef, private uiSrv: UiService, public util: GeneralUtil, public wsStremingSrv: WsVideoStreamingService) {
    // rtsp.RTSP_CONFIG['websocket.url'] = "ws://127.0.0.1:8090/ws";
  }

  @HostListener('window:resize', ['$event'])
  refreshWidthHeight() {
    this.height = Math.floor(window.innerHeight * 0.575)
    this.width = Math.floor(this.height * 16 / 9)
    if (this.isAzure) {
      let player: amp.Player = this.player
      player.width(this.width + 'px')
      player.height(this.height + 'px')
    }
  }

  ngOnInit() { }
  // Instantiate a Video.js player OnInit
  ngAfterViewInit() {
    if (this.isAzure) {
      this.player = amp('vid1');
      let player: amp.Player = this.player
      player.addEventListener('error', (e) => {
        console.log(e)
      })

      setTimeout(() => {
        this.refreshWidthHeight()
        player.autoplay(true);
        player.controls(true);
        player.src({
          type: "application/dash+xml",
          src: this.src,
        });
      })
    } else if (this.util.arcsApp) {
      this.wsStremingSrv.start(this.videoElRef.nativeElement, this.src)
    } else {
      if (flvjs.isSupported()) {
        this.loadFlv()
      } else {
        console.log('FLV player not supported')
      }
    }
  }

  unload() {
    if (this.isAzure) {
      this.player.dispose()
    }
    else if (this.util.arcsApp) {
      this.wsStremingSrv.close()
    } else {
      this.player.unload();
      this.player.destroy()
    }
  }

  loadFlv() {
    var videoElement = this.videoElRef.nativeElement
    this.player = flvjs.createPlayer({
      type: 'flv',
      url: this.src,
      isLive: true
    }, { enableStashBuffer: true });
    this.player.attachMediaElement(videoElement);
    this.player.muted = true
    this.player.on(flvjs.Events.ERROR, (err) => {
      if (err === flvjs.ErrorTypes.NETWORK_ERROR) {
        this.uiSrv.showNotificationBar("Disconnected from video streaming source ... trying to reconnect ...", 'error')
        setTimeout(() => {
          this.refreshFlvUrl()
          this.unload()
          this.loadFlv()
        }, 3000)
      }
    })
    this.player.load();
    this.player.play();
  }

  refreshFlvUrl() {

  }

  ngOnDestroy() {
    this.unload()
  }

}
