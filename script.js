/**
 * =====================================================
 * Smart Image Resizer – Main Application Logic
 * =====================================================
 * Features:
 *   - Drag-and-drop & file input upload
 *   - Batch image support (multiple files)
 *   - Live preview with zoom controls
 *   - Aspect-ratio lock
 *   - Social media preset sizes
 *   - High-quality resize via Pica.js
 *   - EXIF orientation fix
 *   - Quality / compression slider
 *   - Output format selector (JPG, PNG, WebP)
 *   - Before / After comparison slider
 *   - Download single or all resized images
 *   - Dark / Light mode toggle with persistence
 *   - Toast notification system
 *   - Responsive & accessible
 * =====================================================
 */

// ── Pica instance (high-quality image resizer) ──────
const picaInstance = window.pica ? pica() : null;

// ── DOM element references ──────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Upload
    dropZone:           $('#dropZone'),
    fileInput:          $('#fileInput'),
    uploadSection:      $('#uploadSection'),
    batchSection:       $('#batchSection'),
    fileList:           $('#fileList'),
    fileCount:          $('#fileCount'),
    addMoreBtn:         $('#addMoreBtn'),
    clearAllBtn:        $('#clearAllBtn'),

    // Editor
    editorSection:      $('#editorSection'),
    widthInput:         $('#widthInput'),
    heightInput:        $('#heightInput'),
    lockAspect:         $('#lockAspect'),
    lockIcon:           $('#lockIcon'),
    originalDimensions: $('#originalDimensions'),
    scalePercent:       $('#scalePercent'),

    // Quality & Format
    qualitySlider:      $('#qualitySlider'),
    qualityValue:       $('#qualityValue'),
    formatBtns:         $$('.format-btn'),

    // Preview
    previewContainer:   $('#previewContainer'),
    previewPlaceholder: $('#previewPlaceholder'),
    previewImage:       $('#previewImage'),
    compareToggle:      $('#compareToggle'),
    comparisonContainer:$('#comparisonContainer'),
    compareOriginal:    $('#compareOriginal'),
    compareResizedImg:  $('#compareResizedImg'),
    compareResized:     $('#compareResized'),
    comparisonSlider:   $('#comparisonSlider'),
    zoomIn:             $('#zoomIn'),
    zoomOut:            $('#zoomOut'),
    zoomFit:            $('#zoomFit'),

    // Actions
    resizeBtn:          $('#resizeBtn'),
    resizeAllBtn:       $('#resizeAllBtn'),
    downloadBtn:        $('#downloadBtn'),
    downloadAllBtn:     $('#downloadAllBtn'),
    resetBtn:           $('#resetBtn'),
    resultsSection:     $('#resultsSection'),

    // Stats
    originalSize:       $('#originalSize'),
    resizedSize:        $('#resizedSize'),
    savedPercent:       $('#savedPercent'),

    // Theme
    themeToggle:        $('#themeToggle'),

    // Processing
    processingOverlay:  $('#processingOverlay'),
    processingText:     $('#processingText'),
    processingBar:      $('#processingBar'),

    // Toast
    toastContainer:     $('#toastContainer'),

    // Canvas
    resizeCanvas:       $('#resizeCanvas'),
};

// ── Application state ───────────────────────────────
const state = {
    files: [],                   // Array of { file, originalUrl, img, resizedBlob, resizedUrl }
    activeIndex: 0,              // Currently selected file
    aspectLocked: true,          // Aspect ratio lock
    aspectRatio: 1,              // Current aspect ratio (w/h)
    originalWidth: 0,
    originalHeight: 0,
    outputFormat: 'image/jpeg',  // Default output format
    outputExt: 'jpg',
    quality: 0.9,                // Compression quality (0-1)
    zoomLevel: 1,
    isComparing: false,
    isDraggingSlider: false,
};

// ── Initialization ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initUpload();
    initControls();
    initPresetButtons();
    initFormatButtons();
    initQualitySlider();
    initZoomControls();
    initComparisonSlider();
    initScrollAnimations();
    initServiceWorker();

    // Initialize Lucide icons
    if (window.lucide) lucide.createIcons();
});

// =====================================================
// THEME (Dark / Light mode)
// =====================================================
function initTheme() {
    // Load saved theme preference
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    setTheme(theme);

    dom.themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Update meta theme color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', theme === 'dark' ? '#1e1e2e' : '#6366f1');
    }

    // Re-render icons after theme change
    requestAnimationFrame(() => {
        if (window.lucide) lucide.createIcons();
    });
}

