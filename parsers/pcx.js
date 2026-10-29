
import { readView, resultBase } from "./common.js";

export async function parsePCX(file) {
    const view = await readView(file, 0, 128);

    if (view.getUint8(0) !== 0x0A) {
        throw new Error("Некорректная сигнатура PCX");
    }

    const version = view.getUint8(1);
    const encoding = view.getUint8(2);
    const bitsPerPixel = view.getUint8(3);

    const xMin = view.getUint16(4, true);
    const yMin = view.getUint16(6, true);
    const xMax = view.getUint16(8, true);
    const yMax = view.getUint16(10, true);

    if (xMax < xMin || yMax < yMin) {
        throw new Error("Некорректные размеры PCX");
    }

    const planes = view.getUint8(65);
    const result = resultBase("pcx");

    result.width = xMax - xMin + 1;
    result.height = yMax - yMin + 1;
    result.dpiX = view.getUint16(12, true) || null;
    result.dpiY = view.getUint16(14, true) || null;
    result.colorDepth = bitsPerPixel * planes;

    result.compression = encoding === 1
        ? "PCX RLE"
        : encoding === 0
            ? "Без сжатия"
            : `Unknown (${encoding})`;

    if (![0, 1, 2, 3, 4, 5].includes(version)) {
        result.warning = "Неизвестная версия PCX";
    }

    return result;
}
