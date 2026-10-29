
import { readView, resultBase } from "./common.js";

function readExifDpi(view) {
    if (view.byteLength < 14) return null;

    const signature = String.fromCharCode(
        ...Array.from(
            { length: 6 },
            (_, i) => view.getUint8(i)
        )
    );

    if (signature !== "Exif\u0000\u0000") return null;

    const base = 6;

    const byteOrder = String.fromCharCode(
        view.getUint8(base),
        view.getUint8(base + 1)
    );

    if (byteOrder !== "II" && byteOrder !== "MM") return null;

    const little = byteOrder === "II";

    const u16 = offset => {
        if (offset < 0 || offset + 2 > view.byteLength) {
            throw new Error("EXIF: выход за границы сегмента");
        }
        return view.getUint16(offset, little);
    };

    const u32 = offset => {
        if (offset < 0 || offset + 4 > view.byteLength) {
            throw new Error("EXIF: выход за границы сегмента");
        }
        return view.getUint32(offset, little);
    };

    try {
        if (u16(base + 2) !== 42) return null;

        const ifd = base + u32(base + 4);

        if (ifd + 2 > view.byteLength) return null;

        const count = u16(ifd);

        if (ifd + 2 + count * 12 > view.byteLength) return null;

        let x = null;
        let y = null;
        let unit = 2;

        for (let i = 0; i < count; i++) {
            const entry = ifd + 2 + i * 12;
            const tag = u16(entry);
            const type = u16(entry + 2);
            const amount = u32(entry + 4);

            if (tag === 296 && type === 3 && amount >= 1) {
                unit = u16(entry + 8);
            }

            if (
                (tag === 282 || tag === 283) &&
                type === 5 &&
                amount >= 1
            ) {
                const rational = base + u32(entry + 8);

                if (rational + 8 > view.byteLength) continue;

                const numerator = u32(rational);
                const denominator = u32(rational + 4);

                if (denominator === 0) continue;

                const value = numerator / denominator;

                if (Number.isFinite(value) && value > 0) {
                    if (tag === 282) x = value;
                    if (tag === 283) y = value;
                }
            }
        }

        if (x === null && y === null) return null;

        let factor;

        if (unit === 2) {
            factor = 1; // DPI
        } else if (unit === 3) {
            factor = 2.54; // точек на сантиметр -> DPI
        } else {
            return null; // единица измерения не определена
        }

        return {
            dpiX: x === null ? null : x * factor,
            dpiY: y === null ? null : y * factor
        };
    } catch {
        return null;
    }
}

export async function parseJPEG(file) {
    if (file.size < 4) {
        throw new Error("Файл JPEG слишком короткий");
    }

    const start = await readView(file, 0, 2);

    if (start.getUint16(0, false) !== 0xFFD8) {
        throw new Error("Некорректная сигнатура JPEG");
    }

    const result = resultBase("jpeg");
    let offset = 2;

    while (offset + 4 <= file.size) {
        const markerHeader = await readView(file, offset, 2);

        if (markerHeader.getUint8(0) !== 0xFF) {
            offset++;
            continue;
        }

        let marker = markerHeader.getUint8(1);
        offset += 2;

        while (marker === 0xFF && offset < file.size) {
            marker = (await readView(file, offset, 1)).getUint8(0);
            offset++;
        }

        if (marker === 0x00) continue;

        if (
            marker === 0xD8 ||
            marker === 0x01 ||
            (marker >= 0xD0 && marker <= 0xD7)
        ) {
            continue;
        }

        if (marker === 0xD9) break;

        const lengthView = await readView(file, offset, 2);
        const segmentLength = lengthView.getUint16(0, false);

        if (segmentLength < 2) {
            throw new Error("Некорректная длина сегмента JPEG");
        }

        const dataOffset = offset + 2;
        const dataLength = segmentLength - 2;
        const nextOffset = offset + segmentLength;

        if (nextOffset > file.size) {
            throw new Error("Сегмент JPEG выходит за границы файла");
        }

        const isSOF = [
            0xC0, 0xC1, 0xC2, 0xC3,
            0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB,
            0xCD, 0xCE, 0xCF
        ].includes(marker);

        if (isSOF && dataLength >= 6) {
            const sof = await readView(file, dataOffset, 6);

            const precision = sof.getUint8(0);
            result.height = sof.getUint16(1, false);
            result.width = sof.getUint16(3, false);

            result.colorDepth = precision * sof.getUint8(5);
        }

        // JFIF: APP0.
        if (marker === 0xE0 && dataLength >= 12) {
            const app0 = await readView(file, dataOffset, 12);

            const signature = String.fromCharCode(
                ...Array.from(
                    { length: 5 },
                    (_, i) => app0.getUint8(i)
                )
            );

            if (signature === "JFIF\u0000") {
                const units = app0.getUint8(7);
                const x = app0.getUint16(8, false);
                const y = app0.getUint16(10, false);

                let factor = null;

                if (units === 1) factor = 1;
                if (units === 2) factor = 2.54;

                if (factor !== null) {
                    if (x > 0) result.dpiX = x * factor;
                    if (y > 0) result.dpiY = y * factor;
                }
            }
        }

        // EXIF: APP1.
        if (marker === 0xE1 && dataLength >= 14) {
            const app1 = await readView(file, dataOffset, dataLength);
            const exif = readExifDpi(app1);

            if (exif) {
                if (exif.dpiX !== null) result.dpiX = exif.dpiX;
                if (exif.dpiY !== null) result.dpiY = exif.dpiY;
            }
        }

        // После SOS идут сжатые данные изображения.
        if (marker === 0xDA) break;

        offset = nextOffset;
    }

    if (result.width === null || result.height === null) {
        throw new Error("Не удалось найти размеры JPEG");
    }

    result.compression = "JPEG";
    return result;
}
