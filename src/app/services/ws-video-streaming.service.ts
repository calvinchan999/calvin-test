import { Injectable } from '@angular/core';

const restartPause = 2000

@Injectable({
  providedIn: 'root'
})
export class WsVideoStreamingService {
  terminated = false;
  ws = null;
  pc = null;
  restartTimeout = null;
  videoHtml : HTMLMediaElement
  wsUrl // testing
  constructor() {

	}

  close(){
    this.terminated = true
    if(this.ws){
      this.ws.close()
    }
  }

	start(htmlEl : HTMLMediaElement , wsUrl : string  ) {
    this.terminated = false
    this.videoHtml = htmlEl
    this.wsUrl = wsUrl
		console.log("connecting " + wsUrl);
 
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onerror = () => {
            console.log("ws error");
            if (this.ws === null) {
                return;
            }
            this.ws.close();
            this.ws = null;
        };

        this.ws.onclose = () => {
            console.log("ws closed");
            this.ws = null;
            this.scheduleRestart();            
        };

        this.ws.onmessage = (msg) => this.onIceServers(msg);
	}

    onIceServers(msg) {
        if (this.ws === null) {
            return;
        }

        const iceServers = JSON.parse(msg.data);

        this.pc = new RTCPeerConnection({
            iceServers,
        });

        this.ws.onmessage = (msg) => this.onRemoteDescription(msg);
        this.pc.onicecandidate = (evt) => this.onIceCandidate(evt);

        this.pc.oniceconnectionstatechange = () => {
            if (this.pc === null) {
                return;
            }

            console.log("peer connection state:", this.pc.iceConnectionState);

            switch (this.pc.iceConnectionState) {
            case "disconnected":
                this.scheduleRestart();
            }
        };

        this.pc.ontrack = (evt) => {
            console.log("new track " + evt.track.kind);
            this.videoHtml.srcObject = evt.streams[0];
        };

        const direction = "sendrecv";
        this.pc.addTransceiver("video", { direction });
        this.pc.addTransceiver("audio", { direction });

        this.pc.createOffer()
            .then((desc) => {
                if (this.pc === null || this.ws === null) {
                    return;
                }

                this.pc.setLocalDescription(desc);

                console.log("sending offer");
                this.ws.send(JSON.stringify(desc));
            });
    }

	onRemoteDescription(msg) {
		if (this.pc === null || this.ws === null) {
			return;
		}

		this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.data)));
		this.ws.onmessage = (msg) => this.onRemoteCandidate(msg);
	}

    onIceCandidate(evt) {
        if (this.ws === null) {
            return;
        }

        if (evt.candidate !== null) {
            if (evt.candidate.candidate !== "") {
                this.ws.send(JSON.stringify(evt.candidate));
            }
        }
    }

	onRemoteCandidate(msg) {
		if (this.pc === null) {
			return;
		}

		this.pc.addIceCandidate(JSON.parse(msg.data));
	}

  scheduleRestart() {
    if (this.terminated) {
      return;
    }

    if (this.ws !== null) {
      this.ws.close();
      this.ws = null;
    }

    if (this.pc !== null) {
      this.pc.close();
      this.pc = null;
    }

    this.restartTimeout = window.setTimeout(() => {
      this.restartTimeout = null;
      if(!this.terminated){
        this.start(this.videoHtml , this.wsUrl);
      }
    }, restartPause);
  }
}
