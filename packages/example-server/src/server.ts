import '@alterior/platform-nodejs';
import { WDIPeer } from '@astronautlabs/wdi';
import { RTCPeerConnection, RTCVideoSink, RTCAudioSink } from 'wrtc';
import { nonstandard as wrtcns } from 'wrtc';
const { RTCAudioSink, RTCVideoSink, i420ToRgba, rgbaToI420 } = wrtcns;

import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import { NamedPipeInputStream } from './named-pipe-stream';
import * as libyuv from 'libyuv';
import { Get, WebServer, WebServerEngine, WebService } from '@alterior/web-server';
import { RPCSession, SocketChannel } from '@astronautlabs/webrpc';
import { Application } from '@alterior/runtime';
import { ExpressEngine } from '@alterior/express';

WebServerEngine.default = ExpressEngine;
global['RTCPeerConnection'] = RTCPeerConnection;

export interface Frame {
    width : number;
    height : number;
    data : Uint8ClampedArray;
}

@WebService()
class WDIServer {
    @Get()
    async endpoint() {
        let socket = await WebServer.startSocket();
        let session = new RPCSession(new SocketChannel(socket));
        let peer = new WDIPeer();

        peer.remoteStreamAdded.subscribe(async identifiedStream => {
            let stream = identifiedStream.stream;
            let destinationUrl : string = identifiedStream.identity.destination;
        
            console.log(`[WDI/example-server] Received stream from client with ${stream.getTracks().length} tracks`);
            console.log(`[WDI/example-server] Identity:`);
            console.dir(identifiedStream.identity);
        
            identifiedStream.ended.subscribe(() => {
                console.log(`[WDI/example-server] Stream ${stream.id} has ended`);
            });
        
            stream.addEventListener('removetrack', () => {
                console.log(`[WDI/example-server] Track removed`);
            });
        
            stream.getTracks().forEach(track => track.addEventListener('ended', ev => {
                console.log(`[WDI/example-server] Track ended`);
            }));
        
            // This example is a simple WDI->RTMP gateway. 
            // We'll pipe incoming audio/video from the WDI client into ffmpeg, 
            // which will send it off via RTMP to a server of the client's 
            // choice.
        
            let videoPipe = new PassThrough();
            let audioPipe = new PassThrough();
            let videoTrack = stream.getVideoTracks()[0];
            let audioTrack = stream.getAudioTracks()[0];
            let outputSize = { width: 1920, height: 1080 };
            let outputSizeID = `${outputSize.width}x${outputSize.height}`;
            let ready = false;
            
            let initialize = async () => {
                return new Promise<void>((resolve, reject) => {
                    console.log(`[WDI/example-server] Initializing for output resolution ${outputSizeID}`);
        
                    let proc = ffmpeg()
                        .addInput(new NamedPipeInputStream(videoPipe).url)
                        .addInputOptions([
                            '-f', 'rawvideo', '-pixel_format', 'yuv420p',
                            '-video_size', `${outputSizeID}`, '-r', '30'
                        ])
                        .addInput(new NamedPipeInputStream(audioPipe).url)
                        .addInputOptions([
                            '-f s16le', '-ar 48k', '-ac 1',
                        ])
                        .on('stderr', function(line : string) {
                            if (!line.startsWith('frame='))
                                console.log(`[ffmpeg/stderr] ${line}`);
                        })
                        .on('stdout', function(line) {
                            console.log(`[ffmpeg/stdout] ${line}`);
                        })
                        .on('start', (commandLine)=>{
                            console.log(`[ffmpeg] Started: ${commandLine}`);
                            ready = true;
                            resolve();
                        })
                        .on('error', (error)=>{
                            console.log(`[ffmpeg] Error: ${error}`);
                        })
                        .on('end', ()=>{
                            console.log('ffmpeg ended');
                        })
                        .size(outputSizeID)
                        .format('flv')
                        .outputOption(
                            '-q:v', '3'
                        )
                        .output(destinationUrl)
                    ;
        
                    console.log(`[WDI/example-server] Starting ffmpeg`);
                    try {
                        proc.run();
                    } catch (e) {
                        console.log(`[WDI/example-server] ffmpeg run() failed: ${e}`);
                    }
        
                    console.log(`[WDI/example-server] ffmpeg was started`);
        
                    identifiedStream.ended.subscribe(() => {
                        console.log(`[WDI/example-server] Stream ${stream.id} has ended, stopping ffmpeg...`);
                        proc.kill('SIGTERM');
                    });
                });
            };
        
            await initialize();
        
            let videoSink = new RTCVideoSink(videoTrack);
            let audioSink = new RTCAudioSink(audioTrack);
        
            let frameCounter = 0;
            let second = 0;
            let firstFps = true;
            let size = null;
            let isFrameRendering = false;
            let frameTime = 0;
            let videoBitrate = 0;
            let droppedFrames = 0;
        
            let audioSecond = 0;
            let audioCallsPerSecondCounter = 0;
            let audioCallsPerSecond = 0;
            let outputFrameI420 : Frame = { 
                width: outputSize.width, 
                height: outputSize.height, 
                data: new Uint8ClampedArray(outputSize.width * outputSize.height * 1.5) 
            };
            let audioBufferSize = 0;
            let audioSampleRateCounter = 0;
            let audioSampleRate = 0;
            let audioSamplesProcessed = 0;
            let audioBufferMs = 0;
            let missedFrames = 0;
        
            let handleFrame = async (frame : Frame) => {
                if (!ready)
                    return;
                
                let width : number = frame.width;
                let height : number = frame.height;
                let data : Uint8ClampedArray = frame.data;
                let currentSizeID = `${width}x${height}`;
                
                if (size !== currentSizeID) {
                    size = currentSizeID;
                    console.log(`[WDI/example-server] Video resolution changed to ${size}`);
                }
        
                let frameStartedAt = Date.now();
        
                frameCounter += 1;
                videoBitrate += width * height * 1.5;
        
                let currentSecond = Math.floor(Date.now() / 1000);
        
                if (currentSecond !== second) {
                    if (currentSecond > second + 1) {
                        console.log(`[WDI/example-server] Video rendering fell ${currentSecond - second - 1} seconds behind!`);
                    }
        
                    if (firstFps || second % 10 === 0) {
                        console.log(`[WDI/example-server] Status:`);
                        console.log(`    video: ${frameCounter} fps, ${width}x${height} => ${outputSizeID}, frameTime=${frameTime}ms, bitrate=${videoBitrate / 1000}Kbps, ${droppedFrames} dropped`);
                        console.log(`    audio: buffer=${audioBufferSize} samples [${audioBufferMs}ms], rate=${audioSampleRate}Hz, processed=${audioSamplesProcessed} samples, ${audioCallsPerSecond} cps`);
                    }
                    firstFps = false;
                    frameCounter = 0;
                    videoBitrate = 0;
                    second = currentSecond;
                }
        
                if (currentSizeID === outputSizeID) {
                    videoPipe.push(Buffer.from(data));
                } else {
                    libyuv.I420Scale(
                        <any>frame.data,
                        frame.width,
        
                        <any>frame.data.subarray(frame.width*frame.height),
                        frame.width / 2,
                        
                        <any>frame.data.subarray(frame.width*frame.height + frame.width*frame.height / 4),
                        frame.width / 2,
                        
                        frame.width, 
                        frame.height,
        
                        <any>outputFrameI420.data,
                        outputFrameI420.width,
                        <any>outputFrameI420.data.subarray(outputFrameI420.width * outputFrameI420.height),
                        outputFrameI420.width / 2,
                        <any>outputFrameI420.data.subarray(
                            outputFrameI420.width * outputFrameI420.height 
                            + outputFrameI420.width * outputFrameI420.height / 4
                        ),
                        outputFrameI420.width / 2,
                        outputFrameI420.width,
                        outputFrameI420.height,
                        libyuv.FilterMode.kFilterBilinear
                    );
        
                    videoPipe.push(Buffer.from(outputFrameI420.data));
        
                    for (let i = 0; i < missedFrames; ++i)
                        videoPipe.push(Buffer.from(outputFrameI420.data));
        
                    missedFrames = 0;
                }
        
                frameTime = Date.now() - frameStartedAt;
            };
        
            videoSink.addEventListener('frame', async ({ frame }) => {
                if (isFrameRendering) {
                    droppedFrames += 1;
                    missedFrames += 1;
                    return;
                }
        
                isFrameRendering = true;
                await handleFrame(frame);
                isFrameRendering = false;
            });
            
            audioSink.addEventListener('data', ({ samples }) => {
                let buffer : ArrayBuffer = samples.buffer;
                audioPipe.push(Buffer.from(buffer));
        
                // stats
        
                audioCallsPerSecondCounter += 1;
                audioBufferSize = buffer.byteLength / 2;
                audioSampleRateCounter = audioSampleRateCounter + audioBufferSize;
                audioSamplesProcessed += audioBufferSize;
        
                let second = Math.floor(Date.now() / 1000);
        
                if (audioSecond !== second) {
                    audioSecond = second;
                    audioSampleRate = audioSampleRateCounter;
                    audioBufferMs = Math.floor(audioBufferSize / audioSampleRate * 1000);
                    audioSampleRateCounter = 0;
                    audioCallsPerSecond = audioCallsPerSecondCounter;
                    audioCallsPerSecondCounter = 0;
                }
            });
        });

        session.registerService(WDIPeer, () => peer);
    }
}

Application.bootstrap(WDIServer);