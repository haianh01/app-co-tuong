// Đọc to câu trả lời của AI, dùng chung cho bảng thử, overlay và nhân vật Live2D.
// Tách câu giống splitSentences() trong server.ts, xin audio mọi câu cùng lúc, đọc câu đầu ngay khi có,
// các câu sau tải trong lúc câu trước đang đọc. Nhiều câu trả lời thì đọc lần lượt, không chồng tiếng.
//
// createSpeaker({ onLevel, onStart, onEnd }):
//   onLevel(0..1) gọi mỗi khung hình khi đang nói (âm lượng, để nhân vật nhép miệng), về 0 khi im lặng;
//   onStart(text) / onEnd() khi bắt đầu / đọc xong một câu trả lời.
window.createSpeaker = function (hooks = {}) {
  const queue = []; // mỗi phần tử: { text, parts: Promise<string | null>[] } (object URL của audio từng câu)
  let playing = false;
  let audioCtx = null;
  let analyser = null;

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
      audioCtx.createMediaElementSource(audio).connect(analyser);
    } catch {
      // Không đo được âm lượng thì vẫn phát tiếng bình thường.
    }
  }

  function playUrl(url) {
    return new Promise((done) => {
      const audio = new Audio(url);
      connectAnalyser(audio);
      audio.onended = audio.onerror = done;
      audio.play().catch(done);
    });
  }

  async function pump() {
    if (playing) return;
    playing = true;
    while (queue.length) {
      const { text, parts } = queue.shift();
      hooks.onStart?.(text);
      for (const part of parts) {
        const url = await part;
        if (!url) continue; // câu này tạo giọng thất bại, bỏ qua đọc câu sau
        await playUrl(url);
        URL.revokeObjectURL(url);
      }
      hooks.onEnd?.();
    }
    playing = false;
  }

  return {
    say(text) {
      queue.push({ text, parts: split(text).map(fetchAudio) });
      pump();
    },
  };
};
