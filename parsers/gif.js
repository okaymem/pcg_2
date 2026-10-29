
import { readView, ascii, resultBase } from "./common.js";

export async function parseGIF(file) {
    const view = await readView(file, 0, 13);
    const signature = ascii(view, 0, 6);

    if (signature !== "GIF87a" && signature !== "GIF89a") {
        throw new Error("Некорректная сигнатура GIF");
    }

    const packed = view.getUint8(10);
    const result = resultBase("gif");

    result.width = view.getUint16(6, true);
    result.height = view.getUint16(8, true);
    result.colorDepth = (packed & 0x80)
        ? 1 << ((packed & 0x07) + 1)
        : null;
    result.compression = "LZW";

    return result;
}