// =====================================================
// FILE UPLOAD (Drag-and-drop + File input)
// =====================================================
function initUpload() {
    const { dropZone, fileInput, addMoreBtn, clearAllBtn } = dom;

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    // File input change
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // Drag-and-drop events
    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
            dropZone.querySelector('.upload-drag-overlay')?.classList.remove('hidden');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
            dropZone.querySelector('.upload-drag-overlay')?.classList.add('hidden');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length) handleFiles(files);
    });

    // Add more / clear all
    addMoreBtn.addEventListener('click', () => fileInput.click());
    clearAllBtn.addEventListener('click', clearAll);
}

/**
 * Process uploaded files – validates, reads, and sets up state
 */
async function handleFiles(fileList) {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
    const maxSize = 50 * 1024 * 1024; // 50 MB

    const newFiles = [];
    for (const file of fileList) {
        if (!validTypes.includes(file.type)) {
            showToast(`Unsupported format: ${file.name}`, 'error');
            continue;
        }
        if (file.size > maxSize) {
            showToast(`File too large: ${file.name} (max 50MB)`, 'error');
            continue;
        }
        newFiles.push(file);
    }

    if (!newFiles.length) return;

    showProcessing('Loading images...');

    for (let i = 0; i < newFiles.length; i++) {
        updateProcessingBar((i / newFiles.length) * 100);
        const file = newFiles[i];
        try {
            const result = await loadImage(file);
            state.files.push(result);
        } catch (err) {
            showToast(`Failed to load: ${file.name}`, 'error');
            console.error(err);
        }
    }

    hideProcessing();
    dom.fileInput.value = ''; // Reset input

    if (state.files.length) {
        selectFile(state.files.length - newFiles.length); // Select first of new batch
        renderFileList();
        showEditor();
        showToast(`${newFiles.length} image${newFiles.length > 1 ? 's' : ''} loaded`, 'success');
    }
}

/**
 * Load an image file, fix EXIF orientation, return state object
 */
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Fix EXIF orientation by drawing to canvas first
                const { canvas, width, height } = fixOrientation(img);
                const fixedUrl = canvas.toDataURL('image/png');

                resolve({
                    file,
                    originalUrl: fixedUrl,
                    img: img,
                    naturalWidth: width,
                    naturalHeight: height,
                    originalSize: file.size,
                    resizedBlob: null,
                    resizedUrl: null,
                });
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Fix EXIF orientation by re-drawing on canvas
 * (Modern browsers handle this via CSS, but canvas needs it)
 */
function fixOrientation(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    return { canvas, width: img.naturalWidth, height: img.naturalHeight };
}

// =====================================================
// FILE LIST & BATCH MANAGEMENT
// =====================================================
function renderFileList() {
    const { fileList, batchSection, fileCount, resizeAllBtn, downloadAllBtn } = dom;

    if (state.files.length === 0) {
        batchSection.classList.add('hidden');
        return;
    }

    batchSection.classList.remove('hidden');
    fileCount.textContent = `(${state.files.length})`;
    fileList.innerHTML = '';

    state.files.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `file-item${index === state.activeIndex ? ' active' : ''}${item.resizedBlob ? ' processed' : ''}`;
        div.style.animationDelay = `${index * 50}ms`;
        div.innerHTML = `
            <img src="${item.originalUrl}" alt="${item.file.name}" loading="lazy">
            <div class="file-name">${item.file.name}</div>
            <button class="file-remove" title="Remove" aria-label="Remove ${item.file.name}">&times;</button>
            ${item.resizedBlob ? '<div class="file-status bg-green-500 text-white">✓</div>' : ''}
        `;

        // Select on click
        div.addEventListener('click', (e) => {
            if (e.target.closest('.file-remove')) return;
            selectFile(index);
            renderFileList();
        });

        // Remove button
        div.querySelector('.file-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(index);
        });

        fileList.appendChild(div);
    });

    // Show batch buttons if multiple files
    if (state.files.length > 1) {
        resizeAllBtn.classList.remove('hidden');
        downloadAllBtn.classList.remove('hidden');
    } else {
        resizeAllBtn.classList.add('hidden');
        downloadAllBtn.classList.add('hidden');
    }
}

