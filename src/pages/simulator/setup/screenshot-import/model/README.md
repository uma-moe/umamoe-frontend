# English OCR model

`eng.traineddata.gz` is `eng.traineddata` from [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) (commit 923915d), compressed with `gzip -9` so Tesseract.js can load it as is.

On the details screen it reads as well as the `4.0.0_best_int` model from `@tesseract.js-data/eng` did, downloads a third smaller (1.9 MB against 2.8 MB) and runs about 20% faster.

Licensed under the Apache License 2.0 by the Tesseract OCR project.
