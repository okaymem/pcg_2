
import {
    readView,
    ascii,
    dpiFromPixelsPerMeter,
    resultBase
} from "./common.js";

export async function parseBMP(file) {
    if (file.size < 26) {
        throw new Error("Файл BMP слишком короткий");
    }

    const header = await readView(
        file,
        0,
        Math.min(file.size, 138)
    );

    if (ascii(header, 0, 2) !== "BM") {
        throw new Error("Некорректная сигнатура BMP");
    }

    const dibSize = header.getUint32(14, true);

    if (dibSize < 40) {
        throw new Error("Этот вариант заголовка BMP не поддерживается");
    }

    if (file.size < 54 || header.byteLength < 54) {
        throw new Error("Заголовок BMP неполный");
    }

    const rawWidth = header.getInt32(18, true);
    const rawHeight = header.getInt32(22, true);

    if (
        rawWidth <= 0 ||
        rawHeight === 0 ||
        rawHeight === -2147483648
    ) {
        throw new Error("Некорректные размеры BMP");
    }

    const result = resultBase("bmp");

    result.width = rawWidth;
    result.height = Math.abs(rawHeight);
    result.colorDepth = header.getUint16(28, true);

    const compression = header.getUint32(30, true);

    const compressionNames = {
        0: "BI_RGB",
        1: "BI_RLE8",
        2: "BI_RLE4",
        3: "BI_BITFIELDS",
        4: "BI_JPEG",
        5: "BI_PNG",
        6: "BI_ALPHABITFIELDS"
    };

    result.compression =
        compressionNames[compression] ?? `Unknown (${compression})`;

    // BMP хранит разрешение в пикселях на метр.
    const xPixelsPerMeter = header.getInt32(38, true);
    const yPixelsPerMeter = header.getInt32(42, true);

    result.dpiX = dpiFromPixelsPerMeter(xPixelsPerMeter);
    result.dpiY = dpiFromPixelsPerMeter(yPixelsPerMeter);

    return result;
}