function selectFile(index) {
    if (index < 0 || index >= state.files.length) return;
    state.activeIndex = index;
    const item = state.files[index];

    // Update dimensions
    state.originalWidth = item.naturalWidth;
    state.originalHeight = item.naturalHeight;
    state.aspectRatio = item.naturalWidth / item.naturalHeight;

    dom.widthInput.value = item.naturalWidth;
    dom.heightInput.value = item.naturalHeight;
    dom.originalDimensions.textContent = `${item.naturalWidth} × ${item.naturalHeight}`;
    updateScalePercent();

    // Update preview
    showPreviewImage(item.resizedUrl || item.originalUrl);

    // Update results if resized
    if (item.resizedBlob) {
        showResults(item);
    } else {
        dom.resultsSection.classList.add('hidden');
    }

    // Enable resize button
    dom.resizeBtn.disabled = false;
    dom.resizeAllBtn.disabled = false;
}

function removeFile(index) {
    // Revoke object URLs to free memory
    const item = state.files[index];
    if (item.resizedUrl) URL.revokeObjectURL(item.resizedUrl);

    state.files.splice(index, 1);

    if (state.files.length === 0) {
        clearAll();
        return;
    }

    // Adjust active index
    if (state.activeIndex >= state.files.length) {
        state.activeIndex = state.files.length - 1;
    }

    selectFile(state.activeIndex);
    renderFileList();
}

function clearAll() {
    // Revoke all URLs
    state.files.forEach(item => {
        if (item.resizedUrl) URL.revokeObjectURL(item.resizedUrl);
    });

    state.files = [];
    state.activeIndex = 0;

    dom.batchSection.classList.add('hidden');
    dom.editorSection.classList.add('hidden');
    dom.resultsSection.classList.add('hidden');
    dom.previewImage.classList.add('hidden');
    dom.previewPlaceholder.classList.remove('hidden');
    dom.compareToggle.classList.add('hidden');
    dom.comparisonContainer.classList.add('hidden');
    dom.resizeBtn.disabled = true;
    dom.widthInput.value = '';
    dom.heightInput.value = '';
    dom.originalDimensions.textContent = '—';
    dom.scalePercent.textContent = '100%';

    showToast('All images cleared', 'info');
}

function showEditor() {
    dom.editorSection.classList.remove('hidden');
    // Trigger scroll animations
    setTimeout(() => {
        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            el.classList.add('is-visible');
        });
    }, 100);
}

// =====================================================
// CONTROLS (Width / Height / Aspect Lock)
// =====================================================
function initControls() {
    const { widthInput, heightInput, lockAspect, resizeBtn, resizeAllBtn, downloadBtn, downloadAllBtn, resetBtn } = dom;

    // Width input change
    widthInput.addEventListener('input', () => {
        if (state.aspectLocked && widthInput.value) {
            const w = parseInt(widthInput.value);
            if (!isNaN(w)) {
                heightInput.value = Math.round(w / state.aspectRatio);
            }
        }
        updateScalePercent();
    });

    // Height input change
    heightInput.addEventListener('input', () => {
        if (state.aspectLocked && heightInput.value) {
            const h = parseInt(heightInput.value);
            if (!isNaN(h)) {
                widthInput.value = Math.round(h * state.aspectRatio);
            }
        }
        updateScalePercent();
    });

    // Aspect ratio lock toggle
    lockAspect.addEventListener('click', () => {
        state.aspectLocked = !state.aspectLocked;
        dom.lockIcon.setAttribute('data-lucide', state.aspectLocked ? 'lock' : 'unlock');
        lockAspect.classList.toggle('bg-primary-100', state.aspectLocked);
        lockAspect.classList.toggle('dark:bg-primary-900/40', state.aspectLocked);
        lockAspect.classList.toggle('bg-gray-100', !state.aspectLocked);
        lockAspect.classList.toggle('dark:bg-gray-800', !state.aspectLocked);
        lockAspect.title = state.aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio';
        if (window.lucide) lucide.createIcons();
        showToast(state.aspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked', 'info');
    });

    // Resize button
    resizeBtn.addEventListener('click', () => resizeCurrent());
    resizeAllBtn.addEventListener('click', () => resizeAll());

    // Download
    downloadBtn.addEventListener('click', downloadCurrent);
    downloadAllBtn.addEventListener('click', downloadAll);

    // Reset
    resetBtn.addEventListener('click', () => {
        const item = state.files[state.activeIndex];
        if (item) {
            if (item.resizedUrl) URL.revokeObjectURL(item.resizedUrl);
            item.resizedBlob = null;
            item.resizedUrl = null;
            selectFile(state.activeIndex);
            renderFileList();
            dom.resultsSection.classList.add('hidden');
            dom.compareToggle.classList.add('hidden');
            dom.comparisonContainer.classList.add('hidden');
            state.isComparing = false;
            showToast('Image reset to original', 'info');
        }
    });
}

function updateScalePercent() {
    const w = parseInt(dom.widthInput.value);
    if (!isNaN(w) && state.originalWidth > 0) {
        const percent = Math.round((w / state.originalWidth) * 100);
        dom.scalePercent.textContent = `${percent}%`;
    }
}

// =====================================================
// PRESET BUTTONS
// =====================================================
function initPresetButtons() {
    const presetBtns = $$('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const w = parseInt(btn.dataset.w);
            const h = parseInt(btn.dataset.h);

            if (btn.dataset.name === 'Custom') {
                // Focus width input for custom
                dom.widthInput.focus();
                dom.widthInput.select();
                return;
            }

            // Temporarily unlock aspect ratio for preset
            const wasLocked = state.aspectLocked;
            state.aspectLocked = false;

            dom.widthInput.value = w;
            dom.heightInput.value = h;

            state.aspectLocked = wasLocked;
            updateScalePercent();

            showToast(`Preset: ${btn.dataset.name} (${w}×${h})`, 'info');
        });
    });
}

