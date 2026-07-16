# Upstream provenance

- qwen3-tts.cpp: `https://github.com/predict-woo/qwen3-tts.cpp`
- pinned commit: `b9763a1af4e6f9de2ffabda0613e398727ab318e`
- GGML: `https://github.com/ggml-org/ggml`
- pinned commit: `3af5f5760e19a96427f5f7a93b79cbdf3d4b265b`

The `src/sidecar_main.cpp`, Q3SP support, Windows portable build settings,
tests, and protocol documentation contain application-specific changes. The
source is vendored so a release can be reproduced without a sibling checkout
or network fetch during CMake configuration.

See `LICENSE`, `NOTICE.md`, and `ggml/LICENSE` before distribution.
