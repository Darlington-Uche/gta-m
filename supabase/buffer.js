import { Buffer } from 'node:buffer';
globalThis.Buffer = globalThis.Buffer || Buffer; // Edge runtime has no global Buffer
