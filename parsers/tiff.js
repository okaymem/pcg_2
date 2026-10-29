
import { readView, resultBase } from "./common.js";

export async function parseTIFF(file) {
    const header = await readView(file, 0, 8);

    const order = String.fromCharCode(
        header.getUint8(0),
        header.getUint8(1)
    );

    const little = order === "II";

    if (!little && order !== "MM") {
        throw new Error("Неизвестный порядок байтов TIFF");
    }

    const magic = header.getUint16(2, little);

    if (magic !== 42) {
        throw new Error(
            "Поддерживается классический TIFF, но не BigTIFF"
        );
    }

    const ifdOffset = header.getUint32(4, little);

    if (ifdOffset + 2 > file.size) {
        throw new Error("Некорректный указатель IFD");
    }

    const countView = await readView(file, ifdOffset, 2);
    const count = countView.getUint16(0, little);

    // Не читаем неограниченное число записей из повреждённого файла.
    if (count > 4096) {
        throw new Error("Слишком много записей TIFF");
    }

    const directoryLength = 2 + count * 12 + 4;

    if (ifdOffset + directoryLength > file.size) {
        throw new Error("Таблица IFD выходит за границы файла");
    }

    const directory = await readView(
        file,
        ifdOffset,
        directoryLength
    );

    const result = resultBase("tiff");
    const tags = new Map();

    const typeSizes = {
        1: 1,  // BYTE
        2: 1,  // ASCII
        3: 2,  // SHORT
        4: 4,  // LONG
        5: 8,  // RATIONAL
        6: 1,  // SBYTE
        7: 1,  // UNDEFINED
        8: 2,  // SSHORT
        9: 4,  // SLONG
        10: 8, // SRATIONAL
        11: 4, // FLOAT
        12: 8  // DOUBLE
    };

    async function readValues(entry) {
        const type = directory.getUint16(entry + 2, little);
        const amount = directory.getUint32(entry + 4, little);
        const size = typeSizes[type];

        if (!size || amount === 0) return [];

        const byteLength = size * amount;

        if (byteLength > 1024 * 1024) return [];

        const valuePosition = byteLength <= 4
            ? ifdOffset + entry + 8
            : directory.getUint32(entry + 8, little);

        if (
            valuePosition < 0 ||
            valuePosition + byteLength > file.size
        ) {
            return [];
        }

        let data;

        if (byteLength <= 4) {
            data = directory;
        } else {
            data = await readView(file, valuePosition, byteLength);
        }

        const start = byteLength <= 4 ? entry + 8 : 0;
        const values = [];

        for (let i = 0; i < amount; i++) {
            const p = start + i * size;
            let value;

            switch (type) {
                case 1:
                case 2:
                case 6:
                case 7:
                    value = data.getUint8(p);
                    break;
                case 3:
                    value = data.getUint16(p, little);
                    break;
                case 4:
                    value = data.getUint32(p, little);
                    break;
                case 5: {
                    const numerator = data.getUint32(p, little);
                    const denominator = data.getUint32(p + 4, little);
                    value = denominator ? numerator / denominator : null;
                    break;
                }
                case 8:
                    value = data.getInt16(p, little);
                    break;
                case 9:
                    value = data.getInt32(p, little);
                    break;
                case 10: {
                    const numerator = data.getInt32(p, little);
                    const denominator = data.getInt32(p + 4, little);
                    value = denominator ? numerator / denominator : null;
                    break;
                }
                case 11:
                    value = data.getFloat32(p, little);
                    break;
                case 12:
                    value = data.getFloat64(p, little);
                    break;
                default:
                    value = null;
            }

            values.push(value);
        }

        return values;
    }

    for (let i = 0; i < count; i++) {
        const entry = 2 + i * 12;
        const tag = directory.getUint16(entry, little);
        tags.set(tag, await readValues(entry));
    }

    const first = tag => tags.get(tag)?.[0] ?? null;

    result.width = first(256);
    result.height = first(257);

    const bits = tags.get(258) || [];
    const samples = first(277) || bits.length || 1;

    result.colorDepth = bits.length
        ? bits.reduce((sum, value) => sum + value, 0)
        : null;

    const xResolution = first(282);
    const yResolution = first(283);
    const resolutionUnit = first(296);

    if (resolutionUnit === 2) {
        result.dpiX = xResolution;
        result.dpiY = yResolution;
    } else if (resolutionUnit === 3) {
        result.dpiX = xResolution === null
            ? null
            : xResolution * 2.54;
        result.dpiY = yResolution === null
            ? null
            : yResolution * 2.54;
    }

    const compression = first(259);

    const compressionNames = {
        1: "Без сжатия",
        2: "CCITT Group 3",
        3: "CCITT Group 4",
        5: "LZW",
        6: "JPEG",
        7: "JPEG",
        8: "Deflate",
        32773: "PackBits"
    };

    result.compression = compression === null
        ? null
        : compressionNames[compression] || `Unknown (${compression})`;

    if (result.width === null || result.height === null) {
        throw new Error("В TIFF не найдены размеры изображения");
    }

    return result;
}
