let animationId, isPlaying = false, isMenuLocked = true, position = window.innerHeight, scheduledTime = null;
let manualScrollId = null;
const container = document.getElementById('text-container');
const menu = document.getElementById('live-controls');
const prompterDiv = document.getElementById('prompter');

const PEER_ID_PREFIX = 'mprompter-';
let peer = null;
let sessionActive = false;
let hostConnections = [];
let broadcastInterval = null;
let remoteControlsAllowed = false;

let remoteConn = null;
let remoteAnimating = false;

const SESSION_CODE_WORDS = ['tekst', 'mowa', 'kadr', 'film', 'wizja', 'audio', 'wideo', 'oko', 'usta', 'mina', 'gest', 'styl', 'sens', 'znak', 'opis', 'plan', 'ruch', 'czas', 'teza', 'fraza', 'pauza', 'tempo', 'rym', 'rytm', 'proza', 'aktor', 'ekran', 'temat', 'ton', 'scena'];

function randomSessionWord() {
    return SESSION_CODE_WORDS[Math.floor(Math.random() * SESSION_CODE_WORDS.length)];
}

function sanitizeSessionCode(code) {
    return code.replace(/[^a-zA-Z0-9_-]/g, '');
}

function randomizeSessionCode() {
    document.getElementById('sessionCode').value = randomSessionWord();
}

function toggleSession() {
    if (sessionActive) stopSession(); else startSession();
}

function startSession() {
    let code = sanitizeSessionCode(document.getElementById('sessionCode').value.trim());
    if (!code) code = randomSessionWord();
    document.getElementById('sessionCode').value = code;
    document.getElementById('sessionCode').disabled = true;
    document.getElementById('sessionToggleBtn').innerText = 'Connecting...';
    document.getElementById('sessionToggleBtn').disabled = true;

    peer = new Peer(PEER_ID_PREFIX + code);

    peer.on('open', () => {
        sessionActive = true;
        document.getElementById('sessionToggleBtn').disabled = false;
        document.getElementById('sessionToggleBtn').innerText = 'Session active (stop)';
        document.getElementById('sessionToggleBtn').style.background = '#555';

        const link = location.origin + location.pathname + '?remote=' + encodeURIComponent(code);
        document.getElementById('sessionLink').value = link;
        document.getElementById('sessionInfo').style.display = 'flex';

        const qrHolder = document.getElementById('qrcode');
        const qr = qrcode(0, 'M');
        qr.addData(link);
        qr.make();
        qrHolder.innerHTML = qr.createSvgTag(8, 0);

        broadcastInterval = setInterval(sendStateToAll, 150);
    });

    peer.on('connection', (conn) => {
        hostConnections.push(conn);
        conn.on('open', () => {
            conn.send(getFullState());
            updateRemotePeersStatus();
        });
        conn.on('data', handleRemoteCommand);
        conn.on('close', () => {
            hostConnections = hostConnections.filter(c => c !== conn);
            updateRemotePeersStatus();
        });
    });

    peer.on('error', (err) => {
        alert('Session error: ' + err.type);
        stopSession();
    });
}

function stopSession() {
    sessionActive = false;
    clearInterval(broadcastInterval);
    hostConnections.forEach(c => c.close());
    hostConnections = [];
    if (peer) { peer.destroy(); peer = null; }

    document.getElementById('sessionCode').disabled = false;
    document.getElementById('sessionToggleBtn').disabled = false;
    document.getElementById('sessionToggleBtn').innerText = 'Create Session';
    document.getElementById('sessionToggleBtn').style.background = '#28a745';
    document.getElementById('sessionInfo').style.display = 'none';
    updateRemotePeersStatus();
}

function updateRemotePeersStatus() {
    const n = hostConnections.length;
    document.getElementById('remotePeersStatus').innerText = n ? `Connected devices: ${n}` : 'No devices connected';
}

function openQrFullscreen() {
    const src = document.getElementById('qrcode');
    if (!src.innerHTML.trim()) return;
    document.getElementById('qrFullscreenCode').innerHTML = src.innerHTML;
    document.getElementById('qrFullscreen').style.display = 'flex';
}

function closeQrFullscreen() {
    document.getElementById('qrFullscreen').style.display = 'none';
}

function copySessionLink() {
    const input = document.getElementById('sessionLink');
    input.select();
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).catch(() => document.execCommand('copy'));
    else document.execCommand('copy');
}

function joinSession() {
    const code = sanitizeSessionCode(document.getElementById('joinCode').value.trim());
    if (!code) return alert('Enter a session code!');
    location.href = location.pathname + '?remote=' + encodeURIComponent(code);
}

function onAllowControlChange() {
    remoteControlsAllowed = document.getElementById('allowRemoteControl').checked;
    if (hostConnections.length) broadcastToRemotes(getTickState());
}

