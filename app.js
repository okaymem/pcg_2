
import { ImageEngine } from "./engine.js";

const folderInput = document.querySelector("#folderInput");
const fileInput = document.querySelector("#fileInput");
const startButton = document.querySelector("#startButton");
const cancelButton = document.querySelector("#cancelButton");

const selectionInfo = document.querySelector("#selectionInfo");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const completedCount = document.querySelector("#completedCount");
const successCount = document.querySelector("#successCount");
const errorCount = document.querySelector("#errorCount");
const statusText = document.querySelector("#statusText");
const resultsInfo = document.querySelector("#resultsInfo");

const tableContainer = document.querySelector("#tableContainer");
const resultsBody = document.querySelector("#resultsBody");

let selectedFiles = [];
let results = [];
let running = false;

const ROW_HEIGHT = 39;
const EXTRA_ROWS = 10;

function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

    if (typeof value === "number") {
        return Number.isInteger(value)
            ? String(value)
            : value.toFixed(2).replace(/\.?0+$/, "");
    }

    return String(value);
}

function updateSelection(files) {
    if (running) return;

    selectedFiles = Array.from(files);
    results = [];

    selectionInfo.textContent = selectedFiles.length
        ? `Выбрано файлов: ${selectedFiles.length.toLocaleString("ru-RU")}`
        : "Файлы не выбраны.";

    startButton.disabled = selectedFiles.length === 0;

    progressBar.value = 0;
    progressText.textContent = "0%";
    completedCount.textContent = "0";
    successCount.textContent = "0";
    errorCount.textContent = "0";
    resultsInfo.textContent = "Записей: 0";
    statusText.textContent = "Готов к анализу";

    tableContainer.scrollTop = 0;
    renderTable();
}

folderInput.addEventListener("change", () => {
    fileInput.value = "";
    updateSelection(folderInput.files);
});

fileInput.addEventListener("change", () => {
    folderInput.value = "";
    updateSelection(fileInput.files);
});

function addResult(result) {
    results.push(result);

    resultsInfo.textContent =
        `Записей: ${results.length.toLocaleString("ru-RU")}`;

    if (results.length % 10 === 0) {
        renderTable();
    }
}

function createSpacerRow(height) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 9;
    cell.style.height = `${height}px`;
    cell.style.padding = "0";
    cell.style.border = "0";

    row.append(cell);
    return row;
}

function renderTable() {
    const total = results.length;
    const viewportHeight = tableContainer.clientHeight || 520;

    const firstVisible = Math.max(
        0,
        Math.floor(tableContainer.scrollTop / ROW_HEIGHT)
    );

    const visibleCount =
        Math.ceil(viewportHeight / ROW_HEIGHT) + EXTRA_ROWS * 2;

    const start = Math.max(0, firstVisible - EXTRA_ROWS);
    const end = Math.min(total, start + visibleCount);

    const fragment = document.createDocumentFragment();

    if (total === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 9;
        cell.className = "empty";
        cell.textContent = "Результатов пока нет";

        row.append(cell);
        fragment.append(row);
        resultsBody.replaceChildren(fragment);
        return;
    }

    if (start > 0) {
        fragment.append(createSpacerRow(start * ROW_HEIGHT));
    }

    for (let i = start; i < end; i++) {
        const result = results[i];
        const row = document.createElement("tr");

        const values = [
            result.fileName,
            result.format?.toUpperCase() ?? "—",
            formatNumber(result.width),
            formatNumber(result.height),
            formatNumber(result.dpiX),
            formatNumber(result.dpiY),
            formatNumber(result.colorDepth),
            formatNumber(result.compression),
            result.error || "OK"
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = value;

            if (index === 0) {
                cell.className = "filename";
                cell.title = result.fileName ?? "";
            }

            if (index === 8 && result.error) {
                cell.className = "error";
                cell.title = result.error;
            }

            row.append(cell);
        });

        fragment.append(row);
    }

    if (end < total) {
        fragment.append(createSpacerRow((total - end) * ROW_HEIGHT));
    }

    resultsBody.replaceChildren(fragment);
}

tableContainer.addEventListener("scroll", renderTable);

const engine = new ImageEngine({
    onResult(result) {
        addResult(result);
    },

    onProgress(progress) {
        progressBar.value = progress.percent;
        progressText.textContent = `${progress.percent}%`;

        completedCount.textContent =
            progress.completed.toLocaleString("ru-RU");

        successCount.textContent =
            progress.successful.toLocaleString("ru-RU");

        errorCount.textContent =
            progress.failed.toLocaleString("ru-RU");

        statusText.textContent =
            `Обработано ${progress.completed} из ${progress.total}`;
    },

    onError(result) {
        console.warn(
            "Ошибка анализа:",
            result.fileName,
            result.error
        );
    },

    onDone(summary) {
        running = false;

        startButton.disabled = selectedFiles.length === 0;
        cancelButton.disabled = true;

        renderTable();

        if (summary.cancelled) {
            statusText.textContent =
                `Обработка отменена. Обработано: ${summary.completed}, ` +
                `пропущено: ${summary.skipped}.`;
        } else {
            statusText.textContent =
                `Готово. Успешно: ${summary.successful}, ` +
                `ошибок: ${summary.failed}.`;
        }
    }
});

startButton.addEventListener("click", async () => {
    if (running || selectedFiles.length === 0) return;

    results = [];
    tableContainer.scrollTop = 0;
    renderTable();

    running = true;
    startButton.disabled = true;
    cancelButton.disabled = false;

    statusText.textContent = "Начинаем анализ...";

    try {
        await engine.process(selectedFiles);
    } catch (error) {
        statusText.textContent = `Ошибка запуска: ${error.message}`;
        console.error(error);
    } finally {
        running = false;
        startButton.disabled = selectedFiles.length === 0;
        cancelButton.disabled = true;
        renderTable();
    }
});

cancelButton.addEventListener("click", () => {
    engine.cancel();
    cancelButton.disabled = true;
    statusText.textContent = "Завершаем текущий файл...";
});

renderTable();
