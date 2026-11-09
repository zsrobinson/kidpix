export function readData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function recordMedia(kind, onSave) {
  const video = kind === 'video';
  const dialog = document.createElement('dialog');
  dialog.className = 'record-dialog';
  dialog.innerHTML = `<h2>${video ? 'Video Narration' : 'Record Sound'}</h2>
    ${video ? '<video autoplay playsinline muted></video>' : ''}
    <p role="status">Waiting for ${video ? 'camera and microphone' : 'microphone'} access…</p>
    <div class="dialog-actions"><button type="button" class="record" disabled>Record</button>
    <button type="button" class="cancel">Cancel</button></div>`;
  const label = dialog.querySelector('p');
  const control = dialog.querySelector('.record');
  const preview = dialog.querySelector('video');
  let stream;
  let recorder;
  let discard = false;
  let saved = false;
  let timer;
  let started;
  let poster;
  const chunks = [];

  function cleanup() {
    clearInterval(timer);
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
  }

  function updateTime() {
    const seconds = Math.floor((performance.now() - started) / 1000);
    label.textContent = `Recording ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function getPoster() {
    if (!preview?.videoWidth) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    canvas.getContext('2d').drawImage(preview, 0, 0);
    return canvas.toDataURL('image/jpeg', .83);
  }

  dialog.addEventListener('close', () => {
    discard = !saved;
    cleanup();
    dialog.remove();
  }, { once: true });
  dialog.querySelector('.cancel').onclick = () => dialog.close();
  control.onclick = () => {
    if (recorder.state === 'inactive') {
      chunks.length = 0;
      recorder.start(500);
      started = performance.now();
      timer = setInterval(updateTime, 250);
      updateTime();
      control.textContent = 'Stop and Use Recording';
    } else if (recorder.state === 'recording') {
      control.disabled = true;
      poster = getPoster();
      label.textContent = 'Preparing your recording…';
      clearInterval(timer);
      recorder.stop();
    }
  };

  document.body.append(dialog);
  dialog.showModal();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    label.textContent = 'Recording is unavailable in this browser. Open Kid Pix over HTTPS or localhost.';
    return;
  }
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: video ? { width: { ideal: 720 }, height: { ideal: 542 } } : false,
  }).then(result => {
    if (!dialog.open) { result.getTracks().forEach(track => track.stop()); return; }
    stream = result;
    if (preview) preview.srcObject = stream;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { cleanup(); label.textContent = 'The browser could not finish recording.'; control.disabled = true; };
    recorder.onstop = async () => {
      if (discard) return;
      try {
        const type = (recorder.mimeType || chunks[0]?.type || '').split(';')[0];
        const blob = new Blob(chunks, { type });
        if (!blob.size) throw new Error();
        const src = await readData(blob);
        if (!dialog.open) return;
        saved = true;
        dialog.close();
        onSave({
          name: video ? 'Video Narration' : 'Recorded Sound', src, thumbnail: poster,
          group: video ? 'movies' : 'sounds', mediaType: video ? 'video' : 'audio',
          width: preview?.videoWidth, height: preview?.videoHeight,
        });
      } catch { label.textContent = 'The browser could not save this recording.'; }
    };
    label.textContent = video ? 'Look at the camera and press Record.' : 'Press Record, then start speaking.';
    control.disabled = false;
  }).catch(() => {
    cleanup();
    label.textContent = video ? 'Allow camera and microphone access to record video.' : 'Allow microphone access to record sound.';
  });
}
