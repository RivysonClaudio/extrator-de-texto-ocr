class PdfToImageParser {
    constructor(file) {
        this.file = file;
    }

    async parse() {
        try {
            const pdf = await this._loadPdf();
            const pageCanvases = await this._renderAllPages(pdf);
            const combinedCanvas = this._combineCanvases(pageCanvases);
            return combinedCanvas.toDataURL('image/png');
        } catch (error) {
            console.error("Erro ao processar PDF:", error);
            throw new Error("Erro ao processar PDF.");
        }
    }

    _readFileAsArrayBuffer() {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsArrayBuffer(this.file);
            reader.onload = () => resolve(new Uint8Array(reader.result));
            reader.onerror = () => reject("Erro ao ler o arquivo.");
        });
    }

    async _loadPdf() {
        const typedArray = await this._readFileAsArrayBuffer();
        const loadingTask = pdfjsLib.getDocument(typedArray);
        return await loadingTask.promise;
    }

    async _renderPageToCanvas(page, scale = 2) {
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };

        await page.render(renderContext).promise;
        return canvas;
    }

    async _renderAllPages(pdf) {
        const canvases = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const canvas = await this._renderPageToCanvas(page);
            canvases.push(canvas);
        }

        return canvases;
    }

    _combineCanvases(canvases) {
        const totalHeight = canvases.reduce((sum, c) => sum + c.height, 0);
        const maxWidth = Math.max(...canvases.map(c => c.width));

        const combinedCanvas = document.createElement('canvas');
        const context = combinedCanvas.getContext('2d', { willReadFrequently: true });
        combinedCanvas.width = maxWidth;
        combinedCanvas.height = totalHeight;

        let yOffset = 0;
        for (const canvas of canvases) {
            context.drawImage(canvas, 0, yOffset);
            yOffset += canvas.height;
        }

        return combinedCanvas;
    }
}

const canvasModal = document.getElementById('canvasModal');
const canvas = document.getElementById('canvas');
const scrollContainer = document.querySelector('.canvasBox');
const ctx = canvas.getContext('2d');
let img = [];
let rect = null;
let columns = {}, rows = {};
let columnHistory = {}, rowHistory = {};
let drawing = false;
let isDragging = false;
let startX, startY;
let scrollLeft, scrollTop;
let whiteBalance = 229.5;
let blackBalance = 25.5;
let currentPage = 1;

setExpandAndMinimizeModalFeature();
setControlOfWhiteAndBlackBalanceOfTheDocument();
setControlOfZoomInAndOutInDocument();
setConfigAndListenersThatAllowsDrawingInDocument();
setConfigThatAllowsDragTheDocument();

function setExpandAndMinimizeModalFeature(){
    const expand = document.getElementById('canvasModalCollapsedWindow');
    expand.addEventListener('click', () => {
        document.getElementById('canvasModalCollapsedWindow').style.display = 'none';
        canvasModal.showModal();
        document.getElementById('initial-instructions').style.display = 'none';
    });
    const collapse = document.getElementById('collapseCanvas');
    collapse.addEventListener('click', () => {
        document.getElementById('canvasModalCollapsedWindow').style.display = 'flex';
        canvasModal.close();
    });

}

function setControlOfWhiteAndBlackBalanceOfTheDocument(){
    const whiteBalanceControl = document.getElementById('whiteBalanceControl');
    whiteBalanceControl.addEventListener('input', () => {
        whiteBalance = 255 * (whiteBalanceControl.value / 100);
        drawAll(whiteBalance, blackBalance, img);
    });
        const blackBalanceControl = document.getElementById('blackBalanceControl');
    blackBalanceControl.addEventListener('input', () => {
        blackBalance = 255 * (blackBalanceControl.value / 100);
        drawAll(whiteBalance, blackBalance,img);
    });
}

function setControlOfZoomInAndOutInDocument(){
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const scaler = document.querySelector('.canvas-inner');
    let currentScale = 1;
    zoomIn.addEventListener('click', () => {
        currentScale += 0.1;
        scaler.style.transform = `scale(${currentScale})`;
    });
    zoomOut.addEventListener('click', () => {
        currentScale = Math.max(0.1, currentScale - 0.1); // evita zoom reverso negativo
        scaler.style.transform = `scale(${currentScale})`;
    });
}

