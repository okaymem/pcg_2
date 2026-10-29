
export async function readView(file, offset, length) {
    if (offset < 0 || length < 0 || offset >= file.size) {
        throw new Error("Выход за границы файла");
    }

    const buffer = await file.slice(offset, offset + length).arrayBuffer();

    if (buffer.byteLength < length) {
        throw new Error("Файл слишком короткий");
    }

    return new DataView(buffer);
}

export function ascii(view, offset, length) {
    let result = "";

    for (let i = 0; i < length; i++) {
        result += String.fromCharCode(view.getUint8(offset + i));
    }

    return result;
}

export function dpiFromPixelsPerMeter(value) {
    return value > 0 ? value * 0.0254 : null;
}

export function resultBase(format) {
    return {
        format,
        width: null,
        height: null,
        dpiX: null,
        dpiY: null,
        colorDepth: null,
        compression: null
    };
}
