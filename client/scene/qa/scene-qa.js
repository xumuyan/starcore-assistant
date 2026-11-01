(() => {
  let timer, reduced = false;
  const state = name => document.dispatchEvent(new CustomEvent('assistant-state', { detail: name }));
  const event = detail => document.dispatchEvent(new CustomEvent('assistant-event', { detail }));
  document.getElementById('demo-level').onclick = () => {
    clearInterval(timer); state('speaking'); let ticks = 0;
    timer = setInterval(() => {
      ticks++; event({ type: 'outputLevel', value: Math.max(0, Math.sin(ticks * .27) * Math.sin(ticks * .11)) });
      if (ticks > 80) { clearInterval(timer); state('armed'); event({ type: 'outputLevel', value: 0 }); }
    }, 50);
  };
  document.getElementById('reduce').onclick = () => {
    reduced = !reduced; event({ type: 'configured', settings: { reducedMotion: reduced } });
    document.getElementById('reduce').textContent = reduced ? '恢复动态' : '减少动态';
  };
  document.getElementById('run-qa').onclick = async () => {
    const result = document.getElementById('qa-result'), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const read = () => JSON.parse(document.getElementById('scene-diagnostics').textContent);
    const keys = ['coreFlow', 'floorFlow', 'starTime', 'planetFlow', 'particleTime'];
    result.textContent = 'RUNNING';
    try {
      if (reduced) document.getElementById('reduce').click();
      if (document.getElementById('core-view').getAttribute('aria-pressed') === 'true') document.getElementById('core-view').click();
      await pause(900); const a = read(); await pause(900); const b = read();
      const moving = keys.every(key => a[key] !== b[key]);
      document.getElementById('reduce').click(); await pause(900); const c = read(); await pause(900); const d = read();
      const frozen = c.reduced && d.reduced && keys.every(key => c[key] === d[key]);
      document.getElementById('reduce').click(); document.getElementById('core-view').click(); await pause(1400);
      const near = read().cameraZ; document.getElementById('core-view').click(); await pause(1400); const far = read().cameraZ;
      const zoom = near < 5.06 && far > 6.09;
      result.textContent = JSON.stringify({ result: moving && frozen && zoom ? 'PASSED' : 'FAILED', moving, frozen, zoom, near, far, drawCalls: read().drawCalls });
    } catch (error) { result.textContent = 'FAILED: ' + error.message; }
  };
  document.getElementById('record').onclick = async () => {
    const gl = document.getElementById('atmosphere');
    const out = document.createElement('canvas'); out.width = 1280; out.height = 720;
    const ctx = out.getContext('2d');
    const stream = out.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
    const chunks = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const began = performance.now(); let done = false, stage = 0;
    const compose = () => {
      if (done) return;
      const t = performance.now() - began;
      ctx.fillStyle = '#020a10'; ctx.fillRect(0, 0, 1280, 720); ctx.drawImage(gl, 0, 0, 1280, 720);
      ctx.fillStyle = '#b6e8ff'; ctx.font = '18px sans-serif'; ctx.fillText('JARVIS / REFERENCE MOTION', 30, 35);
      ctx.font = '14px sans-serif'; ctx.fillText('Original artwork / Layered perspective / Light flow / Local preview', 30, 690);
      if (t > 2000 && stage === 0) { document.getElementById('core-view').click(); stage = 1; }
      if (t > 4500 && stage === 1) { document.getElementById('core-view').click(); stage = 2; }
      if (t < 7000) requestAnimationFrame(compose); else recorder.stop();
    };
    recorder.onstop = () => {
      done = true; stream.getTracks().forEach(track => track.stop());
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(chunks, { type: mime }));
      link.download = 'jarvis-reference-motion.' + (mime.includes('webm') ? 'webm' : 'mp4'); link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    };
    recorder.start(); compose();
  };
})();
