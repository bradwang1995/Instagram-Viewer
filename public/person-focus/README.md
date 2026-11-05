# Person focus assets

Person detection runs in the browser using MediaPipe Tasks Vision 1.2.2 and
EfficientDet-Lite0 (float16, version 1, COCO person class). Photos are not uploaded.

For broad/reclining subjects, BlazeFace short-range (float16, version 1) locates
the head relative to the primary body before selecting a portrait quarter-turn.
Model: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

- Runtime WASM/JS: `@mediapipe/tasks-vision@1.2.2/wasm` (Apache-2.0).
- Model: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
- Documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js

Keep the vendored WASM runtime aligned with the locked npm package version when
updating it. Assets are served from the app's own base path, including GitHub Pages.