// =====================================================
// FORMAT BUTTONS
// =====================================================
function initFormatButtons() {
    dom.formatBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dom.formatBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.outputFormat = btn.dataset.format;
            state.outputExt = btn.dataset.ext;
        });
    });
}

// =====================================================
// QUALITY SLIDER
// =====================================================
function initQualitySlider() {
    dom.qualitySlider.addEventListener('input', () => {
        const val = parseInt(dom.qualitySlider.value);
        state.quality = val / 100;
        dom.qualityValue.textContent = `${val}%`;
    });
}

// =====================================================
// IMAGE RESIZING (using Pica.js for quality)
// =====================================================

/**
 * Resize the currently selected image
 */
async function resizeCurrent() {
    const item = state.files[state.activeIndex];
    if (!item) return;

    const targetW = parseInt(dom.widthInput.value);
    const targetH = parseInt(dom.heightInput.value);

    if (!targetW || !targetH || targetW < 1 || targetH < 1) {
        showToast('Please enter valid dimensions', 'error');
        return;
    }

    if (targetW > 10000 || targetH > 10000) {
        showToast('Maximum dimension is 10,000px', 'error');
        return;
    }

    showProcessing('Resizing image with high quality...');
    updateProcessingBar(30);

    try {
        await resizeImage(item, targetW, targetH);
        updateProcessingBar(100);
        await delay(200);
        hideProcessing();

        // Update preview and results
        showPreviewImage(item.resizedUrl);
        showResults(item);
        renderFileList();

        // Show compare button
        dom.compareToggle.classList.remove('hidden');

        showToast('Image resized successfully!', 'success');
    } catch (err) {
        hideProcessing();
        showToast('Error resizing image: ' + err.message, 'error');
        console.error(err);
    }
}

/**
 * Resize all images in the batch
 */
async function resizeAll() {
    const targetW = parseInt(dom.widthInput.value);
    const targetH = parseInt(dom.heightInput.value);

    if (!targetW || !targetH || targetW < 1 || targetH < 1) {
        showToast('Please enter valid dimensions', 'error');
        return;
    }

    showProcessing('Batch resizing...');
    let completed = 0;

    try {
        for (let i = 0; i < state.files.length; i++) {
            dom.processingText.textContent = `Resizing image ${i + 1} of ${state.files.length}...`;
            updateProcessingBar(((i) / state.files.length) * 100);

            await resizeImage(state.files[i], targetW, targetH);
            completed++;
        }

        updateProcessingBar(100);
        await delay(200);
        hideProcessing();

        // Refresh active file view
        selectFile(state.activeIndex);
        renderFileList();

        dom.compareToggle.classList.remove('hidden');
        showToast(`All ${completed} images resized!`, 'success');
    } catch (err) {
        hideProcessing();
        showToast(`Error during batch resize: ${err.message}`, 'error');
        console.error(err);
    }
}

/**
 * Core resize logic using Pica.js for high-quality downsampling
 */
