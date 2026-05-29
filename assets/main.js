"use strict";
const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.esm.min.mjs";
const SAMPLE_CODE = `flowchart LR
  Start([開始]) --> Input[Mermaidを入力]
  Input --> Preview{プレビュー確認}
  Preview -->|OK| Export[PNG / SVGで保存]
  Preview -->|修正| Input
  Export --> Done([完了])`;
const state = {
    code: SAMPLE_CODE,
    theme: "default",
    background: "#ffffff",
    width: 1200,
    padding: 32,
    currentSvg: "",
    error: null,
    renderToken: 0,
};
let mermaid = null;
let renderTimer = 0;
const input = getElement("mermaidInput");
const themeSelect = getElement("themeSelect");
const backgroundInput = getElement("backgroundColor");
const widthInput = getElement("outputWidth");
const paddingInput = getElement("paddingSize");
const statusMessage = getElement("statusMessage");
const previewSurface = getElement("previewSurface");
const diagramStage = getElement("diagramStage");
const downloadPng = getElement("downloadPng");
const downloadSvg = getElement("downloadSvg");
input.value = state.code;
themeSelect.value = state.theme;
backgroundInput.value = state.background;
widthInput.value = String(state.width);
paddingInput.value = String(state.padding);
updatePreviewSettings();
void boot();
async function boot() {
    try {
        const module = (await import(MERMAID_CDN));
        mermaid = module.default;
        bindEvents();
        await renderDiagram();
    }
    catch (error) {
        state.error = toMessage(error);
        setStatus("Mermaidの読み込みに失敗しました。通信環境を確認してください。", "error");
        updateDownloadState();
    }
}
function bindEvents() {
    input.addEventListener("input", () => {
        state.code = input.value;
        scheduleRender();
    });
    themeSelect.addEventListener("change", () => {
        state.theme = themeSelect.value;
        void renderDiagram();
    });
    backgroundInput.addEventListener("input", () => {
        state.background = backgroundInput.value;
        updatePreviewSettings();
    });
    widthInput.addEventListener("input", () => {
        state.width = readNumber(widthInput, 320, 4000, state.width);
        widthInput.value = String(state.width);
        updatePreviewSettings();
    });
    paddingInput.addEventListener("input", () => {
        state.padding = readNumber(paddingInput, 0, 200, state.padding);
        paddingInput.value = String(state.padding);
        updatePreviewSettings();
    });
    downloadPng.addEventListener("click", () => {
        void downloadAsPng();
    });
    downloadSvg.addEventListener("click", downloadAsSvg);
}
function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
        void renderDiagram();
    }, 250);
}
async function renderDiagram() {
    if (!mermaid) {
        return;
    }
    const code = state.code.trim();
    const token = state.renderToken + 1;
    state.renderToken = token;
    if (!code) {
        state.currentSvg = "";
        state.error = "Mermaidコードを入力してください。";
        diagramStage.innerHTML = '<p class="placeholder">Mermaidコードを入力してください。</p>';
        setStatus(state.error, "error");
        updateDownloadState();
        return;
    }
    setStatus("プレビューを更新しています。", "busy");
    updateDownloadState();
    try {
        mermaid.initialize({
            startOnLoad: false,
            theme: state.theme,
            securityLevel: "strict",
            fontFamily: "Inter, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        });
        const result = await mermaid.render(`mermaid-${Date.now()}-${token}`, code);
        if (token !== state.renderToken) {
            return;
        }
        state.currentSvg = result.svg;
        state.error = null;
        diagramStage.innerHTML = result.svg;
        result.bindFunctions?.(diagramStage);
        setStatus("プレビューを更新しました。", "ready");
    }
    catch (error) {
        if (token !== state.renderToken) {
            return;
        }
        state.error = `Mermaid構文を確認してください。${toMessage(error)}`;
        setStatus(state.error, "error");
        if (!state.currentSvg) {
            diagramStage.innerHTML =
                '<p class="placeholder">構文を修正するとプレビューが表示されます。</p>';
        }
    }
    updateDownloadState();
}
function updatePreviewSettings() {
    previewSurface.style.setProperty("--export-background", state.background);
    previewSurface.style.setProperty("--export-width", `${state.width}px`);
    previewSurface.style.setProperty("--export-padding", `${state.padding}px`);
}
function updateDownloadState() {
    const disabled = !state.currentSvg || Boolean(state.error);
    downloadPng.disabled = disabled;
    downloadSvg.disabled = disabled;
}
function setStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("is-busy", type === "busy");
    statusMessage.classList.toggle("is-error", type === "error");
}
function downloadAsSvg() {
    if (!state.currentSvg || state.error) {
        return;
    }
    try {
        const exportSvg = buildExportSvg();
        const blob = new Blob([exportSvg.svg], {
            type: "image/svg+xml;charset=utf-8",
        });
        downloadBlob(blob, "mermaid-diagram.svg");
    }
    catch (error) {
        setStatus(toMessage(error), "error");
    }
}
async function downloadAsPng() {
    if (!state.currentSvg || state.error) {
        return;
    }
    try {
        const exportSvg = buildExportSvg();
        const image = await loadImageFromSvg(exportSvg.svg);
        const canvas = document.createElement("canvas");
        canvas.width = exportSvg.width;
        canvas.height = exportSvg.height;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Canvasを初期化できませんでした。");
        }
        context.drawImage(image, 0, 0);
        const blob = await canvasToBlob(canvas);
        downloadBlob(blob, "mermaid-diagram.png");
    }
    catch (error) {
        setStatus(toMessage(error), "error");
    }
}
function buildExportSvg() {
    const original = parseSvg(state.currentSvg);
    sanitizeSvgForCanvas(original);
    const box = getSvgBox(original);
    const usableWidth = Math.max(1, state.width - state.padding * 2);
    const scale = usableWidth / box.width;
    const height = Math.ceil(box.height * scale + state.padding * 2);
    const content = serializeChildren(original);
    const safeBackground = escapeAttribute(state.background);
    return {
        width: state.width,
        height,
        svg: [
            '<?xml version="1.0" encoding="UTF-8"?>',
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${state.width}" height="${height}" viewBox="0 0 ${state.width} ${height}">`,
            `<rect width="100%" height="100%" fill="${safeBackground}"/>`,
            `<g transform="translate(${state.padding} ${state.padding}) scale(${scale}) translate(${-box.x} ${-box.y})">`,
            content,
            "</g>",
            "</svg>",
        ].join(""),
    };
}
function parseSvg(svgText) {
    const documentFromSvg = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const parserError = documentFromSvg.querySelector("parsererror");
    const svg = documentFromSvg.documentElement;
    if (parserError || svg.nodeName.toLowerCase() !== "svg") {
        throw new Error("SVGの解析に失敗しました。");
    }
    return svg;
}
function sanitizeSvgForCanvas(svg) {
    svg
        .querySelectorAll("script, foreignObject, iframe, canvas, audio, video")
        .forEach((element) => element.remove());
    svg.querySelectorAll("style").forEach((styleElement) => {
        styleElement.textContent = sanitizeCss(styleElement.textContent ?? "");
    });
    svg.querySelectorAll("*").forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (name === "style") {
                element.setAttribute(attribute.name, sanitizeCss(value));
                return;
            }
            if (isReferenceAttribute(name) && isUnsafeReference(value)) {
                element.removeAttribute(attribute.name);
                return;
            }
            if (hasUnsafeCssUrl(value)) {
                element.removeAttribute(attribute.name);
            }
        });
    });
}
function sanitizeCss(css) {
    return css
        .replace(/@import[^;]+;/gi, "")
        .replace(/@font-face\s*\{[^}]*\}/gi, "")
        .replace(/url\(\s*(['"]?)(?!#|data:image\/)[^)]+\1\s*\)/gi, "none");
}
function isReferenceAttribute(name) {
    return name === "href" || name === "src" || name.endsWith(":href");
}
function isUnsafeReference(value) {
    if (!value || value.startsWith("#") || value.startsWith("data:image/")) {
        return false;
    }
    return /^(https?:|file:|blob:|data:)/i.test(value);
}
function hasUnsafeCssUrl(value) {
    return /url\(\s*(['"]?)(?!#|data:image\/)[^)]+\1\s*\)/i.test(value);
}
function getSvgBox(svg) {
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
        const values = viewBox
            .trim()
            .split(/[\s,]+/)
            .map((value) => Number(value));
        if (values.length === 4 &&
            values.every((value) => Number.isFinite(value)) &&
            values[2] > 0 &&
            values[3] > 0) {
            return {
                x: values[0],
                y: values[1],
                width: values[2],
                height: values[3],
            };
        }
    }
    const width = parseSvgLength(svg.getAttribute("width")) ?? 800;
    const height = parseSvgLength(svg.getAttribute("height")) ?? 600;
    return { x: 0, y: 0, width, height };
}
function parseSvgLength(value) {
    if (!value) {
        return null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function serializeChildren(element) {
    const serializer = new XMLSerializer();
    return Array.from(element.childNodes)
        .map((node) => serializer.serializeToString(node))
        .join("");
}
function loadImageFromSvg(svg) {
    return new Promise((resolve, reject) => {
        const url = svgToDataUrl(svg);
        const image = new Image();
        image.onload = () => {
            resolve(image);
        };
        image.onerror = () => {
            reject(new Error("PNG変換用の画像を読み込めませんでした。"));
        };
        image.src = url;
    });
}
function svgToDataUrl(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                }
                else {
                    reject(new Error("PNGファイルを作成できませんでした。"));
                }
            }, "image/png");
        }
        catch (error) {
            reject(toCanvasExportError(error));
        }
    });
}
function toCanvasExportError(error) {
    if (error instanceof DOMException && error.name === "SecurityError") {
        return new Error("PNG保存に失敗しました。SVG内の外部画像や外部フォント参照を削除してください。");
    }
    if (error instanceof Error) {
        return error;
    }
    return new Error("PNGファイルを作成できませんでした。");
}
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
function readNumber(element, min, max, fallback) {
    const parsed = Number.parseInt(element.value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`#${id} が見つかりません。`);
    }
    return element;
}
function escapeAttribute(value) {
    return value.replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
        };
        return entities[character];
    });
}
function toMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message.replace(/\s+/g, " ").trim();
    }
    return "不明なエラーが発生しました。";
}
