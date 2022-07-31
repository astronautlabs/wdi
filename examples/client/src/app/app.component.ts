import { Component } from '@angular/core';
import { WDIClient, StreamIdentity } from '@astronautlabs/wdi';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  client : WDIClient;

  async ngOnInit() {
    let devices = await navigator.mediaDevices.enumerateDevices();
    this.devices = devices;
    this.hasPermission = this.devices.length === 0 || this.devices[0].label !== '';
  }

  stream : MediaStream;
  screenStream : MediaStream;
  serverUrl : string = 'ws://localhost:3000/wdi';
  rtmpUrl : string = `rtmp://rtmp.astronautlabs.com/wditest1`; // NO-COMMIT

  hasPermission = false;
  mediaType : string = 'webcam';
  audioInputId : string;
  videoInputId : string;
  mediaUrl = 'https://media.w3.org/2010/05/sintel/trailer.mp4';
  mode : string = null;
  receiveIdentity = `https://altestvideos.sfo2.digitaloceanspaces.com/Sync-Footage-V1-H264.mp4`;
  get uiState() {
    if (!this.mode)
      return 'chooseMode';
    
    if (this.mode === 'send') {
      if (!this.hasPermission)
        return 'needsPermission';
      else if (!this.stream)
        return 'deviceSelect';
      
      return 'sending';
    } else if (this.mode === 'receive') {
      if (this.client)
        return 'receiving';
      else
        return 'setupReceive';
    }
  }

  async acquirePermission() {
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(x => x.stop());
      this.hasPermission = true;
    } catch (e) {
      alert(`Could not access your webcam: ${e.message}`);
      console.error(e);
    }
  }

  async acquireCamera() {

    if (this.mediaType === 'webcam') {
      try {
        console.log(`[WDI/example-client] Opening camera`);

        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            deviceId: this.audioInputId,
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
            latency: 0
          }, 
          video: { 
            width: 1280, 
            height: 720,
            deviceId: this.videoInputId
          }
        });
        console.log(`[WDI/example-client] Acquired stream with ${this.stream.getTracks().length}`);
      } catch (e) {
        alert(`An error occurred while opening your camera: ${e.message}`);
        return;
      }
    } else if (this.mediaType === 'html5') {
      let video = document.createElement('video');
      video.src = this.mediaUrl;
      video.muted = true;
      video.autoplay = true;
      video.crossOrigin = 'anonymous';
      //video.style.visibility = 'hidden';
      video.loop = true;

      video.addEventListener('loadeddata', () => {
        let stream = (<any>video).captureStream(0);
        this.stream = stream;
      });
      document.body.appendChild(video);
    }
  }

  devices : MediaDeviceInfo[] = [];
  connected = false;

  get audioInputs() {
    return this.devices.filter(x => x.kind === 'audioinput');
  }

  get videoInputs() {
    return this.devices.filter(x => x.kind === 'videoinput');
  }

  errorMessage : string;

  async startReceiving() {
    this.client = new WDIClient(this.serverUrl);
    await this.client.connect();

    console.log(`Acquiring stream...`);
    let identity : StreamIdentity;
    
    if (this.receiveIdentity.startsWith('{'))
      identity = JSON.parse(this.receiveIdentity);
    else
      identity = { url: this.receiveIdentity };

    let stream = await this.client.acquireStream(identity);
    alert('Acquired stream!');
    this.stream = stream;
  }

  async startSending() {
    await this.acquireCamera();
    this.client = new WDIClient(this.serverUrl);

    this.client.closed.subscribe(() => {
      this.errorMessage = 'Disconnected from WDI service';
      this.stream = null;
    })

    await this.client.addStream(this.stream, {
      name: 'foobar',
      destination: this.rtmpUrl
    });

    this.connected = false;
    console.log(`[WDI/example-client] Connecting to WDI server ${this.serverUrl}`);
    await this.client.connect();
    console.log(`[WDI/example-client] Connected successfully.`);
    this.connected = true;
  }
}
