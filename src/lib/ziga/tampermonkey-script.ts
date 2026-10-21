/**
 * Sinh mã Tampermonkey UserScript hoàn chỉnh để người dùng cài vào trình duyệt.
 * Script này hook trực tiếp vào unsafeWindow.WebSocket của trang Ziga và đẩy gói tin về app cờ tướng.
 */
export function generateTampermonkeyScript(serverOrigin = "http://localhost:3000"): string {
  return `// ==UserScript==
// @name         Ziga to App Cờ Tướng Relay
// @namespace    https://app-co-tuong/
// @version      1.6
// @description  Bắt gói tin WebSocket từ Ziga và chuyển tiếp thời gian thực về App Cờ Tướng
// @author       App Co Tuong
// @match        *://*.zigavn.com/*
// @match        *://zigavn.com/*
// @match        *://*.ziga.vn/*
// @match        *://ziga.vn/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-start
// @sandbox      JavaScript
// ==/UserScript==

(function () {
  'use strict';

  // Trong Tampermonkey có @grant, phải dùng unsafeWindow để can thiệp vào window của trang web thật
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const TARGET_URL = "${serverOrigin}/api/tuong-thuat/ziga-relay";

  console.log("%c[Ziga Relay] Đang khởi động bộ hook WebSocket trên:", "color: #d9a441; font-weight: bold;", location.href);

  // Tạo huy hiệu thông báo nhỏ trên góc màn hình Ziga để biết script đang chạy
  let badgeEl = null;
  let packetCount = 0;
  function updateBadge(text, color) {
    try {
      if (!badgeEl && document.body) {
        badgeEl = document.createElement("div");
        badgeEl.id = "ziga-relay-badge";
        badgeEl.style.cssText = "position:fixed;top:10px;right:10px;z-index:9999999;background:#18181b;color:#22c55e;padding:6px 14px;border-radius:20px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.6);border:1px solid #22c55e;pointer-events:none;transition:all 0.3s ease;";
        document.body.appendChild(badgeEl);
      }
      if (badgeEl) {
        badgeEl.textContent = text;
        if (color) {
          badgeEl.style.color = color;
          badgeEl.style.borderColor = color;
        }
      }
    } catch (e) {}
  }

  // Khởi tạo huy hiệu khi DOM sẵn sàng
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => updateBadge("🟢 Ziga Relay: Đang lắng nghe...", "#22c55e"));
  } else {
    updateBadge("🟢 Ziga Relay: Đang lắng nghe...", "#22c55e");
  }

  // Chuẩn hoá dữ liệu WebSocket: text giữ nguyên, binary (Blob/ArrayBuffer/TypedArray) -> base64
  function encodeData(data) {
    if (typeof data === "string") return Promise.resolve({ encoding: "text", payload: data });
    // Kiểm bằng tag thay vì instanceof vì data đến từ realm của trang, không phải realm userscript
    const tag = Object.prototype.toString.call(data);
    let bufPromise = null;
    if (tag === "[object Blob]" || tag === "[object File]") {
      bufPromise = data.arrayBuffer();
    } else if (tag === "[object ArrayBuffer]") {
      // Sao chép ngay vì trang có thể tái sử dụng buffer sau khi send
      bufPromise = Promise.resolve(data.slice(0));
    } else if (data && data.buffer && typeof data.byteLength === "number") {
      bufPromise = Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    }
    if (!bufPromise) return Promise.resolve({ encoding: "text", payload: String(data) });
    return bufPromise.then(function (buf) {
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return { encoding: "base64", payload: btoa(bin) };
    });
  }

  // Bỏ qua ping/pong của Engine.IO ("2", "3") để không spam app
  function isHeartbeat(encoded) {
    return encoded.encoding === "text" && /^[23]$/.test(encoded.payload);
  }

  // Hàng đợi gửi tuần tự: giữ đúng thứ tự gói, gom theo lô, gửi lỗi thì thử lại thay vì bỏ
  const FLUSH_DELAY_MS = 50;
  const RETRY_DELAY_MS = 1000;
  const MAX_QUEUE = 2000;
  const MAX_BATCH = 50;
  const queue = [];
  let inFlight = false;
  let flushTimer = null;
  let clientSeq = 0;
  // Mã hoá Blob là bất đồng bộ — xâu chuỗi để gói sau không vượt gói trước
  let encodeChain = Promise.resolve();

  function markFailed(err) {
    console.warn("[Ziga Relay] Lỗi gửi tin tới app (kiểm tra app có bật không):", err);
    updateBadge(\`🔴 Ziga Relay: Không nối được tới App (chờ gửi \${queue.length})\`, "#ef4444");
  }

  function scheduleFlush(delay) {
    if (flushTimer || inFlight) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flush();
    }, delay);
  }

  function postBatch(body, onDone) {
    if (typeof GM_xmlhttpRequest !== "undefined") {
      GM_xmlhttpRequest({
        method: "POST",
        url: TARGET_URL,
        headers: { "Content-Type": "application/json" },
        data: body,
        timeout: 5000,
        onload: function (res) { onDone(res.status >= 200 && res.status < 300 ? null : "HTTP " + res.status); },
        onerror: function (err) { onDone(err || "network error"); },
        ontimeout: function () { onDone("timeout"); }
      });
    } else {
      fetch(TARGET_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, mode: "cors" })
        .then(function (res) { onDone(res.ok ? null : "HTTP " + res.status); })
        .catch(onDone);
    }
  }

  function flush() {
    if (inFlight || queue.length === 0) return;
    inFlight = true;
    const batch = queue.slice(0, MAX_BATCH);
    postBatch(JSON.stringify({ packets: batch }), function (err) {
      inFlight = false;
      if (err) {
        markFailed(err);
        scheduleFlush(RETRY_DELAY_MS);
        return;
      }
      queue.splice(0, batch.length);
      packetCount += batch.length;
      updateBadge(\`🟢 Ziga Relay: Đã gửi \${packetCount} gói tin\`, "#22c55e");
      if (queue.length > 0) flush();
    });
  }

  function sendToApp(direction, data) {
    // Lấy thời điểm ngay lúc bắt gói, không phải lúc mã hoá xong
    const timestamp = Date.now();
    encodeChain = encodeChain
      .then(function () { return encodeData(data); })
      .then(function (encoded) {
        if (isHeartbeat(encoded)) return;
        enqueue(direction, timestamp, encoded.encoding, encoded.payload);
      })
      .catch(function (err) {
        console.error("[Ziga Relay] Lỗi mã hoá gói tin:", err);
      });
  }

  function enqueue(direction, timestamp, encoding, payload) {
    queue.push({
      direction: direction,
      timestamp: timestamp,
      clientSeq: ++clientSeq,
      encoding: encoding,
      payload: payload
    });
    // App tắt lâu thì bỏ gói cũ nhất để không phình bộ nhớ tab Ziga
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    scheduleFlush(FLUSH_DELAY_MS);
  }

  // ===== Đọc quân đang chọn + chấm nước đi thẳng từ engine Cocos của Ziga =====
  // Ziga không gửi việc chọn quân lên server, nên đọc từ lớp bàn cờ trong scene graph.
  // Tên thuộc tính bị minify theo bản build gamelogic.min.js?ver=139:
  //   V[32] quân (fa = cột, rowIndex = hàng, pa = đã bị ăn), le = chỉ số quân đang chọn (-1: không),
  //   tc[] chấm nước (cq = cột, Ir = hàng), Vp = [cột, hàng] các ô ăn quân, hc = bàn đang lật.
  // Ziga đổi bản build thì nhận diện hỏng → badge báo, phần gói tin nước đi vẫn chạy bình thường.
  const BOARD_POLL_MS = 100;
  // Game có thể giữ nhiều lớp giống bàn cờ (bàn đang chơi, bàn xem lại ván...) → dò lại định kỳ, đọc tất cả
  const BOARD_SEARCH_EVERY = 20;
  let boardLayers = [];
  let pollCount = 0;
  let lastSelectionKey = "";
  let boardReadWarned = false;

  function looksLikeBoardLayer(n) {
    return !!n && Array.isArray(n.V) && n.V.length === 32 && !!n.V[0] && "rowIndex" in n.V[0] &&
      Array.isArray(n.tc) && typeof n.le === "number";
  }

  function findBoardLayers(node, depth, out) {
    if (!node || depth > 14) return out;
    if (looksLikeBoardLayer(node)) out.push(node);
    const children = typeof node.getChildren === "function" ? node.getChildren() : null;
    if (children) for (let i = 0; i < children.length; i++) findBoardLayers(children[i], depth + 1, out);
    return out;
  }

  // Toạ độ hiển thị → toạ độ tuyệt đối giống gói nước đi 0x1c (cột 0..8 từ trái, hàng 0 = đáy phía Đỏ)
  function toAbsolute(layer, col, row) {
    return layer.hc ? { c: 8 - col, r: 9 - row } : { c: col, r: row };
  }

  function readSelection(layer) {
    const piece = layer.le >= 0 ? layer.V[layer.le] : null;
    if (!piece || piece.pa) return null;
    const targets = [];
    for (let i = 0; i < layer.tc.length; i++) {
      const d = layer.tc[i];
      // Ô bị cấm (đi xong vẫn bị chiếu) cũng được đặt vị trí nhưng ẩn — chỉ lấy chấm đang hiện
      if (d && d.x > 0 && d.cq >= 0 && d.Ir >= 0 && (typeof d.isVisible !== "function" || d.isVisible())) {
        targets.push(toAbsolute(layer, d.cq, d.Ir));
      }
    }
    const captures = Array.isArray(layer.Vp) ? layer.Vp : [];
    for (let i = 0; i < captures.length; i++) targets.push(toAbsolute(layer, captures[i][0], captures[i][1]));
    return { from: toAbsolute(layer, piece.fa, piece.rowIndex), targets: targets };
  }

  function pushSelection(selection) {
    const key = JSON.stringify(selection);
    if (key === lastSelectionKey) return;
    lastSelectionKey = key;
    const timestamp = Date.now();
    // Đi cùng chuỗi mã hoá để giữ đúng thứ tự với gói WebSocket (chọn quân → nước đi)
    encodeChain = encodeChain.then(function () {
      enqueue("ui", timestamp, "json", { type: "select", from: selection.from, targets: selection.targets });
    });
  }

  function refreshBoardLayers(cocos) {
    const before = boardLayers.length;
    boardLayers = findBoardLayers(cocos.director.getRunningScene(), 0, []);
    if (boardLayers.length !== before) {
      console.log("%c[Ziga Relay] Số lớp bàn cờ Cocos tìm thấy: " + boardLayers.length, "color: #22c55e;");
    }
  }

  function pollBoard() {
    try {
      const cocos = win.cc;
      if (!cocos || !cocos.director || typeof cocos.director.getRunningScene !== "function") return;
      if (pollCount++ % BOARD_SEARCH_EVERY === 0) refreshBoardLayers(cocos);
      let selection = null;
      for (let i = 0; i < boardLayers.length && !selection; i++) {
        const layer = boardLayers[i];
        if (typeof layer.getParent === "function" && !layer.getParent()) continue;
        selection = readSelection(layer);
      }
      pushSelection(selection || { from: null, targets: [] });
    } catch (e) {
      if (!boardReadWarned) {
        boardReadWarned = true;
        console.warn("[Ziga Relay] Không đọc được bàn cờ Cocos (Ziga có thể đã đổi code):", e);
      }
    }
  }

  // Gõ __zigaRelay.debug() trong Console tab Ziga để xem script đang đọc được gì
  try {
    win.__zigaRelay = {
      debug: function () {
        return {
          version: "1.6",
          layers: boardLayers.map(function (l) {
            return { le: l.le, hc: l.hc, attached: !!(l.getParent && l.getParent()), visible: l.isVisible ? l.isVisible() : null, selection: readSelection(l) };
          }),
          lastSent: lastSelectionKey,
          queued: queue.length
        };
      }
    };
  } catch (e) {}

  // Chưa có cú chọn nào thì không gửi gói rỗng đầu tiên
  lastSelectionKey = JSON.stringify({ from: null, targets: [] });
  setInterval(pollBoard, BOARD_POLL_MS);

  const OrigWebSocket = win.WebSocket;
  if (!OrigWebSocket) {
    console.warn("[Ziga Relay] Không tìm thấy WebSocket trên window!");
    return;
  }

  function ProxiedWebSocket(...args) {
    const ws = new OrigWebSocket(...args);

    console.log("%c[Ziga Relay] Đã bắt được kết nối WebSocket mới tới:", "color: #38bdf8;", args[0]);
    updateBadge("🟢 Ziga Relay: Đã nối WebSocket Ziga!", "#38bdf8");

    // Bắt mọi gói tin nhận về (addEventListener nhận cả khi trang dùng ws.onmessage = fn)
    ws.addEventListener("message", function (event) {
      try {
        sendToApp("in", event.data);
      } catch (e) {
        console.error("[Ziga Relay] Lỗi khi chuyển tiếp gói tin in:", e);
      }
    });

    // Bắt khi client gửi gói tin lên server Ziga
    const origSend = ws.send;
    ws.send = function (data) {
      try {
        sendToApp("out", data);
      } catch (e) {
        console.error("[Ziga Relay] Lỗi khi chuyển tiếp gói tin out:", e);
      }
      return origSend.apply(this, arguments);
    };

    return ws;
  }

  ProxiedWebSocket.prototype = OrigWebSocket.prototype;
  ProxiedWebSocket.CONNECTING = OrigWebSocket.CONNECTING;
  ProxiedWebSocket.OPEN = OrigWebSocket.OPEN;
  ProxiedWebSocket.CLOSING = OrigWebSocket.CLOSING;
  ProxiedWebSocket.CLOSED = OrigWebSocket.CLOSED;

  // Ghi đè vào window của trang web
  win.WebSocket = ProxiedWebSocket;

  console.log("%c[Ziga Relay] Hook WebSocket thành công trên unsafeWindow!", "color: #22c55e; font-weight: bold;");
})();
`;
}
