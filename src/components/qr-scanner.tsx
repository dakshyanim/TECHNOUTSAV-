'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IScannerControls } from '@zxing/browser';
import { challengePathFromQr } from '@/lib/scan-target';

export default function QrScanner({eventOrigin}: {eventOrigin?: string}) {
  const router=useRouter();
  const video=useRef<HTMLVideoElement>(null), stream=useRef<MediaStream | null>(null);
  const controls=useRef<IScannerControls | null>(null), generation=useRef(0);
  const [scanning,setScanning]=useState(false),[error,setError]=useState('');
  function release() {
    controls.current?.stop(); controls.current=null;
    stream.current?.getTracks().forEach(track=>track.stop()); stream.current=null;
    if(video.current) video.current.srcObject=null;
  }
  useEffect(()=>()=>{generation.current++;controls.current?.stop();stream.current?.getTracks().forEach(track=>track.stop());},[]);
  function stop() {generation.current++;release();setScanning(false);}
  async function start() {
    if(scanning)return;
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {setError('Camera scanning needs HTTPS (or localhost). You can still scan using your phone camera or Google Lens.');return;}
    const token=++generation.current;setScanning(true);setError('');
    try {
      const {BrowserQRCodeReader}=await import('@zxing/browser');
      if(token!==generation.current)return;
      const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
      if(token!==generation.current){camera.getTracks().forEach(track=>track.stop());return;}
      stream.current=camera;
      if(!video.current){release();return;}
      const scanner=await new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:300}).decodeFromStream(camera,video.current,(result,_error,scannerControls)=>{
        if(token!==generation.current){scannerControls.stop();return;}
        if(!result)return;
        const path=challengePathFromQr(result.getText(),window.location.origin,eventOrigin);
        if(!path){setError('That QR is not a question for this event. Point the camera at an event QR.');return;}
        scannerControls.stop();generation.current++;release();setScanning(false);router.push(path);
      });
      if(token!==generation.current)scanner.stop();else controls.current=scanner;
    } catch(cause) {
      if(token!==generation.current)return;
      release();setScanning(false);
      const name=cause instanceof Error?cause.name:'';
      setError(name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser and try again.':name==='NotFoundError'?'No camera was found. Use your phone camera or Google Lens.':'Unable to open the camera. Close other camera apps and try again.');
    }
  }
  return <section className="qr-scanner"><h2>Scan a question QR</h2>
    <p>Use your camera here to open a challenge.</p>
    <video ref={video} muted playsInline autoPlay hidden={!scanning} className="scanner-video" aria-label="QR camera preview"/>
    {scanning?<><p role="status">Point the camera at a question QR code.</p><button type="button" onClick={stop}>Stop camera</button></>:<button type="button" onClick={start}>Scan QR code</button>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
