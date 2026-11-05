# Local 2x super resolution

Model: @upscalerjs/esrgan-slim 1.0.0, x2, trained on DIV2K.
Source: https://github.com/thekevinscott/upscaler
The model license is included as MODEL-LICENSE.txt.

The TensorFlow.js WASM runtime is from @tensorflow/tfjs-backend-wasm 4.11.0 (Apache-2.0).
Inference runs locally in a worker, on demand. Input photos are not uploaded.
Output dimensions are twice the original in both directions. Photos over 4 MP
retain their originals and report the processing limit instead of downsampling.
