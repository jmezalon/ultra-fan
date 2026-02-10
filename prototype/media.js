import { showToast } from "./ui.js";

let activeHlsPlayer = null;
let cameraStream = null;
let whipPeerConnection = null;

export function getCameraStream() {
  return cameraStream;
}

export function destroyPlayer() {
  if (activeHlsPlayer) {
    activeHlsPlayer.destroy();
    activeHlsPlayer = null;
  }
}

export function initHlsPlayer(hlsUrl) {
  destroyPlayer();

  const video = document.getElementById("hlsPlayer");
  const overlay = document.getElementById("playerOverlay");
  if (!video) return;

  // Safari supports native HLS
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = hlsUrl;
    video.addEventListener("loadedmetadata", () => {
      if (overlay) overlay.style.display = "none";
      video.play().catch(() => {});
    });
    video.addEventListener("error", () => {
      if (overlay) {
        overlay.querySelector(".player-status").textContent =
          "Stream unavailable. The creator may not be broadcasting yet.";
      }
    });
    return;
  }

  // Use hls.js for Chrome/Firefox
  if (typeof Hls === "undefined" || !Hls.isSupported()) {
    if (overlay) {
      overlay.querySelector(".player-status").textContent =
        "HLS playback is not supported in this browser.";
    }
    return;
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 30,
  });

  activeHlsPlayer = hls;

  hls.loadSource(hlsUrl);
  hls.attachMedia(video);

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    if (overlay) overlay.style.display = "none";
    video.play().catch(() => {});
  });

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          if (overlay) {
            overlay.style.display = "";
            overlay.querySelector(".player-status").textContent =
              "Stream not found. Waiting for broadcast...";
          }
          setTimeout(() => {
            if (activeHlsPlayer === hls) {
              hls.startLoad();
            }
          }, 3000);
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError();
          break;
        default:
          if (overlay) {
            overlay.style.display = "";
            overlay.querySelector(".player-status").textContent =
              "Playback error. Try refreshing.";
          }
          break;
      }
    }
  });
}

export async function startCameraBroadcast(whipUrl, accessToken = "") {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch {
    showToast("Camera access denied or unavailable.", "error");
    return;
  }

  const preview = document.getElementById("cameraPreview");
  const overlay = document.getElementById("cameraOverlay");
  if (preview) {
    preview.srcObject = cameraStream;
    if (overlay) overlay.style.display = "none";
  }

  const pc = new RTCPeerConnection();
  whipPeerConnection = pc;

  for (const track of cameraStream.getTracks()) {
    pc.addTrack(track, cameraStream);
  }

  // Prefer H264 and exclude H265/HEVC (browsers often can't encode it)
  for (const transceiver of pc.getTransceivers()) {
    if (transceiver.sender.track?.kind === "video") {
      const caps = RTCRtpSender.getCapabilities?.("video");
      if (caps) {
        const h264 = caps.codecs.filter((c) => c.mimeType === "video/H264");
        const rest = caps.codecs.filter(
          (c) => c.mimeType !== "video/H264" && c.mimeType !== "video/H265" && c.mimeType !== "video/HEVC",
        );
        if (h264.length) transceiver.setCodecPreferences([...h264, ...rest]);
      }
    }
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  let response;
  try {
    const headers = { "Content-Type": "application/sdp" };
    if (accessToken) {
      headers.authorization = `Bearer ${accessToken}`;
    }
    response = await fetch(whipUrl, {
      method: "POST",
      headers,
      body: pc.localDescription.sdp,
    });
  } catch {
    showToast("Could not reach MediaMTX WebRTC endpoint.", "error");
    stopCameraBroadcast();
    return;
  }

  if (!response.ok) {
    let detail = "";
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        detail = typeof payload?.error === "string" ? payload.error : "";
      } else {
        detail = (await response.text()).trim();
      }
    } catch {
      detail = "";
    }
    showToast(
      detail ? `WHIP failed (${response.status}): ${detail}` : `WHIP failed (${response.status}).`,
      "error",
    );
    stopCameraBroadcast();
    return;
  }

  const answerSdp = await response.text();
  await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));

  showToast("Broadcasting started.", "success");
  updateCameraButtons();
}

export function stopCameraBroadcast() {
  if (whipPeerConnection) {
    whipPeerConnection.close();
    whipPeerConnection = null;
  }
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) {
      track.stop();
    }
    cameraStream = null;
  }

  const preview = document.getElementById("cameraPreview");
  const overlay = document.getElementById("cameraOverlay");
  if (preview) preview.srcObject = null;
  if (overlay) {
    overlay.style.display = "";
    const status = overlay.querySelector(".player-status");
    if (status) status.textContent = 'Click "Start Camera" to begin';
  }

  showToast("Broadcasting stopped.", "info");
  updateCameraButtons();
}

export function updateCameraButtons() {
  const startBtn = document.querySelector("[data-action='start-camera']");
  const stopBtn = document.querySelector("[data-action='stop-camera']");
  if (startBtn) startBtn.disabled = Boolean(cameraStream);
  if (stopBtn) stopBtn.disabled = !cameraStream;
}
