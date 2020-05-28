import * as wasm from "dicomrle";
import { memory } from 'dicomrle/dicomrle_wasm_bg';

function getImageFromServer(path) {
    return fetch(path).then(function(response) {
        return response.arrayBuffer();
      }).then(function(arrayBuffer) {
        return new Uint8Array(arrayBuffer);
      });
}

wasm.greet();

async function main() {
    // Read RLE encoded bits from web server
    const encodedBits = await getImageFromServer('rleimages/ct.rle');
    // allocate buffer in WASM memory space for RLE encoded bits
    const encodedBufferPtr = wasm.get_encoded_buffer(encodedBits.length);
    const encodedBuffer = new Uint8Array(memory.buffer, encodedBufferPtr, encodedBits.length);
    // copy RLE encoded image bits into WASM memory
    encodedBuffer.set(encodedBits);

    // Set decoded buffer size
    const encodedBufferLength = 512 * 512 * 2; // 512kb for CT image
    const decodedBufferPtr = wasm.get_decoded_buffer(encodedBufferLength);
    const decodedBuffer = new Uint8Array(memory.buffer, decodedBufferPtr, encodedBufferLength);

    // Decode the image
    wasm.decode();

    // get decoded image out of WASM memory and display
    console.log('decodedBuffer=', decodedBuffer);
}

main();

