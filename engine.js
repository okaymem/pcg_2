
import { parsePNG } from "./parsers/png.js";
import { parseJPEG } from "./parsers/jpeg.js";
import { parseGIF } from "./parsers/gif.js";
import { parseBMP } from "./parsers/bmp.js";
import { parseTIFF } from "./parsers/tiff.js";
import { parsePCX } from "./parsers/pcx.js";

const YIELD_EVERY = 5;

const EXTENSIONS = {
    jpg: "jpeg",
    jpeg: "jpeg",
    png: "png",
    gif: "gif",
    bmp: "bmp",
    tif: "tiff",
    tiff: "tiff",
    pcx: "pcx"
};

const PARSERS = {
    jpeg: parseJPEG,
    png: parsePNG,
    gif: parseGIF,
    bmp: parseBMP,
    tiff: parseTIFF,
    pcx: parsePCX
};

function getFormat(filename) {
    const match = String(filename).toLowerCase().match(/\.([^.]+)$/);
    return match ? EXTENSIONS[match[1]] || null : null;
}

function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export class ImageEngine {
    constructor(callbacks = {}) {
        this.onResult = callbacks.onResult || (() => {});
        this.onProgress = callbacks.onProgress || (() => {});
        this.onError = callbacks.onError || (() => {});
        this.onDone = callbacks.onDone || (() => {});

        this.isRunning = false;
        this.cancelRequested = false;
    }

    cancel() {
        this.cancelRequested = true;
    }

    async process(files) {
        if (this.isRunning) {
            throw new Error("Обработка уже запущена.");
        }

        this.isRunning = true;
        this.cancelRequested = false;

        const fileList = Array.from(files);
        const total = fileList.length;

        let completed = 0;
        let successful = 0;
        let failed = 0;
        let skipped = 0;

        try {
            for (let i = 0; i < total; i++) {
                if (this.cancelRequested) {
                    skipped = total - completed;
                    break;
                }

                const file = fileList[i];
                const format = getFormat(file.name);
                let result;

                if (!format) {
                    result = {
                        id: i,
                        fileName: file.webkitRelativePath || file.name,
                        format: "unknown",
                        width: null,
                        height: null,
                        dpiX: null,
                        dpiY: null,
                        colorDepth: null,
                        compression: null,
                        error: "Неподдерживаемый формат"
                    };

                    failed++;
                } else {
                    try {
                        const metadata = await PARSERS[format](file);

                        result = {
                            ...metadata,
                            id: i,
                            fileName: file.webkitRelativePath || file.name,
                            format
                        };

                        successful++;
                    } catch (error) {
                        result = {
                            id: i,
                            fileName: file.webkitRelativePath || file.name,
                            format,
                            width: null,
                            height: null,
                            dpiX: null,
                            dpiY: null,
                            colorDepth: null,
                            compression: null,
                            error: error instanceof Error
                                ? error.message
                                : String(error)
                        };

                        failed++;
                        this.onError(result, error);
                    }
                }

                this.onResult(result);
                completed++;

                this.onProgress({
                    completed,
                    total,
                    successful,
                    failed,
                    percent: total === 0
                        ? 100
                        : Math.round(completed / total * 100)
                });

                if (completed % YIELD_EVERY === 0) {
                    await yieldToBrowser();
                }
            }
        } finally {
            this.isRunning = false;

            this.onDone({
                total,
                completed,
                successful,
                failed,
                skipped,
                cancelled: this.cancelRequested
            });
        }
    }
}