function setConfigAndListenersThatAllowsDrawingInDocument(){
    canvas.addEventListener('mousedown', e => {
    const rectStart = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rectStart.width;
    const scaleY = canvas.height / rectStart.height;
    const startX = (e.clientX - rectStart.left) * scaleX;
    const startY = (e.clientY - rectStart.top) * scaleY;
    drawing = true;
    rect = { x: startX, y: startY, w: 0, h: 0 };
});

canvas.addEventListener('mousemove', e => {
    if (!drawing || !rect) return;
    const rectStart = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rectStart.width;
    const scaleY = canvas.height / rectStart.height;
    rect.w = (e.clientX - rectStart.left) * scaleX - rect.x;
    rect.h = (e.clientY - rectStart.top) * scaleY - rect.y;
    drawAll(whiteBalance, blackBalance);
});

canvas.addEventListener('mouseup', () => {
    drawing = false;
});
}

function setConfigThatAllowsDragTheDocument(){
    canvas.addEventListener('mousedown', (e) => {
        if(e.ctrlKey){
            isDragging = true;
            canvas.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;

            // Salva a posição do scroll atual do container
            scrollLeft = scrollContainer.scrollLeft;
            scrollTop = scrollContainer.scrollTop;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if(e.ctrlKey){
            if (!isDragging) return;
            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            scrollContainer.scrollLeft = scrollLeft - dx;
            scrollContainer.scrollTop = scrollTop - dy;
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'crosshair';
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        canvas.style.cursor = 'crosshair';
    });
}

function drawAll(whiteBalance, blackBalance, imgs) {
    if(!img) img = imgs;
    
    const page = currentPage - 1;

    for(let i = 1; i <= img.length; i++){
        if(!columns[`Page_${i}`]) columns[`Page_${i}`] = [];
        if(!rows[`Page_${i}`]) rows[`Page_${i}`] = [];
    }

    canvas.width = img[page].width;
    canvas.height = img[page].height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = img[page].width;
    tempCanvas.height = img[page].height;
    tempCtx.drawImage(img[page], 0, 0);   

    // 2. Get the image data from the temporary canvas
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data; // This is a Uint8ClampedArray representing pixel data

    // 3. Iterate through pixels and apply black and white conversion
    for (let i = 0; i < data.length; i += 4) {
        const red = data[i];
        const green = data[i + 1];
        const blue = data[i + 2];

        // Calculate luminance (common way to convert to grayscale)
        const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722);

        if (luminance > whiteBalance) {
            data[i] = 255;   // Red
            data[i + 1] = 255;   // Green
            data[i + 2] = 255;   // Blue
        }

        if (luminance < blackBalance) {
            data[i] = 0;   // Red
            data[i + 1] = 0;   // Green
            data[i + 2] = 0;   // Blue
        }
    }

    // 4. Put the modified image data back onto the main canvas
    ctx.putImageData(imageData, 0, 0);

    // Now, draw your overlay elements (rectangle, columns, rows) on top
    if (rect) {
        ctx.strokeStyle = 'blue';
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }

    ctx.strokeStyle = 'blue';
    columns[`Page_${currentPage}`].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    });

    ctx.strokeStyle = 'blue';
    rows[`Page_${currentPage}`].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    });
}



document.getElementById('upload').addEventListener('change', async (e) => {
    img = [];
    const file = e.target.files[0];
    if (!file) return;

    if(file.type === 'application/pdf'){

        const pdfToImageParser = new PdfToImageParser(file);
        const pdf = await pdfToImageParser._loadPdf();
        const pdfAsImage = await pdfToImageParser._renderAllPages(pdf);

        const loadImage = (canvas) => {
            return new Promise((resolve) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.src = canvas.toDataURL('image/png');
            });
        };

        img = await Promise.all(pdfAsImage.map(loadImage));

        document.querySelector('#canvas-pages').value = `${currentPage}-${img.length}`;

        drawAll(whiteBalance, blackBalance, img);
    }

    if(file.type.startsWith('image/')){
        const reader = new FileReader();

        reader.onload = () => {
            const clipBoardImage = new Image();

            clipBoardImage.onload = () => {
                canvas.width = clipBoardImage.width;
                canvas.height = clipBoardImage.height;

                img = [clipBoardImage];

                drawAll(whiteBalance, blackBalance, img);

                if(!columns[`Page_1`]) columns[`Page_1`] = [];
                if(!rows[`Page_1`]) rows[`Page_1`] = [];

                document.querySelector('#canvas-pages').value = `${currentPage}-${img.length}`;
            }

            clipBoardImage.src = reader.result;
        }

        reader.readAsDataURL(file);
    }
});

