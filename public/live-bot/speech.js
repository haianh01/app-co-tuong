// Đọc to câu trả lời của AI, dùng chung cho bảng thử, overlay và nhân vật Live2D.
// Tách câu giống splitSentences() trong server.ts, xin audio mọi câu cùng lúc, đọc câu đầu ngay khi có,
// các câu sau tải trong lúc câu trước đang đọc. Nhiều câu trả lời thì đọc lần lượt, không chồng tiếng.
//
// createSpeaker({ onLevel, onStart, onEnd }):
//   onLevel(0..1) gọi mỗi khung hình khi đang nói (âm lượng, để nhân vật nhép miệng), về 0 khi im lặng;
//   onStart(text, meta) / onEnd(meta, còn câu chờ?) khi bắt đầu / đọc xong một câu trả lời
//   (meta là đối số thứ hai của say(), để trang hiện chữ đúng câu đang đọc).
//
// Nhiều trang cùng mở trên một trình duyệt (trang trợ lý, sân khấu có nhân vật AI, overlay...) thì chỉ
// MỘT trang được đọc to, tránh nghe một câu hai ba lần. Trang có nhân vật (onLevel, cần nhép miệng) giành
// quyền đọc; đóng trang đang đọc thì trang còn lại tự nhận. OBS chạy trình duyệt riêng nên không ảnh hưởng.
window.createSpeaker = function (hooks = {}) {
  const queue = []; // mỗi phần tử: { text, meta, parts: Promise<string | null>[] } (object URL của audio từng câu)
  let playing = false;
  let audioCtx = null;
  let analyser = null;
  let isVoice = !navigator.locks; // trình duyệt không có Web Locks thì trang nào cũng đọc như cũ

  function claimVoice(steal) {
    navigator.locks
      .request("live-bot-voice", { steal }, () => {
        isVoice = true;
        return new Promise(() => {}); // giữ quyền đọc tới khi đóng trang
      })
      .catch(() => {
        // Bị trang có nhân vật giành mất: thôi đọc, xếp hàng chờ nhận lại.
        isVoice = false;
        queue.length = 0;
        claimVoice(false);
      });
  }
  if (navigator.locks) claimVoice(Boolean(hooks.onLevel));

  function split(text) {
    const parts = (text.match(/[^.!?;]+[.!?;]*/g) || [text]).map((x) => x.trim()).filter((x) => /[\p{L}\p{N}]/u.test(x));
    const out = [];
    for (const p of parts) {
      if (out.length && out[out.length - 1].length + p.length < 60) out[out.length - 1] += " " + p;
      else out.push(p);
    }
    return out;
  }

  function fetchAudio(sentence) {
    return fetch("/api/bot/tts?text=" + encodeURIComponent(sentence))
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
  }

  // Chỉ dựng bộ đo âm lượng khi có người cần (nhân vật Live2D); trang khác phát audio như thường.
  function connectAnalyser(audio) {
    if (!hooks.onLevel) return;
    try {
      audioCtx ??= new AudioContext();
      if (audioCtx.state === "suspended") audioCtx.resume();
      if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.connect(audioCtx.destination);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          hooks.onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
          requestAnimationFrame(tick);
        };
        tick();
      }
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      return source;
    } catch {
      // Không đo được âm lượng thì vẫn phát tiếng bình thường.
    }
  }

  function playUrl(url) {
    return new Promise((done) => {
      const audio = new Audio(url);
      const source = connectAnalyser(audio);
      // Gỡ khỏi bộ đo sau mỗi câu, không thì buổi live dài cứ giữ lại audio của mọi câu đã đọc.
      const finish = () => {
        source?.disconnect();
        done();
      };
      audio.onended = audio.onerror = finish;
      audio.play().catch(finish);
    });
  }

  async function pump() {
    if (playing) return;
    playing = true;
    while (queue.length) {
      const { text, meta, parts } = queue.shift();
      hooks.onStart?.(text, meta);
      for (const part of parts) {
        const url = await part;
        if (!url) continue; // câu này tạo giọng thất bại, bỏ qua đọc câu sau
        await playUrl(url);
        URL.revokeObjectURL(url);
      }
      hooks.onEnd?.(meta, queue.length > 0);
    }
    playing = false;
  }

  return {
    say(text, meta) {
      if (!isVoice) {
        // Trang khác đang đọc: vẫn báo để hiện chữ, nhưng không phát tiếng.
        hooks.onStart?.(text, meta);
        const words = text.split(/\s+/).filter(Boolean).length;
        setTimeout(() => hooks.onEnd?.(meta, false), words * 330 + 1500);
        return;
      }
      queue.push({ text, meta, parts: split(text).map(fetchAudio) });
      pump();
    },
  };
};
