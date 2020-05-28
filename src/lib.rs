mod utils;

use wasm_bindgen::prelude::*;
pub use dicomrle::decoder;
use utils::{set_panic_hook};

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern {
    fn alert(s: &str);
}

/*
fn get_rle_image() -> Vec<u8> {
   // create empty RLE encoded image
   let mut encoded:Vec<u8> = Vec::new(); 
   encoded.resize(64, 0);
   encoded 
}*/

static mut ENCODEDBUFFER: Vec<u8> = Vec::new();

#[wasm_bindgen]
pub fn get_encoded_buffer(encoded_size: usize) -> *mut u8 {
    let unsafe_ptr = unsafe {    
        ENCODEDBUFFER.resize(encoded_size, 0);
        ENCODEDBUFFER.as_mut_ptr()
    };
    unsafe_ptr
}

static mut DECODEDBUFFER: Vec<u8> = Vec::new();

#[wasm_bindgen]
pub fn get_decoded_buffer(encoded_size: usize) -> *mut u8 {
    let unsafe_ptr = unsafe {    
        DECODEDBUFFER.resize(encoded_size, 0);
        DECODEDBUFFER.as_mut_ptr()
    };
    unsafe_ptr
}

#[wasm_bindgen]
pub fn decode() {
    // get rle encoded image (e.g. from DICOM P10)
    unsafe {
        // decode it
        let diagnostics = decoder::decode(&ENCODEDBUFFER, &mut DECODEDBUFFER).unwrap();
        
        // print diagnostics
        //alert("decode succeeded!");

        //println!("RLE Image Decode took {} us", diagnostics.duration.as_micros());
        println!("Incomplete Decode: {}", diagnostics.incomplete_decode);
        println!("Useless Marker Count: {}", diagnostics.useless_marker_count);
        println!("Unexpectged Segment Offsets: {}", diagnostics.unexpected_segment_offsets);
    }
}

#[wasm_bindgen]
pub fn greet() {
    //alert("Hello, dicomrle-wasm!");
    set_panic_hook();
}
