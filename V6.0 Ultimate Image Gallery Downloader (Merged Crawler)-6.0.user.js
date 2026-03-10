// ==UserScript==
// @name         V6.0 Ultimate Image Gallery Downloader (Merged Crawler)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Hợp nhất giao diện V5.7 với lõi cào ảnh cực mạnh từ Image Downloader v2.90. Bắt ảnh ẩn, ảnh gốc, canvas, background, srcset. Đã thêm lọc TRÙNG LẶP.
// @author       Gemini x The hide oldman
// @match        *://*/*
// @connect      *
// @run-at       document-start
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // PHẦN 1: LÕI CÀO ẢNH TỪ V2.90 (INTERCEPTOR & RULES)
    // ==========================================

    var preImgSrcs = [];

    // Đánh chặn ảnh tải động ngay khi trang bắt đầu load
    try {
        let originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            get: function() {
                return originalSrcDescriptor.get.call(this);
            },
            set: function(value) {
                if (value && !preImgSrcs.includes(value) && !value.startsWith('chrome-extension')) {
                    preImgSrcs.push(value);
                }
                originalSrcDescriptor.set.call(this, value);
            }
        });
    } catch (e) { console.warn("Không thể override HTMLImageElement.src", e); }

    // Bộ quy tắc tự động lấy ảnh kích thước lớn
    const autoBigImage = {
        defaultRules: [
            {originReg:/(?<=(.+sinaimg\.(?:cn|com)\/))([\w\.]+)(?=(\/.+))/i, replacement:"large"},
            {originReg:/(?<=(.+alicdn\.(?:cn|com)\/.+\.(jpg|jpeg|gif|png|bmp|webp)))_.+/i, replacement:""},
            {originReg:/(.+alicdn\.(?:cn|com)\/.+)(\.\d+x\d+)(\.(jpg|jpeg|gif|png|bmp|webp)).*/i, replacement:(m,p1,p2,p3)=>p1+p3},
            {originReg:/(?<=(.+360buyimg\.(?:cn|com)\/))(\w+\/)(?=(.+\.(jpg|jpeg|gif|png|bmp|webp)))/i, replacement:"n0/"},
            {originReg:/(?<=(.+hdslb\.(?:cn|com)\/.+\.(jpg|jpeg|gif|png|bmp|webp)))@.+/i, replacement:""},
            {originReg:/th(\.wallhaven\.cc\/)(?!full).+\/(\w{2}\/)([\w\.]+)(\.jpg)/i, replacement:(m,p1,p2,p3)=>"w"+p1+"full/"+p2+"wallhaven-"+p3+".jpg"},
            {originReg:/th(\.wallhaven\.cc\/)(?!full).+\/(\w{2}\/)([\w\.]+)(\.jpg)/i, replacement:(m,p1,p2,p3)=>"w"+p1+"full/"+p2+"wallhaven-"+p3+".png"},
            {originReg:/(.*\.twimg\.\w+\/.+\&name=*)(.*)/i, replacement:(m,p1,p2,p3)=>p1+"orig"},
            {originReg:/(shonenjump\.com\/.*\/)poster_thumb(\/.*)/, replacement:'$1poster$2'},
            {originReg:/(qzone\.qq\.com.*!!\/.*)$/, replacement:'$1/0'},
            {originReg:/(.*wordpress\.com.*)(\?w=\d+)$/, replacement:'$1'}
        ],
        getBigImageArray(originImgUrls) {
            let uniqueArray = Array.from(new Set(originImgUrls)).filter(item => item && typeof item === 'string');
            let result = [];

            uniqueArray.forEach(urlStr => {
                if(urlStr.includes("data:image/")) {
                    result.push(urlStr);
                    return;
                }
                let isReplaced = false;
                for (let rule of this.defaultRules) {
                    let bigImage = urlStr.replace(rule.originReg, rule.replacement);
                    if (bigImage !== urlStr) {
                        result.push(bigImage);
                        isReplaced = true;
                        break; // Dừng ngay khi rule đầu tiên khớp, tránh biến đổi 1 link thành nhiều link trùng
                    }
                }
                if (!isReplaced) result.push(urlStr);
            });
            return Array.from(new Set(result));
        }
    };


    // ==========================================
    // PHẦN 2: GIAO DIỆN & LOGIC V5.7
    // ==========================================

    let isButtonVisible = GM_getValue("isButtonVisible", true);
    let items = [];
    let renderedImages = new Set(); // Màng lọc trùng lặp cuối cùng

    if (typeof GM_addValueChangeListener !== "undefined") {
        GM_addValueChangeListener("isButtonVisible", function(name, oldVal, newVal, remote) {
            isButtonVisible = newVal;
            syncButtonUI();
        });
    }

    const css = `
        :root { --card-width: 220px; --card-height: 300px; --gap-size: 25px; }
        #g-btn-wrapper {
            position: fixed; bottom: 20px; right: 20px; z-index: 999999;
            display: flex; gap: 8px; align-items: center;
        }
        #g-btn-v5 {
            padding: 12px 20px; background: linear-gradient(135deg, #FF416C, #FF4B2B);
            color: white; border: none; border-radius: 50px; cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-weight: bold; font-family: sans-serif;
            font-size: 14px; transition: transform 0.2s; user-select: none;
        }
        #g-btn-v5:hover { transform: scale(1.05); }
        #g-btn-hide {
            width: 32px; height: 32px; border-radius: 50%; background: #374151;
            color: #9ca3af; border: 2px solid #4b5563; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 14px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: all 0.2s;
        }
        #g-btn-hide:hover { background: #ef4444; border-color: #ef4444; color: white; transform: scale(1.1); }
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
        .g-input, .g-select { background: #374151; border: 1px solid #4b5563; color: white; padding: 6px 12px; border-radius: 6px; outline: none; }
        input[type=range] { height: 6px; background: #4b5563; border-radius: 5px; outline: none; opacity: 0.7; transition: .2s; }
        input[type=range]:hover { opacity: 1; }
        .g-actions { margin-left: auto; display: flex; gap: 10px; align-items: center; }
        .g-btn { padding: 8px 24px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; color: white; transition: all 0.2s; font-size: 13px; }
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
        #g-selection { position: absolute; border: 2px dashed #3b82f6; background: rgba(59, 130, 246, 0.2); display: none; pointer-events: none; z-index: 1000001; }
        #g-status-line { height: 4px; width: 0%; background: linear-gradient(90deg, #10b981, #3b82f6); transition: width 0.3s; }
        #g-loading-text { text-align: center; width: 100%; padding: 50px; color: #f59e0b; font-size: 18px; font-weight: bold; }
    `;

    GM_registerMenuCommand("Bật/Tắt Nút Gallery (V6.0)", toggleButtonState);

    function syncButtonUI() {
        const wrapper = document.getElementById("g-btn-wrapper");
        if (isButtonVisible) {
            if (!wrapper) initButton();
            else wrapper.style.display = "flex";
        } else {
            if (wrapper) wrapper.style.display = "none";
        }
    }

    function toggleButtonState() {
        isButtonVisible = !isButtonVisible;
        GM_setValue("isButtonVisible", isButtonVisible);
        syncButtonUI();
    }

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
                let matchNumber = currentTitle.match(/(?:chap|chapter|chương|tập)\s*(\d+(\.\d+)?)/i) || currentTitle.match(/(\d+(\.\d+)?)/);
                const number = matchNumber ? matchNumber[1] : "";
                inpFolder.value = number ? `${namePrefix} ${number}` : namePrefix;
                inpFolder.style.borderColor = "#10b981";
                setTimeout(() => { inpFolder.style.borderColor = "#4b5563"; }, 1000);
                break;
            }
        }
    }

    function initButton() {
        if (document.getElementById("g-btn-wrapper")) return;

        const wrapper = document.createElement("div");
        wrapper.id = "g-btn-wrapper";
        wrapper.style.display = isButtonVisible ? "flex" : "none";

        const btnOpen = document.createElement("button");
        btnOpen.id = "g-btn-v5";
        btnOpen.innerHTML = "📸 Gallery V6.0 (Quét sâu)";
        btnOpen.title = "Click trái: Mở Gallery\nClick phải: Ẩn nút";

        const btnHide = document.createElement("button");
        btnHide.id = "g-btn-hide";
        btnHide.innerHTML = "✖";
        btnHide.title = "Ẩn nhanh nút này (Bật lại trong menu Tampermonkey)";

        wrapper.appendChild(btnOpen);
        wrapper.appendChild(btnHide);
        document.body.appendChild(wrapper);

        btnOpen.onclick = () => {
            document.getElementById("g-overlay").style.display = "flex";
            document.body.style.overflow = "hidden";
            let defaultFolder = document.title.replace(/[^\w\s]/gi, '').trim().substring(0, 30) || "Gallery";
            document.getElementById("inp-folder").value = defaultFolder.replace(/\s+/g, '_');
            autoRename();
            scan(); // Kích hoạt engine quét mới
        };

        btnOpen.oncontextmenu = (e) => { e.preventDefault(); toggleButtonState(); };
        btnHide.onclick = (e) => { e.preventDefault(); toggleButtonState(); };
    }

    function initOverlay() {
        if (document.getElementById("g-overlay")) return;
        GM_addStyle(css);

        const overlay = document.createElement("div");
        overlay.id = "g-overlay";
        overlay.innerHTML = `
            <div id="g-toolbar">
                <div class="g-group">
                    <label>Zoom Ảnh:</label>
                    <input type="range" id="inp-zoom" min="120" max="400" value="220" style="width: 150px;">
                </div>
                <div class="g-group">
                    <label>Định dạng tải về:</label>
                    <select id="sel-format" class="g-select">
                        <option value="original">Gốc (Giữ nguyên gốc)</option>
                        <option value="jpeg">Chuyển sang JPG</option>
                        <option value="png">Chuyển sang PNG</option>
                    </select>
                </div>
                <div class="g-group">
                    <label>Số đếm b.đầu:</label>
                    <input type="number" id="inp-start" class="g-input" value="1" style="width: 60px;">
                </div>
                <div class="g-group">
                    <label>Tên thư mục:</label>
                    <div style="display:flex; gap:5px;">
                        <input type="text" id="inp-folder" class="g-input" value="Image_Gallery" style="width: 160px;">
                        <button id="btn-config" class="g-btn" style="background:#8b5cf6; padding: 0 10px;">⚙️ Quy Tắc Tên</button>
                    </div>
                </div>
                <div class="g-actions">
                    <span id="lbl-info" style="margin-right:15px; font-size:14px;">Đã chọn: <b>0</b></span>
                    <button class="g-btn btn-dl" id="btn-dl-gm">⬇ Tải Lẻ</button>
                    <button class="g-btn btn-zip" id="btn-dl-zip">📦 Đóng gói ZIP</button>
                    <button class="g-btn btn-close" id="btn-close">✖</button>
                </div>
            </div>

            <div id="g-config-modal">
                <h3>⚙️ Cài đặt Tự Động Đổi Tên</h3>
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

        document.getElementById("btn-config").onclick = () => {
            document.getElementById("g-config-modal").style.display = "block";
            document.getElementById("inp-rules-area").value = GM_getValue("renameRules", "mc36575 | van gioi");
        };
        document.getElementById("btn-save-rules").onclick = () => {
            GM_setValue("renameRules", document.getElementById("inp-rules-area").value);
            document.getElementById("g-config-modal").style.display = "none";
            autoRename();
        };
        document.getElementById("btn-cancel-rules").onclick = () => document.getElementById("g-config-modal").style.display = "none";
        document.getElementById("btn-close").onclick = () => { overlay.style.display = "none"; document.body.style.overflow = "auto"; };
        document.getElementById("inp-zoom").addEventListener("input", function() {
            document.querySelector(':root').style.setProperty('--card-width', `${this.value}px`);
            document.querySelector(':root').style.setProperty('--card-height', `${this.value * 1.4}px`);
        });

        document.getElementById("btn-dl-zip").onclick = () => doDownload('zip');
        document.getElementById("btn-dl-gm").onclick = () => doDownload('gm');
        setupDragSelection();
    }


    // ==========================================
    // PHẦN 3: ENGINE QUÉT ẢNH NÂNG CAO (HỢP NHẤT)
    // ==========================================

    async function scan() {
        const grid = document.getElementById("g-grid");
        grid.innerHTML = "<div id='g-loading-text'>⏳ Đang dùng Engine V6 quét toàn bộ ảnh, canvas và background... Xin chờ!</div>";
        items = [];
        renderedImages.clear(); // Xóa bộ nhớ ảnh đã duyệt cho lần quét mới
        let rawUrls = [];

        // 1. Quét thẻ <img> truyền thống và srcset (Lấy chất lượng cao nhất)
        document.querySelectorAll("img").forEach(img => {
            let addedFromSrcset = false;
            if (img.srcset) {
                let srcArr = img.srcset.split(",");
                // Sắp xếp tìm ảnh lớn nhất trong srcset (nếu có)
                let bestUrl = srcArr[0].trim().split(/\s+/)[0];
                let maxVal = 0;
                for(let k=0; k<srcArr.length; k++) {
                    let parts = srcArr[k].trim().split(/\s+/);
                    if(parts.length > 1) {
                        let val = parseInt(parts[1].replace(/\D/g, ''));
                        if(val > maxVal) {
                            maxVal = val;
                            bestUrl = parts[0];
                        }
                    }
                }
                if (bestUrl && !bestUrl.startsWith('chrome-extension')) {
                    rawUrls.push(bestUrl);
                    addedFromSrcset = true;
                }
            }
            // Nếu đã thêm từ srcset thì bỏ qua thẻ src thu nhỏ, chống duplicate URL độ phân giải thấp
            if (!addedFromSrcset && img.src && !img.src.startsWith('chrome-extension')) {
                rawUrls.push(img.src);
            }
        });

        // 2. Thêm ảnh thu được từ Interceptor (Extra Grab)
        rawUrls.push(...preImgSrcs);

        // 3. Quét background-image từ CSS Inline & Styles
        const bodyHtml = document.body.innerHTML;
        const bgMatches = bodyHtml.match(/(?<=background-image:\s*url\(['"]?)(\S+?)(?=['"]?\))/g);
        if (bgMatches) {
            bgMatches.forEach(url => rawUrls.push(url.replace(/&quot;/g, "").replace(/['"]/g, "")));
        }

        // 4. Hack Bilibili Manga Canvas (Nếu có)
        if(window.location.href.includes("manga.bilibili.com/")) {
            let iframe = document.getElementById("tyc-insert-iframe");
            if(!iframe) {
                document.body.insertAdjacentHTML("afterbegin", `<iframe style="display:none;" id="tyc-insert-iframe"></iframe>`);
                iframe = document.getElementById("tyc-insert-iframe");
                iframe.contentDocument.body.insertAdjacentHTML("afterbegin", `<canvas id="tyc-insert-canvas"></canvas>`);
                let mainCanvas = document.body.getElementsByTagName('canvas')[0];
                if(mainCanvas) mainCanvas.__proto__.toBlob = iframe.contentDocument.getElementById("tyc-insert-canvas").__proto__.toBlob;
            }

            // FIX: Loại bỏ các ảnh bị xáo trộn (scrambled) tải từ <img> hoặc được bắt bởi Interceptor
            // Chỉ giữ lại hình ảnh đã được giải mã chính xác và vẽ lên <canvas> để đảm bảo đúng thứ tự truyện.
            rawUrls = [];
        }

        // 5. Xử lý Canvas Element -> DataURL (Base64)
        let canvasEles = document.getElementsByTagName("canvas");
        let canvasPromises = Array.from(canvasEles).map(canvas => {
            return new Promise(resolve => {
                try {
                    canvas.toBlob(blob => {
                        if(!blob) return resolve(null);
                        let reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch(e) { resolve(null); } // Bỏ qua canvas bị taint CORS
            });
        });
        let canvasResults = await Promise.all(canvasPromises);
        canvasResults.forEach(res => { if(res) rawUrls.push(res); });

        // 6. Xử lý HathiTrust Canvas
        if (window.location.href.includes("hathitrust.org")) {
            let hImgs = document.querySelectorAll(".image img");
            if (hImgs.length > 0) {
                let tempCanvas = document.createElement("canvas");
                hImgs.forEach(img => {
                    tempCanvas.width = img.width; tempCanvas.height = img.height;
                    tempCanvas.getContext("2d").drawImage(img, 0, 0);
                    rawUrls.push(tempCanvas.toDataURL("image/png"));
                });
            }
        }

        // 7. Lọc qua Auto Big Image Rules và xóa trùng lặp ban đầu
        let finalUrls = autoBigImage.getBigImageArray(rawUrls);

        // Chuẩn hóa thành URL tuyệt đối (gom chung /img.jpg và https://domain.com/img.jpg làm 1)
        let absoluteUrls = new Set();
        let deduplicatedUrls = [];
        finalUrls.forEach(url => {
            if (url.startsWith('data:image')) {
                if (!absoluteUrls.has(url)) {
                    absoluteUrls.add(url);
                    deduplicatedUrls.push(url);
                }
            } else {
                try {
                    // Browser sẽ tự giải quyết các path tương đối thông qua document.baseURI
                    let absUrl = new URL(url, document.baseURI).href;
                    if (!absoluteUrls.has(absUrl)) {
                        absoluteUrls.add(absUrl);
                        deduplicatedUrls.push(absUrl);
                    }
                } catch(e) {
                    if (!absoluteUrls.has(url)) {
                        absoluteUrls.add(url);
                        deduplicatedUrls.push(url);
                    }
                }
            }
        });

        // 8. Render Grid
        grid.innerHTML = "";
        deduplicatedUrls.forEach(url => renderGridItem(url, grid));
        updateCount();
    }

    function renderGridItem(url, grid) {
        const card = document.createElement("div");
        card.className = "g-card";
        card.style.display = "none"; // Ẩn lúc load để lọc size

        const imgWrap = document.createElement("div");
        imgWrap.className = "g-img-wrap";
        const thumb = document.createElement("img");
        thumb.className = "g-img";
        thumb.src = url;

        const footer = document.createElement("div");
        footer.className = "g-footer";

        thumb.onload = () => {
            if (thumb.naturalWidth < 50 || thumb.naturalHeight < 50) return; // Bỏ qua icon nhỏ

            // XÓA TRÙNG LẶP CUỐI CÙNG: Dựa trên link src gốc sau khi browser load thành công
            if (renderedImages.has(thumb.src)) {
                card.remove();
                return;
            }
            renderedImages.add(thumb.src);

            footer.innerText = `${thumb.naturalWidth}x${thumb.naturalHeight}`;
            card.style.display = "flex";

            // Dùng trực tiếp thumb.src (absolute URL) thay vì url ảo ban đầu
            const itemObj = { src: thumb.src, el: card, selected: false, idx: items.length };
            items.push(itemObj);

            card.onmousedown = (e) => {
                e.stopPropagation();
                itemObj.selected = !itemObj.selected;
                updateVisual(itemObj);
                updateCount();
            };

            updateCount(); // Tự update UI khi có ảnh hợp lệ load xong
        };

        thumb.onerror = () => { card.remove(); };

        imgWrap.appendChild(thumb);
        card.appendChild(imgWrap);
        card.appendChild(footer);
        grid.appendChild(card);
    }


    function updateVisual(item) {
        if(item.selected) item.el.classList.add("selected");
        else item.el.classList.remove("selected");
    }
    function updateCount() {
        const count = items.filter(x => x.selected).length;
        document.getElementById("lbl-info").innerHTML = `Đã tìm thấy: ${items.length} | Đã chọn: <b>${count}</b>`;
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

    // ==========================================
    // PHẦN 4: ENGINE TẢI XUỐNG & ZIP
    // ==========================================

    function getExt(src) {
        if(src.includes('jpeg') || src.includes('jpg')) return 'jpg';
        if(src.includes('png')) return 'png';
        if(src.includes('webp')) return 'webp';
        return 'jpg'; // fallback
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

    // Worker Sleep
    const timerWorkerBlob = new Blob([`self.onmessage = function(e) { setTimeout(function() { self.postMessage('tick'); }, e.data); };`], { type: "text/javascript" });
    const timerWorkerUrl = URL.createObjectURL(timerWorkerBlob);
    let workerTimer = null;
    function fastWait(ms) {
        return new Promise(resolve => {
            if (!workerTimer) workerTimer = new Worker(timerWorkerUrl);
            workerTimer.onmessage = () => resolve();
            workerTimer.postMessage(ms);
        });
    }

    async function doDownload(type) {
        const selected = items.filter(x => x.selected);
        if(!selected.length) return alert("Chưa chọn ảnh nào!");

        const btnZip = document.getElementById("btn-dl-zip");
        const btnGm = document.getElementById("btn-dl-gm");
        btnZip.disabled = true; btnGm.disabled = true;

        const fmt = document.getElementById("sel-format").value;
        const folder = document.getElementById("inp-folder").value.trim() || "Images";
        let num = parseInt(document.getElementById("inp-start").value) || 1;
        const zip = (type==='zip') ? new JSZip() : null;
        const statusLine = document.getElementById("g-status-line");

        for(let i=0; i<selected.length; i++) {
            statusLine.style.width = Math.round(((i+1)/selected.length)*100) + "%";
            let data = selected[i].src;
            let ext = getExt(data);

            if(fmt !== 'original' && !data.startsWith("data:image")) {
                try { data = await convertBlob(data, fmt); ext = (fmt==='jpeg')?'jpg':'png'; } catch(e){}
            }

            const fname = `${folder}_${num.toString().padStart(3, '0')}.${ext}`;

            if(type==='zip') {
                // Nếu là base64 thì extract phần data
                if (data.startsWith('data:image')) {
                    zip.file(fname, data.split(',')[1], {base64: true});
                } else {
                    // Fetch blob cho ZIP để tránh lỗi CORS canvas
                    try {
                        let blobData = await fetch(data).then(r => r.blob());
                        zip.file(fname, blobData);
                    } catch (e) { console.log("Lỗi tải ảnh vào ZIP:", data); }
                }
            } else {
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
        alert("Hoàn tất xử lý!");
        btnZip.disabled = false; btnGm.disabled = false;
    }

    // Đảm bảo document.body đã tồn tại trước khi chèn nút bấm
    function initAll() {
        if (!document.body) {
            setTimeout(initAll, 100);
            return;
        }
        initButton();
        initOverlay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }

})();