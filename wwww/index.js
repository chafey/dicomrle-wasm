import * as wasm from "dicomrle";
import { memory } from 'dicomrle/dicomrle_wasm_bg';

wasm.initialize();

  let decoder = undefined;
  let encoder = undefined;
  let decoderjs = undefined;
  let encoderjs = undefined;
  let decoderwasm = undefined;
  let encoderwasm = undefined;
  let encodedBitStream = undefined;

  // upon loading a decoded bitstream, set to the decoded data so it can be reencoded
  // as part of the lossy encoding functionality.  NOTE - is not changed after load  
  let uncompressedImageFrame = undefined;
  let fullEncodedBitStream = undefined; 

  let frameInfo = undefined;
  let compressionRatio = 0;
  let minMax = undefined;
  let progressionOrder = undefined;
  let decodeLevel = 0;
  let decodeLayer = 0;
  let numDecompositionsToEncode = 5;

  function getMinMax(frameInfo, pixelData) {
    const numPixels = frameInfo.width * frameInfo.height * frameInfo.componentCount;
    let min = pixelData[0];
    let max = pixelData[0];
    for(let i=0; i < numPixels; i++) {
      if(pixelData[i] < min) {
        min = pixelData[i];
      }
      if(pixelData[i] > max) {
        max = pixelData[i];
      }
    }
    return {min, max};
  }

  function getPixelData(frameInfo, decodedBuffer) {
    if(frameInfo.bitsPerSample > 8) {
      if(frameInfo.isSigned) {
        return new Int16Array(decodedBuffer.buffer, decodedBuffer.byteOffset, decodedBuffer.byteLength / 2);
      } else {
        return new Uint16Array(decodedBuffer.buffer, decodedBuffer.byteOffset, decodedBuffer.byteLength / 2);
      }
    } else {
      return decodedBuffer;
    }
  }

  function colorToCanvas(frameInfo, pixelData, imageData) {
    let outOffset = 0;
    const bytesPerSample = (frameInfo.bitsPerSample <= 8) ? 1 : 2;
    let planeSize = frameInfo.width * frameInfo.height * bytesPerSample;
    let shift = 0;
    if(frameInfo.bitsPerSample > 8) {
      shift = 8;
    }
    let inOffset = 0;
   
    for(var y=0; y < frameInfo.height; y++) {
      for (var x = 0; x < frameInfo.width; x++) {
        imageData.data[outOffset++] = pixelData[inOffset++] >> shift;
        imageData.data[outOffset++] = pixelData[inOffset++] >> shift;
        imageData.data[outOffset++] = pixelData[inOffset++] >> shift;
        imageData.data[outOffset++] = 255;
      }
    }
  }

  function grayToCanvas(frameInfo, pixelData, imageData) {
    var outOffset = 0;
    var planeSize = frameInfo.width * frameInfo.height;
    var inOffset = 0;
   
    if(!minMax) {
      minMax = getMinMax(frameInfo, pixelData);
      $('#minPixel').text('' + minMax.min);
      $('#maxPixel').text('' + minMax.max);
    }

    //console.log(minMax);
    let dynamicRange = minMax.max - minMax.min;
    $('#dynamicRange').text('' + dynamicRange);
    //console.log('dynamicRange=', dynamicRange);
    let bitsOfData = 1;
    while(dynamicRange > 1) {
      dynamicRange = dynamicRange >> 1;
      bitsOfData++;
    }
    //console.log('bitsOfData = ', bitsOfData);
    let bitShift = bitsOfData - 8;
    const offset = -minMax.min;
    //console.log('bitShift=', bitShift);
    //console.log('offset=', offset);
    
    for(var y=0; y < frameInfo.height; y++) {
      for (var x = 0; x < frameInfo.width; x++) {
        if(frameInfo.bitsPerSample <= 8) {
          const value = pixelData[inOffset++];
          imageData.data[outOffset] = value;
          imageData.data[outOffset + 1] = value;
          imageData.data[outOffset + 2] = value;
          imageData.data[outOffset + 3] = 255;
          outOffset += 4;
        } 
        else // bitsPerSample > 8 
        {
          // Do a simple transformation to display 16 bit data:
          //  * Offset the pixels so the smallest value is 0
          //  * Shift the pixels to display the most significant 8 bits
          const fullPixel = pixelData[inOffset++] + offset;
          let value = (fullPixel >> bitShift);
          imageData.data[outOffset] = value;
          imageData.data[outOffset + 1] = value;
          imageData.data[outOffset + 2] = value;
          imageData.data[outOffset + 3] = 255;
          outOffset += 4;
        }
      }
    }
  }

  function deltasToCanvas(frameInfo, pixelData, imageData, signed) {
    if(!uncompressedImageFrame) {
      return;
    }
    const deltas = new Int32Array(frameInfo.height * frameInfo.width);
    const uif = getPixelData(frameInfo, uncompressedImageFrame, signed);
    let inOffset = 0;
    let outOffset = 0;
    for(var y=0; y < frameInfo.height; y++) {
      for (var x = 0; x < frameInfo.width; x++) {
          const unc = uif[inOffset];
          const comp = pixelData[inOffset];
          deltas[inOffset++] = Math.abs(comp - unc);
      }
    }
    const deltaMinMax = getMinMax(frameInfo, deltas);
    console.log('deltas min/max', deltaMinMax);
    inOffset = 0;

    for(var y=0; y < frameInfo.height; y++) {
      for (var x = 0; x < frameInfo.width; x++) {
        if(uncompressedImageFrame) {
          const delta = deltas[inOffset];
          inOffset++;
          imageData.data[outOffset] = delta;
          imageData.data[outOffset + 1] = delta;
          imageData.data[outOffset + 2] = delta;
          imageData.data[outOffset + 3] = 255;
          outOffset += 4;
        }
      } 
    }
  }

  function display(frameInfo, decodedBuffer, interleaveMode) {

    const pixelData = getPixelData(frameInfo, decodedBuffer);

    const begin = performance.now(); // performance.now() returns value in milliseconds
    
    var c = document.getElementById("myCanvas");
    var ctx = c.getContext("2d");

    c.width = frameInfo.width;
    c.height = frameInfo.height;
    var myImageData = ctx.createImageData(frameInfo.width, frameInfo.height);

    const visualizeDeltas = $('#visualizeDeltas').is(":checked"); 

    if(frameInfo.componentCount > 1) {
      colorToCanvas(frameInfo, pixelData, myImageData, 2);
    } else {
      if(visualizeDeltas) {
        deltasToCanvas(frameInfo, pixelData, myImageData);
      } else {
        grayToCanvas(frameInfo, pixelData, myImageData);
      }
    }
    
    ctx.putImageData(myImageData, 0, 0);
    const end = performance.now();
    $('#displayTime').text((end-begin).toFixed(2) + ' ms');
  }

  function decode(iterations = 1) {
    $('#encodedSize').text('' + encodedBitStream.length.toLocaleString() + ' bytes');

    const encodedBufferPtr = wasm.get_encoded_buffer(encodedBitStream.length);
    const encodedBuffer = new Uint8Array(memory.buffer, encodedBufferPtr, encodedBitStream.length);
    // copy RLE encoded image bits into WASM memory
    encodedBuffer.set(encodedBitStream);

    // Set decoded buffer size
    const encodedBufferLength = 512 * 512 * 2; // 512kb for CT image
    const decodedBufferPtr = wasm.get_decoded_buffer(encodedBufferLength);
    const decodedBuffer = new Uint8Array(memory.buffer, decodedBufferPtr, encodedBufferLength);

    // Decode
    const begin = performance.now(); // performance.now() returns value in milliseconds
    for(let i=0; i < iterations; i++) {
      wasm.decode();
    }
    const end = performance.now();
    $('#decodeTime').text(((end-begin) / iterations).toFixed(2) + ' ms');

    //frameInfo = decoder.getFrameInfo();
    frameInfo = {
      width: 512,
      height: 512,
      bitsPerSample: 16,
      isSigned: true,
      componentCount: 1
    }
    // Display image properties
    $('#status').text('OK');
    $('#resolution').text(''+frameInfo.width + 'x' + frameInfo.height);
    $('#pixelFormat').text(''+frameInfo.bitsPerSample +' bpp ' + (frameInfo.isSigned ? 'signed' : 'unsigned'));
    $('#componentCount').text(''+frameInfo.componentCount);

    //$('#colorTransform').text('' + decoder.getColorSpace());

    // Display Image
    //var decodedBuffer = decoder.getDecodedBuffer();
    //console.log('decodedBuffer=', decodedBuffer);

    $('#decodedSize').text(''+decodedBuffer.length.toLocaleString() + " bytes");
    $('#compressionRatio').text('' + (decodedBuffer.length /encodedBitStream.length).toFixed(2) + ":1");
   
    display(frameInfo, decodedBuffer, 2);
    //frameInfo = decoder.getFrameInfo();
  }

  function encode(iterations = 1) {
    // Setup buffer
    const decodedBytes = encoder.getDecodedBuffer(frameInfo);
    decodedBytes.set(uncompressedImageFrame);
    const progressive = $('#progressive').is(":checked"); 

    encoder.setProgressive(progressive);
    encoder.setQuality(compressionRatio);

    // Do the encode
    const begin = performance.now(); // performance.now() returns value in milliseconds
    for(let i=0; i < iterations; i++) {
      encoder.encode();
    }
    const end = performance.now();
    $('#encodeTime').text(((end-begin) / iterations).toFixed(2) + ' ms');
  }

  function loadArrayBuffer(arrayBuffer) {
    try {
      fullEncodedBitStream = new Uint8Array(arrayBuffer);
      const numBytes = 0;// 122003;
      encodedBitStream = new Uint8Array(arrayBuffer, 0, fullEncodedBitStream.length -numBytes);
      //encodedBitStream = new Uint8Array(arrayBuffer);
      $('#encodedBytesRead').text('' + encodedBitStream.length.toLocaleString() + ' / ' + fullEncodedBitStream.length.toLocaleString() + ' bytes ');
      $('#encodedBytesReadRange').attr('max', encodedBitStream.length-1);
      //$('#encodedBytesReadRange').attr('max', 512);
      decode();
      //uncompressedImageFrame = new Uint8Array(decoder.getDecodedBuffer().length);
      //uncompressedImageFrame.set(decoder.getDecodedBuffer());
    }
    catch(ex) {
      $('#status').text('Exception thrown while parsing ' + ex);
    }
  }

  function load(url) {
    fetch(url)
    .then((response) => {
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      loadArrayBuffer(arrayBuffer);
    }).catch(function() {
      $('#status').text('error loading ' + url);
    });
  }

  function reset() {
    decodeLevel = 0;
    minMax = undefined;
    const c = document.getElementById("myCanvas");
    const ctx = c.getContext("2d");
    ctx.fillRect(0,0,c.width, c.height);
    $('#status').text('OK');

    $('#encodeTime').text('');
    $('#decodeTime').text('');
    $('#displayTime').text('');

    $('#encodedSize').text('');
    $('#decodedSize').text('');
    $('#compressionRatio').text('');

    $('#resolution').text('');
    $('#pixelFormat').text('');
    $('#componentCount').text('');
    
    $('#reversible').text('');
    $('#numDecompositions').text('');
    $('#progessionOrder').text('');
}

  function init(path) {
    $('#imageSelector').val(path);
    load(path);
  }

 

  function main() {

    init('rleimages/ct.rle');

    $('#imageSelector').change(function(e) {
      reset();
      load(e.target.options[e.target.selectedIndex].value);
    });

    $('#visualizeDeltas').change(function() {
      // this will contain a reference to the checkbox   
      if (this.checked) {
        decode();
      } else {
        decode();
      }
    });

    $('#useWASM').change(function() {
      if (this.checked) {
        encoder = encoderwasm;
        decoder = decoderwasm;
        decode();
      } else {
        encoder = encoderjs;
        decoder = decoderjs;
        decode();
      }
    });

    $('#decodeLayerRange').on('input', function(e) {
      decodeLayer = parseInt($(this).val());
      $('#decodeLayer').text('' + decodeLayer);
      decode();
    });

    $('#decodeLevelRange').on('input', function(e) {
      decodeLevel = parseInt($(this).val());
      const resolutionAtLevel = decoder.calculateSizeAtDecompositionLevel(decodeLevel);
      $('#decodeLevel').text('' + decodeLevel + ' (' + resolutionAtLevel.width + 'x' + resolutionAtLevel.height + ')');
      decode();
    });

    $('#progressionOrderSelector').change(function(e) {
      progressionOrder = parseInt(e.target.options[e.target.selectedIndex].value);
      encode();
       // Get the encoded bytes and display them
      const encodedBytes = encoder.getEncodedBuffer();
      encodedBitStream = encodedBytes;
      decode();
    });

    $('#decompositionsSelector').change(function(e) {
      numDecompositionsToEncode = parseInt(e.target.options[e.target.selectedIndex].value);
      encode();
       // Get the encoded bytes and display them
      const encodedBytes = encoder.getEncodedBuffer();
      encodedBitStream = encodedBytes;
      decode();
    });

    $('#benchmark').click(function(e) {
      $('#status').text('Please wait while benchmark runs....');
      setTimeout(() => {
        const iterations = 5;
        decode(iterations)
        encode(iterations)
        $('#status').text('OK - ' + iterations + ' iterations encode/decode');
      }, 1);
    });

    $('#encodedBytesReadRange').on('input', function(e) {
      const numBytes = parseInt($(this).val());
      let length = fullEncodedBitStream.length - numBytes;
      encodedBitStream = new Uint8Array(length);
      for(let i=0; i < length; i++) {
        encodedBitStream[i] = fullEncodedBitStream[i];
      }
      $('#encodedBytesRead').text('' + encodedBitStream.length.toLocaleString() + ' / ' + fullEncodedBitStream.length.toLocaleString() + ' bytes ');
      try {
        decode();
      } catch(ex) {
        console.log(ex);
      } finally {
      }
    });


    $('#bytesDecodedRange').on('input', function(e) {
      bytePercent = parseFloat($(this).val());
      console.log('bytePercent =', bytePercent);
      const numBytes = Math.floor(encodedBitStream.length * bytePercent / 100);
      console.log('numBytes=', numBytes);
      const fullEncodedBitStream = encodedBitStream.slice(0, numBytes);
      //encodedBitStream = new Uint8Array(numBytes);
      //encodedBitStream.set(fullEncodedBitStream);
      console.log(encodedBitStream.length);
      $('#bytesDecoded').text('' + bytePercent + "% (" + numBytes + " bytes)");
      decode();
      encodedBitStream = fullEncodedBitStream;
    });

    $('#targetCompressionRatioRange').on('input', function(e) {
      compressionRatio = 100.0 - parseFloat($(this).val());
      $('#targetCompressionRatio').text('' + compressionRatio.toFixed(2));
      encode();
       // Get the encoded bytes and display them
      const encodedBytes = encoder.getEncodedBuffer();
      encodedBitStream = encodedBytes;
      decode();
    });

    // this function gets called once the user drops the file onto the div
    function handleFileSelect(evt) {
      evt.stopPropagation();
      evt.preventDefault();

      // Get the FileList object that contains the list of files that were dropped
      var files = evt.dataTransfer.files;

      // this UI is only built for a single file so just dump the first one
      var file = files[0];

      const fileReader = new FileReader();
      fileReader.onload = function (e) {
        const fileAsArrayBuffer = e.target.result;
        loadArrayBuffer(fileAsArrayBuffer);
      };
      fileReader.readAsArrayBuffer(file);
    }

    function handleDragOver(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
    }

    // Setup the dnd listeners.
    var dropZone = document.getElementById('myCanvas');
    dropZone.addEventListener('dragover', handleDragOver, false);
    dropZone.addEventListener('drop', handleFileSelect, false);
  }

  $('#download').click(function() {
    // download the de-identified DICOM P10 bytestream
    var blob = new Blob([encodedBitStream], {type: "image/j2c"});
    var url = window.URL.createObjectURL(blob);
    window.open(url);
    window.URL.revokeObjectURL(url);
  });

  main();