document.addEventListener('paste', (e) => {
    img = [];
    const items = e.clipboardData?.items;

    for (let item of items) {
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            const url = URL.createObjectURL(file);

            const image = new Image();

            image.onload = () => {
                if (!Array.isArray(img)) img = [];

                img = [image]; // ou img.push(image); se quiser acumular

                canvas.width = image.width;
                canvas.height = image.height;
                drawAll(whiteBalance, blackBalance, img);

                document.querySelector('#canvas-pages').value = `${currentPage}-${img.length}`;

                // Limpar objeto URL para liberar memória
                URL.revokeObjectURL(url);
            };

            image.src = url;

            break;
        }
    }
});

canvas.addEventListener('click', e => {
    if (!rect) return;
    const rectStart = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rectStart.width;
    const scaleY = canvas.height / rectStart.height;
    const x = (e.clientX - rectStart.left) * scaleX;
    const y = (e.clientY - rectStart.top) * scaleY;

    if (e.shiftKey) {
        if(!columnHistory[`Page_${currentPage}`]) columnHistory[`Page_${currentPage}`] = [];
        columnHistory[`Page_${currentPage}`].push([...(columns[`Page_${currentPage}`] ?? [])]);

        if(document.getElementById('allPagesColumns').checked){
            for(let i = 1; i <= img.length; i++){
                columns[`Page_${i}`].push(x);
                columns[`Page_${i}`].sort((a, b) =>  a - b);
            }
        }else{
            columns[`Page_${currentPage}`].push(x);
            columns[`Page_${currentPage}`].sort((a, b) =>  a - b);
        }
    }
    else if (e.altKey) {
        if(!rowHistory[`Page_${currentPage}`]) rowHistory[`Page_${currentPage}`] = [];
        rowHistory[`Page_${currentPage}`].push([...(rows[`Page_${currentPage}`] ?? [])]);

        if(document.getElementById('allPagesRows').checked){
            for(let i = 1; i <= img.length; i++){
            rows[`Page_${i}`].push(y);
            rows[`Page_${i}`].sort((a, b) => a - b);
            }
        }else{
            rows[`Page_${currentPage}`].push(y);
            rows[`Page_${currentPage}`].sort((a, b) => a - b);
        }
    }
    drawAll(whiteBalance, blackBalance, img);
});

document.getElementById('reset').onclick = () => {
    columnHistory = {};
    rowHistory = {};
    rect = null;
    columns = {};
    rows = {};
    drawAll(whiteBalance, blackBalance, img);
};

