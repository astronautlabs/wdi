import { Component } from '@angular/core';
import { WDIClient } from '@astronautlabs/wdi';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  client : WDIClient;

  ngOnInit() {
  }

  stream : MediaStream;
  serverUrl : string = 'ws://localhost:3000';

  async acquireCamera() {
    try {
      console.log(`[WDI/example-client] Opening camera`);

      let video : MediaTrackConstraints = { 
        width: 1280, 
        height: 720 
      };

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      console.log(`[WDI/example-client] Acquired stream with ${this.stream.getTracks().length}`);
    } catch (e) {
      alert(`An error occurred while opening your camera: ${e.message}`);
    }
  }

  connected = false;

  async startSending() {
    this.client = new WDIClient(this.serverUrl);
    await this.client.addStream(this.stream, 'my-webcam');

    this.connected = false;
    console.log(`[WDI/example-client] Connecting to WDI server ${this.serverUrl}`);
    await this.client.connect();
    console.log(`[WDI/example-client] Connected successfully.`);
    this.connected = true;
  }
}
