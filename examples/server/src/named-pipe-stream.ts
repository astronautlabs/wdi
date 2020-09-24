import net from 'net';
import fs from 'fs';
import os from 'os';

let counter = 0;

export class NamedPipeStream {
  constructor (stream, onSocket) {
    let path : string;
    const osType = os.type();

    if (osType === 'Windows_NT') {
      path = '\\\\.\\pipe\\stream' + (++counter);
      this.url = path;
    } else {
      path = './' + (++counter) + '.sock';
      this.url = 'unix:' + path;
    }

    try {
      fs.statSync(path);
      fs.unlinkSync(path);
    } catch (err) {
      // no-op
    }

    const server = net.createServer(socket => {  
      socket.addListener('error', err => {
        console.log(`[NamedPipe] Socket error: ${err}`);
      });
      onSocket(socket);
    });
    
    stream.on('error', err => {
        console.log(`[netsrv] Error: ${err}`);
    })
    stream.on('finish', () => {
        console.log(`[namedpipe] Stream finished`);
        server.close()
    });
    server.listen(path);
  }

  url : string;
}

export class NamedPipeInputStream extends NamedPipeStream {
    constructor(stream) {
        super(stream, socket => {
          stream.pipe(socket);
        });
    }
}

export class NamedPipeOutputStream extends NamedPipeStream {
    constructor(stream) {
        super(stream, socket => {
          socket.pipe(stream);
        });
    }
}