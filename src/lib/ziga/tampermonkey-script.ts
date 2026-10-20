/**
 * Sinh mã Tampermonkey UserScript hoàn chỉnh để người dùng cài vào trình duyệt.
 * Script này hook trực tiếp vào unsafeWindow.WebSocket của trang Ziga và đẩy gói tin về app cờ tướng.
 */
export function generateTampermonkeyScript(serverOrigin = "http://localhost:3000"): string {
  return `// ==UserScript==
// @name         Ziga to App Cờ Tướng Relay
// @namespace    https://app-co-tuong/
// @version      1.2
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

  function markSent() {
    packetCount++;
    updateBadge(\`🟢 Ziga Relay: Đã gửi \${packetCount} gói tin\`, "#22c55e");
  }

  function markFailed(err) {
    console.warn("[Ziga Relay] Lỗi gửi tin tới app (kiểm tra app có bật không):", err);
    updateBadge("🔴 Ziga Relay: Không nối được tới App", "#ef4444");
  }

  function sendToApp(direction, data) {
    encodeData(data).then(function (encoded) {
      if (isHeartbeat(encoded)) return;

      const body = JSON.stringify({
        direction: direction,
        timestamp: Date.now(),
        encoding: encoded.encoding,
        payload: encoded.payload
      });

      if (typeof GM_xmlhttpRequest !== "undefined") {
        GM_xmlhttpRequest({
          method: "POST",
          url: TARGET_URL,
          headers: { "Content-Type": "application/json" },
          data: body,
          onload: function (res) {
            if (res.status >= 200 && res.status < 300) markSent();
            else markFailed("HTTP " + res.status);
          },
          onerror: markFailed
        });
      } else {
        fetch(TARGET_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          mode: "cors"
        }).then(function (res) {
          if (res.ok) markSent();
          else markFailed("HTTP " + res.status);
        }).catch(markFailed);
      }
    }).catch(function (err) {
      console.error("[Ziga Relay] Lỗi mã hoá gói tin:", err);
    });
  }

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