function getTickState() {
    return {
        type: 'tick',
        running: prompterDiv.style.display === 'block',
        isPlaying,
        position,
        fontSize: container.style.fontSize,
        speed: document.getElementById('liveSpeedNum').value,
        align: document.getElementById('liveAlign').value,
        flipped: container.classList.contains('flipped'),
        rotated: prompterDiv.classList.contains('rotated'),
        controlsEnabled: remoteControlsAllowed
    };
}

function getFullState() {
    const state = getTickState();
    state.type = 'full';
    state.text = container.innerText;
    return state;
}

function broadcastToRemotes(data) {
    hostConnections.forEach(c => { if (c.open) c.send(data); });
}

function sendStateToAll() {
    if (hostConnections.length) broadcastToRemotes(getTickState());
}

function handleRemoteCommand(data) {
    if (!remoteControlsAllowed || !data || data.type !== 'cmd') return;
    switch (data.action) {
        case 'togglePlay': togglePlay(); break;
        case 'restart': restartText(); break;
        case 'flip': toggleFlip(); break;
        case 'rotate': toggleRotate(); break;
        case 'nudge':
            isPlaying = false;
            document.getElementById('playBtn').innerText = 'START';
            document.getElementById('touchPlayBtn').innerText = '▶';
            position += data.value;
            container.style.top = position + 'px';
            break;
    }
}

function initRemoteMode(code) {
    document.getElementById('setup').style.display = 'none';
    const statusEl = document.getElementById('remoteStatus');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Connecting to host...';

    peer = new Peer();

    peer.on('open', () => {
        remoteConn = peer.connect(PEER_ID_PREFIX + code, { reliable: true });
        remoteConn.on('open', () => { statusEl.innerText = 'Connected. Waiting for the prompter to start...'; });
        remoteConn.on('data', handleHostState);
        remoteConn.on('close', onRemoteDisconnected);
        remoteConn.on('error', onRemoteDisconnected);
    });

    peer.on('error', (err) => {
        statusEl.style.display = 'block';
        statusEl.innerText = 'Connection error: ' + err.type;
    });
}

function onRemoteDisconnected() {
    const statusEl = document.getElementById('remoteStatus');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Disconnected from host.';
    prompterDiv.style.display = 'none';
    document.getElementById('indicator').style.display = 'none';
    document.getElementById('remote-controls').style.display = 'none';
}

function handleHostState(data) {
    if (data.type === 'full') container.innerText = data.text;

    document.getElementById('remote-controls').style.display = data.controlsEnabled ? 'flex' : 'none';
    document.getElementById('remotePlayBtn').innerText = data.isPlaying ? 'PAUSE' : 'START';

    const statusEl = document.getElementById('remoteStatus');

    if (!data.running) {
        statusEl.style.display = 'block';
        statusEl.innerText = 'Waiting for the prompter to start...';
        prompterDiv.style.display = 'none';
        document.getElementById('indicator').style.display = 'none';
        return;
    }

    statusEl.style.display = 'none';
    prompterDiv.style.display = 'block';
    document.getElementById('indicator').style.display = 'block';
    container.style.fontSize = data.fontSize;
    document.getElementById('liveSpeedNum').value = data.speed;
    updateAlign(data.align);
    container.classList.toggle('flipped', data.flipped);
    prompterDiv.classList.toggle('rotated', data.rotated);
    isPlaying = data.isPlaying;

    if (!remoteAnimating || Math.abs(position - data.position) > 8) position = data.position;
    container.style.top = position + 'px';

    if (!remoteAnimating) {
        remoteAnimating = true;
        animate();
    }
}

function remoteCmd(action, value) {
    if (remoteConn && remoteConn.open) remoteConn.send({ type: 'cmd', action, value });
}

let remoteScrollInterval = null;
function remoteScrollStart(offset) {
    remoteCmd('nudge', offset / 5);
    remoteScrollInterval = setInterval(() => remoteCmd('nudge', offset / 5), 20);
}
function remoteScrollStop() { clearInterval(remoteScrollInterval); }

(function checkRemoteMode() {
    const params = new URLSearchParams(location.search);
    const remoteCode = params.get('remote');
    if (remoteCode) initRemoteMode(sanitizeSessionCode(remoteCode));
})();

setInterval(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pl-PL', { hour12: false });
    document.getElementById('clock').innerText = timeStr;
    if (scheduledTime && timeStr === scheduledTime && !isPlaying) { runPrompter(); scheduledTime = null; }
}, 200);

function syncInputs(type, source) {
    if (type === 'speed') {
        const val = source === 'num' ? document.getElementById('initSpeedNum').value : document.getElementById('initSpeedRange').value;
        document.getElementById('initSpeedNum').value = val;
        document.getElementById('initSpeedRange').value = val;
    }
}

