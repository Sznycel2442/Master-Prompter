let animationId, isPlaying = false, isMenuLocked = true, position = window.innerHeight, scheduledTime = null;
let manualScrollId = null;
const container = document.getElementById('text-container');
const menu = document.getElementById('live-controls');
const prompterDiv = document.getElementById('prompter');

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
    if (prompterDiv.style.display === 'block') {
        if (e.code === "Space") { e.preventDefault(); togglePlay(); }
        if (e.key === "r" || e.key === "R") restartText();
        if (e.key === "ArrowUp") { isPlaying = false; position += 50; }
        if (e.key === "ArrowDown") { isPlaying = false; position -= 50; }
        if (e.key === "Escape") exitToMenu();
        container.style.top = position + 'px';
    }
});