document.getElementById('extrair').onclick = async (e) => {
    const log = document.getElementById('loading-log');
    const atmRows = document.getElementById('detect-row');
    const lang = document.getElementById('lang');

    canvasModal.close();
    document.getElementById('canvasModalCollapsedWindow').style.display = 'flex';
    document.getElementById('debug-output').innerHTML = "";
    document.getElementById('exportar').style.display = 'none';
    document.getElementById('output').innerHTML = '';
    document.getElementById('loader').style.display = 'flex';

    let html = '<table id="result-table" style="margin-bottom: 8rem;">';
    let csv = '';
    html += '<tr>';

    log.value = "";
    let lastStatus = "";

    const worker = await Tesseract.createWorker({
        logger: m => {
            if(m.progress == 1){
                log.value += `[${currentPage}/${img.length}]    ${m.status}... ${(m.progress * 100).toFixed(2)}%\n\n`;
            }
            else{
                log.value = log.value.replace(lastStatus, '');
                lastStatus = `[${currentPage}/${img.length}]    ${m.status}... ${(m.progress * 100).toFixed(2)}%\n\n`;
                log.value += lastStatus;
            }
            setTimeout(() => { log.scrollTop = log.scrollHeight }, 1);
        }
    });

    await worker.load();
    await worker.loadLanguage(lang.value);
    await worker.initialize(lang.value);
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789.,+-R$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÇÉÊËÍÎÏÓÔÕÖÚÛÜàáâãäçéêëíîïóôõöúûü _/%',
        tessedit_char_blacklist: '|—',
        tessedit_pageseg_mode: '3',
        user_defined_dpi: '300'
    });

    for (let i = 1; i <= img.length; i++) {
        currentPage = i;
        try {
            if (!rect || columns[`Page_${currentPage}`].length < 2 || rows[`Page_${currentPage}`].length < 2) {
                log.value += `[${currentPage}/${img.length}]    Invalid arguments, page is not readable.\n\n`;
                continue;
            }

            const columnsCopy = columns[`Page_${currentPage}`];
            const rowsCopy = rows[`Page_${currentPage}`];
            columns[`Page_${currentPage}`] = [];
            rows[`Page_${currentPage}`] = [];
            drawAll(whiteBalance, blackBalance, img);

            // segurança extra
            if (!columnsCopy || !rowsCopy) throw new Error("Missing columns or rows");

            const cx = columnsCopy[0];
            const cy = rowsCopy[0];
            const cw = columnsCopy[columnsCopy.length - 1] - cx;
            const ch = rowsCopy[rowsCopy.length - 1] - cy;

            if (cw <= 0 || ch <= 0) throw new Error("Invalid crop dimensions");

            const temporaryCanvas = document.createElement('canvas');
            temporaryCanvas.width = cw * 2;
            temporaryCanvas.height = ch * 2;
            const ctx = temporaryCanvas.getContext('2d');
            ctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw * 2, ch * 2);

            const res = await worker.recognize(temporaryCanvas);
            const words = res.data.words || [];

            if (words.length === 0) {
                log.value += `[${currentPage}/${img.length}]    Empty page.\n\n`;
                continue;
            }

            if (e.ctrlKey) {
                debugCellPreviewGrid(canvas, cx, cy, cw, ch, res);
            }

            columns[`Page_${currentPage}`] = columnsCopy;
            rows[`Page_${currentPage}`] = rowsCopy;

            drawAll(whiteBalance, blackBalance, img);

            function getUniqueBboxes(words, tolerance = 20) {
                const ySet = [];

                words.forEach(word => {
                    const bbox = word.bbox || word.boundingBox;
                    if (!bbox || word.text == ' ') return;

                    const y = (bbox.y1 / 2) + rows[`Page_${currentPage}`][0] + 3;

                    const exists = ySet.some(existingY => Math.abs(existingY - y) <= tolerance);

                    if (!exists) {
                        ySet.push(y);
                    }
                });

                return ySet.sort((a, b) => a - b);
            }

            if (atmRows.value === '1') {
                const uniqueBboxes = getUniqueBboxes(words);
                rows[`Page_${currentPage}`] = [rows[`Page_${currentPage}`][0], ...uniqueBboxes];
                drawAll(whiteBalance, blackBalance, img);
            }

            rows[`Page_${currentPage}`].forEach((row, index) => {
                if (index === 0) return;

                let rowValues = [];

                const cellsText = columns[`Page_${currentPage}`].slice(0, -1).map(() => []);

                for (const word of words) {
                    const wordY0 = (word.bbox.y0 / 2) + rows[`Page_${currentPage}`][0];
                    const wordY1 = (word.bbox.y1 / 2) + rows[`Page_${currentPage}`][0];
                    const wordYCenter = (wordY0 + wordY1) / 2;

                    if (wordYCenter < rows[`Page_${currentPage}`][index - 1] || wordYCenter > row) continue;

                    const x0 = word.bbox.x0 / 2;
                    const x1 = word.bbox.x1 / 2;
                    const xCenter = (x0 + x1) / 2;

                    for (let j = 0; j < columns[`Page_${currentPage}`].length - 1; j++) {
                        const colStart = columns[`Page_${currentPage}`][j] - columns[`Page_${currentPage}`][0];
                        const colEnd = columns[`Page_${currentPage}`][j + 1] - columns[`Page_${currentPage}`][0];

                        if (xCenter >= colStart && xCenter <= colEnd) {
                            cellsText[j].push(word.text.replaceAll("|", "").replaceAll("—", ""));
                        }
                    }
                }

                for (const cellWords of cellsText) {
                    const cellText = cellWords.join(' ').trim();
                    html += `<td>${cellText}</td>`;
                    rowValues.push(cellText);
                }

                    csv += rowValues.join(';') + '\n';
                    html += '</tr>';
                    setTimeout(() => { log.scrollTop = log.scrollHeight }, 1);
            });
        } catch (err) {
            log.value += `[${currentPage}/${img.length}]    ERRO: ${err.message}\n\n`;
            continue;
        }
    }


    await worker.terminate();

    atmRows.value = '0';

    html += '</table>';

    log.value += "Process finished sucessufuly!";
    setTimeout(() => {
        document.getElementById('output').innerHTML = html;
        canvas.dataset.csv = csv;
        document.getElementById('loader').style.display = 'none';
        document.getElementById('exportar').style.display = 'block';
        
        drawAll(whiteBalance, blackBalance, img);
        document.getElementById('canvas-pages').value = `${currentPage}-${img.length}`;
    }, 2000);
};