function updateAlign(val) {
    container.style.textAlign = val;
    document.getElementById('textAlign').value = val;
    document.getElementById('liveAlign').value = val;
}

function toggleFS() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

function clearText() { if(confirm("Clear text?")) document.getElementById('inputText').value = ""; }

function scheduleStart() {
    scheduledTime = document.getElementById('startTime').value;
    if(!scheduledTime) return alert("Select time!");
    document.getElementById('planBtn').innerText = "WAITING: " + scheduledTime;
}

function toggleTouchUI() {
    const tc = document.getElementById('touch-controls');
    tc.style.display = (tc.style.display === 'flex') ? 'none' : 'flex';
}

function toggleFlip() {
    container.classList.toggle('flipped');
}

function toggleRotate() {
    prompterDiv.classList.toggle('rotated');
}

function runPrompter() {
    const text = document.getElementById('inputText').value;
    if (!text.trim()) return alert("Enter text!");

    document.getElementById('liveSize').value = document.getElementById('initSize').value;
    document.getElementById('liveSpeedNum').value = document.getElementById('initSpeedNum').value;
    document.getElementById('liveSpeedRange').value = document.getElementById('initSpeedNum').value;

    document.getElementById('setup').style.display = 'none';
    prompterDiv.style.display = 'block';
    document.getElementById('indicator').style.display = 'block';
    menu.style.display = 'flex';

    container.innerText = text;
    container.style.fontSize = document.getElementById('liveSize').value + 'px';
    updateAlign(document.getElementById('textAlign').value);

    position = window.innerHeight;
    isPlaying = true;
    animate();

    if (hostConnections.length) broadcastToRemotes(getFullState());

    if (/Mobi|Android/i.test(navigator.userAgent)) {
            toggleFS();
    }
}

function animate() {
    if (isPlaying) {
        const speed = parseFloat(document.getElementById('liveSpeedNum').value) || 0;
        position -= (speed / 20);
        container.style.top = position + 'px';
    }
    animationId = requestAnimationFrame(animate);
}

function togglePlay() {
    isPlaying = !isPlaying;
    const label = isPlaying ? "PAUSE" : "START";
    document.getElementById('playBtn').innerText = label;
    document.getElementById('touchPlayBtn').innerText = isPlaying ? "⏸" : "▶";
}

function restartText() { position = window.innerHeight; container.style.top = position + 'px'; }

function startManualScroll(offset) {
    isPlaying = false;
    document.getElementById('playBtn').innerText = "START";
    document.getElementById('touchPlayBtn').innerText = "▶";
    manualScrollId = setInterval(() => {
        position += (offset / 5);
        container.style.top = position + 'px';
    }, 20);
}

function stopManualScroll() { clearInterval(manualScrollId); }

function exitToMenu() {
    cancelAnimationFrame(animationId);
    isPlaying = false;
    document.getElementById('setup').style.display = 'flex';
    prompterDiv.style.display = 'none';
    menu.style.display = 'none';
    document.getElementById('indicator').style.display = 'none';
}

function toggleMenuLock() {
    isMenuLocked = !isMenuLocked;
    document.getElementById('lockBtn').innerText = isMenuLocked ? "MENU: FIXED" : "MENU: AUTO";
    menu.classList.toggle('hidden-menu', !isMenuLocked);
}

window.addEventListener('mousemove', (e) => {
    if (!isMenuLocked && prompterDiv.style.display === 'block') {
        menu.classList.toggle('hidden-menu', e.clientY >= 60);
    }
});

document.getElementById('liveSpeedNum').oninput = (e) => {
    document.getElementById('liveSpeedRange').value = e.target.value;
};
document.getElementById('liveSpeedRange').oninput = (e) => {
    document.getElementById('liveSpeedNum').value = e.target.value;
};
document.getElementById('liveSize').oninput = (e) => {
    container.style.fontSize = e.target.value + 'px';
};

window.addEventListener('wheel', (e) => {
    if (prompterDiv.style.display === 'block') {
        isPlaying = false;
        position -= (e.deltaY / 2);
        container.style.top = position + 'px';
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && document.getElementById('qrFullscreen').style.display === 'flex') {
        closeQrFullscreen();
        return;
    }
    if (prompterDiv.style.display === 'block') {
        if (e.code === "Space") { e.preventDefault(); togglePlay(); }
        if (e.key === "r" || e.key === "R") restartText();
        if (e.key === "ArrowUp") { isPlaying = false; position += 50; }
        if (e.key === "ArrowDown") { isPlaying = false; position -= 50; }
        if (e.key === "Escape") exitToMenu();
        container.style.top = position + 'px';
    }
});
