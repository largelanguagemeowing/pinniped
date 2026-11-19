# DeepFilterNet 3 runtime assets

Vendored so calls never fetch these from a third-party CDN. Fetched by
`deepfilternet3-noise-filter` at runtime from `/public/df3` (see
`src/app/plugins/call/engine/livekit/denoise.ts`).

- `v3/pkg/df_bg.wasm` (sha256
  `440b5d12b6ea7d95008736f844221d7874ee15de5cb10d3015002470fdba0432`):
  wasm-pack build of upstream DeepFilterNet's `libDF`
  (https://github.com/Rikorose/DeepFilterNet), taken from
  https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3/v3/pkg/df_bg.wasm
- `v3/models/DeepFilterNet3_onnx.tar.gz` (sha256
  `c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616`):
  the upstream model archive, byte-identical to
  https://github.com/Rikorose/DeepFilterNet/blob/main/models/DeepFilterNet3_onnx.tar.gz

Both are dual-licensed MIT / Apache-2.0 upstream; see
https://github.com/Rikorose/DeepFilterNet/blob/main/LICENSE
