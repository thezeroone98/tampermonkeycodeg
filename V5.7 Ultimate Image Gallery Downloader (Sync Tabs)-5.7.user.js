// ==UserScript==
// @name         V5.7 Ultimate Image Gallery Downloader (Sync Tabs)
// @namespace    http://tampermonkey.net/
// @version      5.7
// @description  Fix lỗi không nhận diện link, cải thiện bắt số chương, đồng bộ Ẩn/Hiện nút giữa các tab.
// @author       Gemini
// @match        *://*/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

(function() {
    'use strict';

    // --- CẤU HÌNH TRẠNG THÁI ---
    let isButtonVisible = GM_getValue("isButtonVisible", true);

    // --- LẮNG NGHE SỰ THAY ĐỔI TỪ TAB KHÁC ---
    // Đây là phần quan trọng để đồng bộ hóa giữa các tab
    if (typeof GM_addValueChangeListener !== "undefined") {
        GM_addValueChangeListener("isButtonVisible", function(name, oldVal, newVal, remote) {
            isButtonVisible = newVal;
            syncButtonUI(); // Cập nhật giao diện ngay lập tức khi tab khác thay đổi
        });
    }

    // --- CẤU HÌNH CSS ---
    const css = `
        :root { --card-width: 220px; --card-height: 300px; --gap-size: 25px; }
        #g-btn-v5 {
            position: fixed; bottom: 20px; right: 20px; z-index: 999999;
            padding: 12px 20px; background: linear-gradient(135deg, #8E2DE2, #4A00E0);
            color: white; border: none; border-radius: 50px; cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-weight: bold; font-family: sans-serif;
            font-size: 14px; transition: transform 0.2s; user-select: none;
        }
        #g-btn-v5:hover { transform: scale(1.05); }
        #g-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #111827; z-index: 1000000;
            display: none; flex-direction: column; font-family: 'Segoe UI', Tahoma, sans-serif; color: #fff;
        }
        #g-toolbar {
            padding: 15px 30px; background: #1f2937; border-bottom: 1px solid #374151;
            display: flex; gap: 20px; align-items: center; flex-wrap: wrap; box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        }
        .g-group { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #9ca3af; }
        .g-input, .g-select {
            background: #374151; border: 1px solid #4b5563; color: white; padding: 6px 12px; border-radius: 6px; outline: none;
        }
        input[type=range] { height: 6px; background: #4b5563; border-radius: 5px; outline: none; opacity: 0.7; transition: .2s; }
        input[type=range]:hover { opacity: 1; }
        .g-actions { margin-left: auto; display: flex; gap: 10px; align-items: center; }
        .g-btn {
            padding: 8px 24px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;
            color: white; transition: all 0.2s; font-size: 13px;
        }
        .btn-dl { background: #10b981; } .btn-dl:hover { background: #059669; }
        .btn-zip { background: #3b82f6; } .btn-zip:hover { background: #2563eb; }
        .btn-close { background: #ef4444; } .btn-close:hover { background: #dc2626; }

        #g-config-modal {
            display: none; position: absolute; top: 70px; left: 50%; transform: translateX(-50%);
            background: #1f2937; border: 2px solid #4b5563; padding: 20px; z-index: 1000005;
            border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); width: 450px;
        }
        #g-config-modal h3 { margin-top: 0; color: #10b981; }
        #inp-rules-area {
            width: 100%; height: 200px; background: #374151; color: #e5e7eb;
            border: 1px solid #4b5563; white-space: pre; overflow: auto; padding: 10px;
            box-sizing: border-box; font-family: monospace; font-size: 13px; border-radius: 6px;
        }

        #g-grid-container { flex: 1; overflow-y: auto; padding: 40px; background: #111827; }
        #g-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--card-width), 1fr));
            gap: var(--gap-size); user-select: none;
        }
        .g-card {
            height: var(--card-height); background: #1f2937; border: 2px solid #374151; border-radius: 12px;
            overflow: hidden; cursor: pointer; position: relative; display: flex; flex-direction: column;
            transition: transform 0.1s, border-color 0.1s;
        }
        .g-card:hover { transform: translateY(-3px); border-color: #6b7280; }
        .g-card.selected { border-color: #10b981; background: #064e3b; }
        .g-card.selected::after {
            content: '✔'; position: absolute; top: 10px; right: 10px;
            background: #10b981; color: white; width: 28px; height: 28px;
            border-radius: 50%; text-align: center; line-height: 28px; font-weight:bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .g-img-wrap { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 10px; }
        .g-img { max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; }
        .g-footer {
            height: 30px; background: #111827; display: flex; align-items: center; justify-content: center;
            font-size: 12px; color: #9ca3af; border-top: 1px solid #374151;
        }
        .g-card.selected .g-footer { background: #065f46; color: #fff; }
        #g-selection {
            position: absolute; border: 2px dashed #3b82f6; background: rgba(59, 130, 246, 0.2);
            display: none; pointer-events: none; z-index: 1000001;
        }
        #g-status-line { height: 4px; width: 0%; background: linear-gradient(90deg, #10b981, #3b82f6); transition: width 0.3s; }
    `;
    GM_addStyle(css);

    // --- MENU LỆNH TAMPERMONKEY ---
    GM_registerMenuCommand("Bật/Tắt Nút Gallery (Tất cả tab)", toggleButtonState);

    // Hàm cập nhật giao diện dựa trên biến isButtonVisible
    function syncButtonUI() {
        const btn = document.getElementById("g-btn-v5");
        if (isButtonVisible) {
            if (!btn) initButton();
            else btn.style.display = "block";
        } else {
            if (btn) btn.style.display = "none";
        }
    }

    function toggleButtonState() {
        isButtonVisible = !isButtonVisible;
        GM_setValue("isButtonVisible", isButtonVisible); // Lưu giá trị, trigger sự kiện ở tab khác
        syncButtonUI(); // Cập nhật ngay tại tab hiện tại
    }

    // --- WORKER CHO BACKGROUND TIMER ---
    const timerWorkerBlob = new Blob([`self.onmessage = function(e) { setTimeout(function() { self.postMessage('tick'); }, e.data); };`], { type: "text/javascript" });
    const timerWorkerUrl = URL.createObjectURL(timerWorkerBlob);
    let workerTimer = null;
    function initWorker() { if (!workerTimer) workerTimer = new Worker(timerWorkerUrl); }
    function fastWait(ms) {
        return new Promise(resolve => {
            if (!workerTimer) initWorker();
            workerTimer.onmessage = () => resolve();
            workerTimer.postMessage(ms);
        });
    }

    // --- LOGIC TỰ ĐỘNG ĐỔI TÊN (REGEX NÂNG CAO) ---
    function autoRename() {
        const savedRules = GM_getValue("renameRules", "mc36575 | van gioi");
        const lines = savedRules.split('\n');
        const currentUrl = window.location.href;
        const currentTitle = document.title;
        const inpFolder = document.getElementById("inp-folder");

        if(!inpFolder) return;

        for (let line of lines) {
            if (!line.trim()) continue;
            const parts = line.split('|');
            if (parts.length < 2) continue;

            const linkKey = parts[0].trim();
            const namePrefix = parts[1].trim();

            if (currentUrl.includes(linkKey)) {
                let matchNumber = currentTitle.match(/(?:chap|chapter|chương|tập)\s*(\d+(\.\d+)?)/i);
                if (!matchNumber) {
                    matchNumber = currentTitle.match(/(\d+(\.\d+)?)/);
                }

                const number = matchNumber ? matchNumber[1] : "";
                inpFolder.value = number ? `${namePrefix} ${number}` : namePrefix;

                inpFolder.style.borderColor = "#10b981";
                inpFolder.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.5)";
                setTimeout(() => {
                    inpFolder.style.borderColor = "#4b5563";
                    inpFolder.style.boxShadow = "none";
                }, 1000);
                break;
            }
        }
    }

    // --- KHỞI TẠO NÚT BẤM ---
    function initButton() {
        if (document.getElementById("g-btn-v5")) return;

        const btnOpen = document.createElement("button");
        btnOpen.id = "g-btn-v5";
        btnOpen.innerHTML = "🖼 Gallery V5.7";
        btnOpen.title = "Click trái: Mở Gallery\nClick phải: Ẩn nút (Áp dụng mọi tab)";
        // Set display dựa trên trạng thái hiện tại
        btnOpen.style.display = isButtonVisible ? "block" : "none";
        document.body.appendChild(btnOpen);

        btnOpen.onclick = () => {
            scan();
            let currentTitle = document.title.replace(/[^\w\s]/gi, '').trim().substring(0, 30) || "Gallery";
            document.getElementById("inp-folder").value = currentTitle.replace(/\s+/g, '_');

            document.getElementById("g-overlay").style.display = "flex";
            document.body.style.overflow = "hidden";

            autoRename();
        };

        btnOpen.oncontextmenu = (e) => {
            e.preventDefault();
            toggleButtonState();
        };
    }

    // --- KHỞI TẠO OVERLAY ---
    function initOverlay() {
        if (document.getElementById("g-overlay")) return;

        let defaultFolder = document.title.replace(/[^\w\s]/gi, '').trim().substring(0, 30) || "Image_Gallery";
        defaultFolder = defaultFolder.replace(/\s+/g, '_');

        const overlay = document.createElement("div");
        overlay.id = "g-overlay";
        overlay.innerHTML = `
            <div id="g-toolbar">
                <div class="g-group">
                    <label>Zoom Ảnh:</label>
                    <input type="range" id="inp-zoom" min="120" max="400" value="220" style="width: 150px;">
                </div>
                <div class="g-group">
                    <label>Định dạng:</label>
                    <select id="sel-format" class="g-select">
                        <option value="original">Gốc</option>
                        <option value="jpeg">JPG</option>
                        <option value="png">PNG</option>
                    </select>
                </div>
                <div class="g-group">
                    <label>Số bắt đầu:</label>
                    <input type="number" id="inp-start" class="g-input" value="1" style="width: 60px;">
                </div>
                <div class="g-group">
                    <label>Tên thư mục:</label>
                    <div style="display:flex; gap:5px;">
                        <input type="text" id="inp-folder" class="g-input" value="${defaultFolder}" style="width: 160px;">
                        <button id="btn-config" class="g-btn" style="background:#8b5cf6; padding: 0 10px;" title="Cài đặt quy tắc đặt tên">⚙️ Config</button>
                    </div>
                </div>
                <div class="g-actions">
                    <span id="lbl-info" style="margin-right:15px; font-size:14px;">Đã chọn: <b>0</b></span>
                    <button class="g-btn btn-dl" id="btn-dl-gm">⬇ Tải Lẻ (GM)</button>
                    <button class="g-btn btn-zip" id="btn-dl-zip">📦 Tải ZIP</button>
                    <button class="g-btn btn-close" id="btn-close">✖</button>
                </div>
            </div>

            <div id="g-config-modal">
                <h3>⚙️ Cài đặt Tự Động Đổi Tên</h3>
                <p style="font-size:12px; color:#9ca3af; margin-bottom:10px;">
                    Mẹo: Nhập ID ngắn gọn để khớp mọi link.<br>
                    Ví dụ: <b>mc36575 | van gioi</b>
                </p>
                <textarea id="inp-rules-area" placeholder="Ví dụ: mc36575 | van gioi"></textarea>
                <div style="text-align:right; margin-top:15px; display:flex; justify-content:flex-end; gap:10px;">
                    <button id="btn-save-rules" class="g-btn btn-dl">Lưu & Áp dụng</button>
                    <button id="btn-cancel-rules" class="g-btn btn-close">Đóng</button>
                </div>
            </div>

            <div id="g-status-line"></div>
            <div id="g-grid-container"><div id="g-grid"></div></div>
            <div id="g-selection"></div>
        `;
        document.body.appendChild(overlay);

        // --- EVENTS CHO CONFIG ---
        const modal = document.getElementById("g-config-modal");
        const txtArea = document.getElementById("inp-rules-area");

        document.getElementById("btn-config").onclick = () => {
            modal.style.display = "block";
            txtArea.value = GM_getValue("renameRules", "mc36575 | van gioi");
        };

        document.getElementById("btn-save-rules").onclick = () => {
            GM_setValue("renameRules", txtArea.value);
            modal.style.display = "none";
            autoRename();
        };

        document.getElementById("btn-cancel-rules").onclick = () => {
            modal.style.display = "none";
        };

        // --- EVENTS CHÍNH ---
        const inpZoom = document.getElementById("inp-zoom");
        inpZoom.addEventListener("input", function() {
            const size = this.value;
            document.querySelector(':root').style.setProperty('--card-width', `${size}px`);
            document.querySelector(':root').style.setProperty('--card-height', `${size * 1.4}px`);
        });

        document.getElementById("btn-close").onclick = () => {
            overlay.style.display = "none";
            document.body.style.overflow = "auto";
            modal.style.display = "none";
        };
        document.getElementById("btn-dl-zip").onclick = () => doDownload('zip');
        document.getElementById("btn-dl-gm").onclick = () => doDownload('gm');

        setupDragSelection();
    }

    // --- LOGIC QUÉT & TẢI ---
    let items = [];
    function scan() {
        const grid = document.getElementById("g-grid");
        grid.innerHTML = "";
        items = [];
        const imgs = document.querySelectorAll('img[src^="http"], img[src^="data:image"]');

        imgs.forEach((img, idx) => {
            if (img.naturalWidth < 50 || img.naturalHeight < 50) return;

            const card = document.createElement("div");
            card.className = "g-card";

            const imgWrap = document.createElement("div");
            imgWrap.className = "g-img-wrap";
            const thumb = document.createElement("img");
            thumb.src = img.src;
            thumb.className = "g-img";
            imgWrap.appendChild(thumb);

            const footer = document.createElement("div");
            footer.className = "g-footer";
            footer.innerText = `${img.naturalWidth}x${img.naturalHeight}`;

            card.appendChild(imgWrap);
            card.appendChild(footer);
            grid.appendChild(card);

            const itemObj = { src: img.src, el: card, selected: false, idx: idx };
            items.push(itemObj);

            card.onmousedown = (e) => {
                e.stopPropagation();
                itemObj.selected = !itemObj.selected;
                updateVisual(itemObj);
                updateCount();
            };
        });
    }

    function updateVisual(item) {
        if(item.selected) item.el.classList.add("selected");
        else item.el.classList.remove("selected");
    }
    function updateCount() {
        const count = items.filter(x => x.selected).length;
        document.getElementById("lbl-info").innerHTML = `Đã chọn: <b>${count}</b>`;
    }

    function setupDragSelection() {
        const gridContainer = document.getElementById("g-grid-container");
        const selectionBox = document.getElementById("g-selection");
        let isDragging = false, startX, startY, initialSelectionState = [];

        gridContainer.onmousedown = (e) => {
            if(e.target !== gridContainer && e.target !== document.getElementById("g-grid")) return;
            isDragging = true;
            const rect = gridContainer.getBoundingClientRect();
            startX = e.clientX - rect.left + gridContainer.scrollLeft;
            startY = e.clientY - rect.top + gridContainer.scrollTop;
            initialSelectionState = items.map(i => i.selected);
            selectionBox.style.display = 'block';
            selectionBox.style.width = '0px'; selectionBox.style.height = '0px';
        };

        gridContainer.onmousemove = (e) => {
            if(!isDragging) return;
            const rect = gridContainer.getBoundingClientRect();
            const curX = e.clientX - rect.left + gridContainer.scrollLeft;
            const curY = e.clientY - rect.top + gridContainer.scrollTop;

            const w = Math.abs(curX - startX);
            const h = Math.abs(curY - startY);
            const l = Math.min(curX, startX);
            const t = Math.min(curY, startY);

            selectionBox.style.left = (l - gridContainer.scrollLeft + rect.left) + 'px';
            selectionBox.style.top = (t - gridContainer.scrollTop + rect.top) + 'px';
            selectionBox.style.width = w + 'px'; selectionBox.style.height = h + 'px';

            const selRect = { left: l, top: t, right: l+w, bottom: t+h };
            items.forEach((item, idx) => {
                const el = item.el;
                const iL = el.offsetLeft, iT = el.offsetTop;
                const iR = iL + el.offsetWidth, iB = iT + el.offsetHeight;
                const isIntersect = !(iL > selRect.right || iR < selRect.left || iT > selRect.bottom || iB < selRect.top);
                item.selected = isIntersect ? !initialSelectionState[idx] : initialSelectionState[idx];
                updateVisual(item);
            });
            updateCount();
        };
        window.addEventListener('mouseup', () => { isDragging = false; selectionBox.style.display = 'none'; });
    }

    // --- LOGIC TẢI XUỐNG ---
    function getExt(src) {
        if(src.includes('jpeg') || src.includes('jpg')) return 'jpg';
        if(src.includes('png')) return 'png';
        if(src.includes('webp')) return 'webp';
        return 'jpg';
    }

    function convertBlob(src, fmt) {
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const cvs = document.createElement('canvas');
                cvs.width = img.width; cvs.height = img.height;
                const ctx = cvs.getContext('2d');
                if(fmt==='jpeg') { ctx.fillStyle='#fff'; ctx.fillRect(0,0,cvs.width,cvs.height); }
                ctx.drawImage(img,0,0);
                resolve(cvs.toDataURL(`image/${fmt}`, 0.9));
            };
            img.onerror = () => resolve(src);
            img.src = src;
        });
    }

    async function doDownload(type) {
        const selected = items.filter(x => x.selected);
        if(!selected.length) return alert("Chưa chọn ảnh nào!");

        const btnZip = document.getElementById("btn-dl-zip");
        const btnGm = document.getElementById("btn-dl-gm");
        btnZip.disabled = true; btnGm.disabled = true;

        const fmt = document.getElementById("sel-format").value;
        const folder = document.getElementById("inp-folder").value.trim();
        let num = parseInt(document.getElementById("inp-start").value) || 1;
        const zip = (type==='zip') ? new JSZip() : null;
        const statusLine = document.getElementById("g-status-line");
        initWorker();

        for(let i=0; i<selected.length; i++) {
            statusLine.style.width = Math.round(((i+1)/selected.length)*100) + "%";
            let data = selected[i].src;
            let ext = getExt(data);

            if(fmt !== 'original') {
                try { data = await convertBlob(data, fmt); ext = (fmt==='jpeg')?'jpg':'png'; } catch(e){}
            }

            const fname = `image_${num}.${ext}`;
            if(type==='zip') zip.file(fname, data.split(',')[1], {base64:true});
            else {
                GM_download({url: data, name: `${folder}/${fname}`, saveAs: false});
                await fastWait(200);
            }
            num++;
        }

        if(type==='zip') {
            const content = await zip.generateAsync({type:"blob"});
            saveAs(content, `${folder}.zip`);
        }

        statusLine.style.width = "0%";
        alert("Hoàn tất!");
        btnZip.disabled = false; btnGm.disabled = false;
    }

    window.addEventListener('load', () => { initButton(); initOverlay(); });
    if(document.readyState === 'complete') { initButton(); initOverlay(); }

})();