async function resizeImage(item, targetW, targetH) {
    // Create source canvas from original image
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = item.naturalWidth;
    srcCanvas.height = item.naturalHeight;
    const srcCtx = srcCanvas.getContext('2d');

    // Draw the original image (using stored img element)
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = item.originalUrl;
    });
    srcCtx.drawImage(img, 0, 0);

    // Create destination canvas
    const destCanvas = document.createElement('canvas');
    destCanvas.width = targetW;
    destCanvas.height = targetH;

    // Use Pica for high-quality resize if available
    if (picaInstance) {
        await picaInstance.resize(srcCanvas, destCanvas, {
            quality: 3,           // Highest quality (lanczos3)
            alpha: true,
            unsharpAmount: 80,
            unsharpRadius: 0.6,
            unsharpThreshold: 2,
        });
    } else {
        // Fallback: use canvas drawImage with multi-step downsampling
        const ctx = destCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
    }

    // Convert to blob with selected format and quality
    const blob = await canvasToBlob(destCanvas, state.outputFormat, state.quality);

    // Revoke old URL if exists
    if (item.resizedUrl) URL.revokeObjectURL(item.resizedUrl);

    item.resizedBlob = blob;
    item.resizedUrl = URL.createObjectURL(blob);

    // Clean up canvases
    srcCanvas.width = 0;
    srcCanvas.height = 0;
    destCanvas.width = 0;
    destCanvas.height = 0;

    return item;
}

/**
 * Convert canvas to Blob (async wrapper)
 */
function canvasToBlob(canvas, format, quality) {
    // Try Pica's toBlob for better quality
    if (picaInstance && format !== 'image/png') {
        return picaInstance.toBlob(canvas, format, quality);
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
            format,
            quality
        );
    });
}

// =====================================================
// PREVIEW
// =====================================================
function showPreviewImage(url) {
    dom.previewImage.src = url;
    dom.previewImage.classList.remove('hidden');
    dom.previewPlaceholder.classList.add('hidden');

    // Reset zoom
    state.zoomLevel = 1;
    dom.previewImage.style.transform = `scale(1)`;

    // Smooth entry
    dom.previewImage.style.opacity = '0';
    requestAnimationFrame(() => {
        dom.previewImage.style.transition = 'opacity 0.3s ease';
        dom.previewImage.style.opacity = '1';
    });
}

