'use client';
import { useState } from 'react';
export default function AdminQrPrint({all=false}:{all?:boolean}) {
  const [error,setError]=useState('');
  function print() {
    const images=Array.from(document.querySelectorAll<HTMLImageElement>('.qr-image'));
    if (!images.length || images.some(image=>!image.complete || !image.naturalWidth)) {
      setError('Wait for all QR images to load before printing. If an image is missing, reload this page.'); return;
    }
    setError(''); window.print();
  }
  return <div className="qr-no-print"><button onClick={print}>{all?'Print all / Save as PDF':'Print / Save as PDF'}</button>{error && <p role="alert">{error}</p>}</div>;
}