canvas.addEventListener('dblclick', (e) => {
    if (!rect) return;
    const rectStart = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rectStart.width;
    const scaleY = canvas.height / rectStart.height;
    const x = (e.clientX - rectStart.left) * scaleX;
    const y = (e.clientY - rectStart.top) * scaleY;

    let pageRows = rows[`Page_${currentPage}`];
    let pageCols = columns[`Page_${currentPage}`];

    for(let i = 0; i < Math.max(pageRows.length, pageCols.length); i++){
        if(pageRows[i] && Math.abs(pageRows[i] - y) <= 3){
            pageRows.splice(i, 1);
            rows[`Page_${currentPage}`] = pageRows;
            drawAll(whiteBalance, blackBalance, img);
            break;
        }

        if (pageCols[i] && Math.abs(pageCols[i] - x) <= 3) {
            for (const pageKey in columns) {
                const pageColumnList = columns[pageKey];
                const colIndex = pageColumnList.findIndex(colX => Math.abs(colX - x) <= 3);
                if (colIndex !== -1) {
                    pageColumnList.splice(colIndex, 1);
                }
            }

            drawAll(whiteBalance, blackBalance, img);
            break;
        }
    }
});

document.getElementById('exportar').onclick = () => {
    const csv = canvas.dataset.csv;
    if (!csv) return alert('Nada para exportar.');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tabela.csv';
    a.click();
};

document.getElementById('excluir-lin').onclick = () => {

    if(rows[`Page_${currentPage}`].length != 2){
        alert(`Para excluir deve-se selecionar apenas 2 linhas, a do início do recorte a de fim do recorte.`);
        return;
    }

    const columnsCopy = columns[`Page_${currentPage}`];
    columns[`Page_${currentPage}`] = [];
    rowHistory[`Page_${currentPage}`] = [];
    const from = rows[`Page_${currentPage}`][0]-1;
    const to = rows[`Page_${currentPage}`][1]+1;
    rows[`Page_${currentPage}`] = [];
    rect = null;

    drawAll(255, 0, img);

    columns[`Page_${currentPage}`] = columnsCopy;

    const newCanvas = removeHorizontalSlice(canvas, from, to);

    canvas.width = newCanvas.width;
    canvas.height = newCanvas.height;
    canvas.getContext('2d').drawImage(newCanvas, 0, 0);

    img[currentPage - 1].onload = () => {
        drawAll(whiteBalance, blackBalance, img);
    };

    img[currentPage - 1].src = canvas.toDataURL();
}

document.getElementById('excluir-col').onclick = () => {
    // Validação apenas da página atual (como referência)
    if (columns[`Page_${currentPage}`].length !== 2) {
        alert(`Para excluir deve-se selecionar apenas 2 colunas, a do início do recorte a de fim do recorte.`);
        return;
    }

    rect = null;
    columnHistory = [];

    const from = columns[`Page_${currentPage}`][0] - 1;
    const to = columns[`Page_${currentPage}`][1] + 1;

    // Processar todas as páginas
    const promises = img.map((image, index) => {
        const pageKey = `Page_${index + 1}`;

        return new Promise((resolve) => {
            // Cria um canvas temporário para essa página
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = image.width;
            tempCanvas.height = image.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            const newCanvas = removeVerticalSlice(tempCanvas, from, to);

            // Substitui a imagem original
            const newImg = new Image();
            newImg.onload = () => {
                img[index] = newImg;

                // Preserva as linhas da página, mas zera as colunas
                if (rows[pageKey]) {
                    rows[pageKey] = [...rows[pageKey]];
                }
                columns[pageKey] = [];

                resolve();
            };
            newImg.src = newCanvas.toDataURL();
        });
    });

    // Depois de todas as imagens carregarem, redesenha
    Promise.all(promises).then(() => {
        drawAll(whiteBalance, blackBalance, img);
    });
};