function showResults(item) {
    dom.resultsSection.classList.remove('hidden');

    const origSize = item.originalSize;
    const resizedSize = item.resizedBlob.size;
    const savedBytes = origSize - resizedSize;
    const savedPct = ((savedBytes / origSize) * 100).toFixed(1);

    dom.originalSize.textContent = formatBytes(origSize);
    dom.resizedSize.textContent = formatBytes(resizedSize);

    if (savedBytes > 0) {
        dom.savedPercent.textContent = `${savedPct}% smaller`;
        dom.savedPercent.classList.remove('text-red-500');
        dom.savedPercent.classList.add('text-green-600', 'dark:text-green-400');
    } else {
        const increase = (((resizedSize - origSize) / origSize) * 100).toFixed(1);
        dom.savedPercent.textContent = `${increase}% larger`;
        dom.savedPercent.classList.remove('text-green-600', 'dark:text-green-400');
        dom.savedPercent.classList.add('text-red-500');
    }

    // Animate stat values
    if (window.gsap) {
        gsap.from('.stat-card', {
            y: 20,
            opacity: 0,
            duration: 0.4,
            stagger: 0.1,
            ease: 'power2.out',
        });
    }

    // Also ensure the section scrolls into view
    dom.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// =====================================================
// DOWNLOAD
// =====================================================
function downloadCurrent() {
    const item = state.files[state.activeIndex];
    if (!item?.resizedBlob) {
        showToast('No resized image to download. Resize first!', 'error');
        return;
    }

    const baseName = item.file.name.replace(/\.[^.]+$/, '');
    const w = parseInt(dom.widthInput.value);
    const h = parseInt(dom.heightInput.value);
    const filename = `${baseName}_${w}x${h}.${state.outputExt}`;

    triggerDownload(item.resizedUrl, filename);
    showToast('Download started!', 'success');
}

async function downloadAll() {
    const resizedFiles = state.files.filter(f => f.resizedBlob);
    if (resizedFiles.length === 0) {
        showToast('No resized images to download', 'error');
        return;
    }

    showProcessing('Preparing downloads...');
    const w = parseInt(dom.widthInput.value);
    const h = parseInt(dom.heightInput.value);

    for (let i = 0; i < resizedFiles.length; i++) {
        updateProcessingBar(((i + 1) / resizedFiles.length) * 100);
        const item = resizedFiles[i];
        const baseName = item.file.name.replace(/\.[^.]+$/, '');
        const filename = `${baseName}_${w}x${h}.${state.outputExt}`;
        triggerDownload(item.resizedUrl, filename);
        await delay(300); // Stagger downloads to avoid browser blocking
    }

    hideProcessing();
    showToast(`${resizedFiles.length} images downloaded!`, 'success');
}

function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// =====================================================
// ZOOM CONTROLS
// =====================================================
function initZoomControls() {
    dom.zoomIn.addEventListener('click', () => {
        state.zoomLevel = Math.min(state.zoomLevel + 0.25, 5);
        applyZoom();
    });

    dom.zoomOut.addEventListener('click', () => {
        state.zoomLevel = Math.max(state.zoomLevel - 0.25, 0.25);
        applyZoom();
    });

    dom.zoomFit.addEventListener('click', () => {
        state.zoomLevel = 1;
        applyZoom();
    });

    // Mouse wheel zoom on preview
    dom.previewContainer.addEventListener('wheel', (e) => {
        if (!dom.previewImage.src) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        state.zoomLevel = Math.max(0.25, Math.min(5, state.zoomLevel + delta));
        applyZoom();
    }, { passive: false });
}

function applyZoom() {
    dom.previewImage.style.transform = `scale(${state.zoomLevel})`;
    dom.previewImage.classList.toggle('zoomed', state.zoomLevel !== 1);
}

// =====================================================
// COMPARISON SLIDER (Before / After)
// =====================================================
function initComparisonSlider() {
    dom.compareToggle.addEventListener('click', toggleComparison);

    // Slider drag
    let isDragging = false;

    const onMove = (clientX) => {
        if (!isDragging) return;
        const rect = dom.comparisonContainer.getBoundingClientRect();
        let x = ((clientX - rect.left) / rect.width) * 100;
        x = Math.max(0, Math.min(100, x));
        dom.compareResized.style.width = `${x}%`;
        dom.comparisonSlider.style.left = `${x}%`;
    };

    dom.comparisonSlider.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
    dom.comparisonSlider.addEventListener('touchstart', (e) => { isDragging = true; }, { passive: true });

    document.addEventListener('mousemove', (e) => onMove(e.clientX));
    document.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });

    document.addEventListener('mouseup', () => isDragging = false);
    document.addEventListener('touchend', () => isDragging = false);
}

function toggleComparison() {
    const item = state.files[state.activeIndex];
    if (!item?.resizedUrl) return;

    state.isComparing = !state.isComparing;

    if (state.isComparing) {
        dom.compareOriginal.src = item.originalUrl;
        dom.compareResizedImg.src = item.resizedUrl;
        dom.comparisonContainer.classList.remove('hidden');
        dom.previewImage.classList.add('hidden');

        // Reset slider position
        dom.compareResized.style.width = '50%';
        dom.comparisonSlider.style.left = '50%';

        dom.compareToggle.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Single View';
    } else {
        dom.comparisonContainer.classList.add('hidden');
        dom.previewImage.classList.remove('hidden');
        dom.compareToggle.innerHTML = '<i data-lucide="columns-2" class="w-3.5 h-3.5"></i> Compare';
    }

    if (window.lucide) lucide.createIcons();
}

// =====================================================
// SCROLL ANIMATIONS
// =====================================================
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
}

// =====================================================
// TOAST NOTIFICATION SYSTEM
// =====================================================
function showToast(message, type = 'info') {
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
    };

    const colors = {
        success: 'text-green-600',
        error: 'text-red-600',
        info: 'text-blue-600',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="text-lg ${colors[type]}">${icons[type]}</span>
        <span>${message}</span>
    `;

    dom.toastContainer.appendChild(toast);

    // Auto-remove after 4s
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// =====================================================
// PROCESSING OVERLAY
// =====================================================
function showProcessing(text = 'Processing...') {
    dom.processingText.textContent = text;
    dom.processingBar.style.width = '0%';
    dom.processingOverlay.classList.remove('hidden');
}

function hideProcessing() {
    dom.processingOverlay.classList.add('hidden');
}

function updateProcessingBar(percent) {
    dom.processingBar.style.width = `${Math.min(100, percent)}%`;
}

// =====================================================
// SERVICE WORKER (PWA / Offline support)
// =====================================================
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('[SW] Registered:', reg.scope))
            .catch(err => console.log('[SW] Registration failed:', err));
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Async delay helper
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
