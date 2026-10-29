
import {
    readView,
    ascii,
    dpiFromPixelsPerMeter,
    resultBase
} from "./common.js";

export async function parsePNG(file) {
    const header = await readView(file, 0, 33);

    if (ascii(header, 0, 8) !== "\x89PNG\r\n\x1a\n") {
        throw new Error("Некорректная сигнатура PNG");
    }

    if (ascii(header, 12, 4) !== "IHDR") {
        throw new Error("Блок IHDR не найден");
    }

    const result = resultBase("png");

    result.width = header.getUint32(16, false);
    result.height = header.getUint32(20, false);

    const bitDepth = header.getUint8(24);
    const colorType = header.getUint8(25);

    const channels = {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
    }[colorType];

    if (!channels) {
        throw new Error("Неизвестный тип цвета PNG");
    }

    // Для индексированного PNG это глубина индекса палитры.
    result.colorDepth = bitDepth * channels;
    result.compression = "Deflate";

    let offset = 8;

    while (offset + 12 <= file.size) {
        const chunk = await readView(file, offset, 8);
        const length = chunk.getUint32(0, false);
        const type = ascii(chunk, 4, 4);

        const dataOffset = offset + 8;
        const nextOffset = dataOffset + length + 4;

        if (nextOffset > file.size) {
            throw new Error("Повреждённый блок PNG");
        }

        if (type === "pHYs" && length >= 9) {
            const phys = await readView(file, dataOffset, 9);

            if (phys.getUint8(8) === 1) {
                result.dpiX = dpiFromPixelsPerMeter(
                    phys.getUint32(0, false)
                );
                result.dpiY = dpiFromPixelsPerMeter(
                    phys.getUint32(4, false)
                );
            }
        }

        if (type === "IEND") {
            break;
        }

        offset = nextOffset;
    }

    return result;
}