document.getElementById('page-down').addEventListener('click', () => {
    if(currentPage == 1) return;
    document.getElementById('canvas-pages').value = `${--currentPage}-${img.length}`;
    drawAll(whiteBalance, blackBalance, img);
});
document.getElementById('page-up').addEventListener('click', () => {
    if(currentPage == img.length) return;
    document.getElementById('canvas-pages').value = `${++currentPage}-${img.length}`;
    drawAll(whiteBalance, blackBalance, img);
});
document.getElementById('canvas-pages').addEventListener('change', () => {
    const value = document.getElementById('canvas-pages').value.split('-');
    if(value[0] < 1 || value[1] != img.length || value[0] > img.length){
        currentPage = 0;
        document.getElementById('canvas-pages').value = `${++currentPage}-${img.length}`;
        drawAll(whiteBalance, blackBalance, img);
        return;
    }
    currentPage = parseInt(value[0], 10);
    drawAll(whiteBalance, blackBalance, img);
});



function removeHorizontalSlice(originalCanvas, y1, y2) {
    const width = originalCanvas.width;
    const height = originalCanvas.height;

    // Garantir que y1 < y2
    if (y1 > y2) [y1, y2] = [y2, y1];

    const sliceHeight = y2 - y1;
    const newHeight = height - sliceHeight;

    // Criar novo canvas com altura menor
    const newCanvas = document.createElement('canvas');
    newCanvas.width = width;
    newCanvas.height = newHeight;
    const ctxNew = newCanvas.getContext('2d');

    // Copiar parte de cima (até y1)
    ctxNew.drawImage(originalCanvas, 0, 0, width, y1, 0, 0, width, y1);

    // Copiar parte de baixo (de y2 até o final)
    const remainingHeight = height - y2;
    ctxNew.drawImage(originalCanvas, 0, y2, width, remainingHeight, 0, y1, width, remainingHeight);

    return newCanvas;
}

function removeVerticalSlice(originalCanvas, x1, x2) {
    const width = originalCanvas.width;
    const height = originalCanvas.height;

    // Garantir que x1 < x2
    if (x1 > x2) [x1, x2] = [x2, x1];

    const sliceWidth = x2 - x1;
    const newWidth = width - sliceWidth;

    // Criar novo canvas com largura menor
    const newCanvas = document.createElement('canvas');
    newCanvas.width = newWidth;
    newCanvas.height = height;
    const ctxNew = newCanvas.getContext('2d');

    // Copiar parte da esquerda (até x1)
    ctxNew.drawImage(originalCanvas, 0, 0, x1, height, 0, 0, x1, height);

    // Copiar parte da direita (de x2 até o final)
    const remainingWidth = width - x2;
    ctxNew.drawImage(originalCanvas, x2, 0, remainingWidth, height, x1, 0, remainingWidth, height);

    return newCanvas;
}



function debugCellPreviewGrid(canvas, cx, cy, cw, ch, tesseractResult) {

    const debugField = document.getElementById('debug-output');

    const title = document.createElement('h4');
    title.textContent = `Texto Reconhecido pelo Tesseract`;

    const debugCanvas = document.createElement('canvas');
    debugCanvas.style.maxWidth = '80vw';
    debugCanvas.width = cw;
    debugCanvas.height = ch;
    const ctx = debugCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);

    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 1;
    for (const word of tesseractResult.data.words) {
        const { x0, y0, x1, y1 } = word.bbox || word.boundingBox; // compatibilidade

        // Corrige as coordenadas relativas à subimagem (cx, cy)
        const rectX = x0 / 2 - 2;
        const rectY = y0 / 2 - 2;
        const rectW = x1 / 2 - rectX + 2;
        const rectH = y1 / 2 - rectY + 2;

        ctx.strokeRect(rectX, rectY, rectW, rectH);

        // (Opcional) Desenha o texto da palavra acima do bbox
        ctx.fillStyle = 'blue';
        ctx.font = '10px Arial';
        ctx.fillText(word.text, rectX, rectY - 2);
    }
    
    const result = document.createElement('textarea');
    result.rows = tesseractResult.data.text.split('\n').length;
    result.style.height = '20rem';
    result.style.width = '80vw';
    result.style.marginTop = '2rem';
    result.style.outline = 'none';
    result.value = tesseractResult.data.text;

    debugField.appendChild(title);
    debugField.appendChild(debugCanvas);
    debugField.appendChild(result);
}