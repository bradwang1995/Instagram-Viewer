# Single Photo View enhancement model

ESRGAN Slim 2×, from `@upscalerjs/esrgan-slim` 1.0.0, trained on DIV2K.
Source: https://github.com/thekevinscott/UpscalerJS/tree/main/models/esrgan-slim
The model license is in `MODEL-LICENSE.txt`.

Single Photo View loads these assets only when Enhance is requested. TensorFlow.js
4.22.0 (see `RUNTIME-LICENSE.txt`) runs the model locally in a WebGL worker;
no photo pixels are uploaded.
