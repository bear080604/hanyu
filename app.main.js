// ---------- state ----------
let level='HSK1', deck=[], fcIdx=0, qScore=0, qTotal=0, writer=null, wIdx=0, wChars=[];
let userId = localStorage.getItem('wq_user_id') || 'guest_' + Date.now();
localStorage.setItem('wq_user_id', userId);

let favorites = JSON.parse(localStorage.getItem('wq_favorites_' + userId)) || [];
let autoplayInterval = null;
let autoplayRunning = false;
let autoplayTimer = null;
let quizMode = localStorage.getItem('wq_quiz_mode_' + userId) || 'hanzi-to-mean';
let quizPool = []; // Pool từ chưa hỏi trong quiz session
let quizAskedWords = []; // Các từ đã hỏi trong session

const $=id=>document.getElementById(id);

// ---------- API INTEGRATION ----------
// DATA is already declared by data.js, just use it
// If data.js not loaded, initialize it
if (typeof DATA === 'undefined') {
  window.DATA = {};
}
let API_ENABLED = false; // Flag to check if API is available

// Load data from API
async function loadDataFromAPI() {
  try {
    console.log('📡 Loading data from API...');
    
    // Load HSK1
    const hsk1Response = await window.WeiQuanAPI.getVocabulary({ level: 'HSK1', limit: 1000 });
    const hsk1Data = hsk1Response.data.map(item => ({
      h: item.hanzi,
      p: item.pinyin,
      m: item.meaning,
      e: item.example || ''
    }));
    
    // Load HSK2
    const hsk2Response = await window.WeiQuanAPI.getVocabulary({ level: 'HSK2', limit: 1000 });
    const hsk2Data = hsk2Response.data.map(item => ({
      h: item.hanzi,
      p: item.pinyin,
      m: item.meaning,
      e: item.example || ''
    }));
    
    // Update DATA properties instead of reassigning (DATA is const)
    DATA['HSK 1'] = hsk1Data;
    DATA['HSK 2'] = hsk2Data;
    
    console.log('✅ Loaded from API:', hsk1Data.length + hsk2Data.length, 'words');
    API_ENABLED = true;
    
    // Reinit UI after data loaded
    if (typeof initUIWithData === 'function') {
      initUIWithData();
    }
    
  } catch (error) {
    console.warn('⚠️ API not available, falling back to embedded data:', error);
    API_ENABLED = false;
    
    // DATA already has embedded data from data.js, no need to reassign
    console.log('✅ Using embedded data:', Object.keys(DATA).length, 'levels');
    
    // Init UI with fallback data
    if (typeof initUIWithData === 'function') {
      initUIWithData();
    }
  }
}

// Try to load from API after a short delay to ensure api-client.js is loaded
setTimeout(() => {
  if (window.WeiQuanAPI) {
    loadDataFromAPI().catch(err => {
      console.error('Failed to load from API:', err);
    });
  } else {
    console.warn('⚠️ API client not available, using embedded data only');
    // Still init UI with embedded data
    if (typeof initUIWithData === 'function' && DATA && Object.keys(DATA).length > 0) {
      console.log('✅ Initializing UI with embedded data');
      initUIWithData();
    }
  }
}, 500);


// ---------- THEME TOGGLE (LIGHT/DARK MODE) ----------
const themeBtn = $('themeBtn');
if (themeBtn) {
  themeBtn.onclick = () => {
    const isLight = document.documentElement.classList.toggle('light-theme');
    themeBtn.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('wq_theme', isLight ? 'light' : 'dark');
  };
  if (localStorage.getItem('wq_theme') === 'light') {
    document.documentElement.classList.add('light-theme');
    themeBtn.textContent = '☀️';
  }
}

// ---------- HIỆU ỨNG HẠT NỀN ĐỘNG (CANVAS PARTICLES) ----------
const canvas = $('bg-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 1.5 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.2;
    this.speedY = (Math.random() - 0.5) * 0.2;
    this.color = Math.random() > 0.5 ? 'rgba(139, 92, 246, 0.3)' : 'rgba(0, 242, 254, 0.2)';
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

function initParticles() {
  particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push(new Particle());
  }
}
initParticles();

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.update();
    p.draw();
  });
  requestAnimationFrame(animateParticles);
}
animateParticles();

// ---------- audio (Web Speech API + Youdao API Fallback) ----------
let zhVoice=null;
function loadVoices(){
  const vs=speechSynthesis.getVoices();
  zhVoice=vs.find(v=>/zh|Chinese|中文|普通话/i.test(v.lang+v.name))||null;
}
loadVoices();
if(speechSynthesis.onvoiceschanged!==undefined) speechSynthesis.onvoiceschanged=loadVoices;

let ttsFailCount = 0; // Đếm số lần Youdao TTS bị lỗi liên tiếp

function speak(t){
  if(!t)return;
  
  // Dừng mọi âm thanh speechSynthesis đang nói trước đó để tránh dồn ứ
  try {
    speechSynthesis.cancel();
  } catch(e) {}

  // Danh sách các nguồn TTS trực tuyến: Youdao chuyên cho tiếng Trung và Google TTS
  const providers = [
    `https://dict.youdao.com/dictvoice?le=zh&audio=${encodeURIComponent(t)}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(t)}`
  ];

  let providerIndex = 0;

  // Hàm dự phòng (Fallback) sang Web Speech API nội bộ của thiết bị
  const fallbackToWebSpeech = () => {
    console.warn("Using Web Speech API fallback for:", t);
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'zh-CN';
    if (!zhVoice) loadVoices();
    if (zhVoice) u.voice = zhVoice; 
    u.rate = 0.8;
    speechSynthesis.speak(u);
  };

  const tryPlayTTS = () => {
    if (providerIndex >= providers.length) {
      fallbackToWebSpeech();
      return;
    }

    const currentUrl = providers[providerIndex];
    const audio = new Audio(currentUrl);
    let played = false;
    let fallbackTriggered = false;

    // Hẹn giờ timeout: Nếu sau 1.2 giây mà nguồn hiện tại chưa phát được, chuyển sang nguồn tiếp theo
    const playTimeout = setTimeout(() => {
      if (!played && !fallbackTriggered) {
        fallbackTriggered = true;
        audio.pause();
        providerIndex++;
        tryPlayTTS();
      }
    }, 1200);

    audio.onplaying = () => {
      played = true;
      clearTimeout(playTimeout);
    };

    audio.onerror = () => {
      clearTimeout(playTimeout);
      if (!fallbackTriggered) {
        fallbackTriggered = true;
        providerIndex++;
        tryPlayTTS();
      }
    };

    audio.play().catch(err => {
      clearTimeout(playTimeout);
      if (!fallbackTriggered) {
        fallbackTriggered = true;
        providerIndex++;
        tryPlayTTS();
      }
    });
  };

  tryPlayTTS();
}

// ---------- setup selectors ----------
let lvlSel = null;

function initUIWithData() {
  lvlSel = lvlSel || $('levelSel');
  
  console.log('🔍 initUIWithData called:', {
    lvlSel: !!lvlSel,
    DATA: DATA ? Object.keys(DATA).length : 0,
    dataKeys: DATA ? Object.keys(DATA) : []
  });
  
  if (!lvlSel) {
    console.error('❌ levelSel element not found!');
    return;
  }
  
  if (!DATA || Object.keys(DATA).length === 0) {
    console.error('❌ DATA is empty or undefined!');
    return;
  }
  
  // Clear existing options
  lvlSel.innerHTML = '';
  
  Object.keys(DATA).forEach(k=>{
    if (DATA[k] && DATA[k].length > 0) {
      const o=document.createElement('option');
      o.value=k;
      o.textContent=k+' ('+DATA[k].length+' từ)';
      lvlSel.appendChild(o);
      console.log('➕ Added option:', k, DATA[k].length, 'words');
    }
  });
  
  const oFav=document.createElement('option');
  oFav.value='favorites';
  oFav.textContent='⭐ Yêu thích ('+favorites.length+')';
  lvlSel.appendChild(oFav);
  
  lvlSel.onchange=()=>{
    level=lvlSel.value;
    buildRanges();
    applyRange();
    saveProgress();
  };
  
  // Init ranges and apply
  buildRanges();
  applyRange();
  
  console.log('✅ UI initialized with data');
}

// Init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM Content Loaded');
  console.log('🔍 Checking DATA:', typeof DATA, DATA);
  console.log('🔍 DATA keys:', DATA ? Object.keys(DATA) : 'undefined');
  console.log('🔍 DATA["HSK 1"]:', DATA ? DATA['HSK 1']?.length : 'undefined');
  
  lvlSel = $('levelSel');
  console.log('🔍 lvlSel element:', lvlSel);
  
  if (typeof DATA !== 'undefined' && Object.keys(DATA).length > 0) {
    console.log('✅ Calling initUIWithData...');
    initUIWithData();
  } else {
    console.warn('⚠️ DATA not ready yet, will wait for API load');
  }
});

function updateFavOptionText() {
  const oFav = Array.from(lvlSel.options).find(o => o.value === 'favorites');
  if (oFav) {
    oFav.textContent = '⭐ Yêu thích (' + favorites.length + ')';
  }
}

function buildRanges(){
  if (typeof DATA === 'undefined') return;
  const sel=$('rangeSel'); sel.innerHTML='';
  if (level === 'favorites') {
    const all=document.createElement('option');all.value='all';all.textContent='Tất cả';sel.appendChild(all);
    sel.onchange=applyRange;
    return;
  }
  if (!DATA[level]) return;
  const n=DATA[level].length, size=50;
  const all=document.createElement('option');all.value='all';all.textContent='Tất cả';sel.appendChild(all);
  for(let i=0;i<n;i+=size){
    const o=document.createElement('option');
    o.value=i+'-'+Math.min(i+size,n);
    o.textContent='Từ '+(i+1)+'–'+Math.min(i+size,n);
    sel.appendChild(o);
  }
  sel.onchange=() => {
    applyRange();
    saveProgress();
  };
}

function applyRange(){
  if (typeof DATA === 'undefined') return;
  const v=$('rangeSel').value;
  let src;
  if (level === 'favorites') {
    src = favorites;
  } else {
    if (!DATA[level]) return;
    src = DATA[level];
  }
  
  if(v==='all' || level === 'favorites'){deck=src.slice();}
  else{const [a,b]=v.split('-').map(Number);deck=src.slice(a,b);}
  fcIdx=0;wIdx=0;qScore=0;qTotal=0;
  
  // Reset quiz pool khi thay đổi deck
  quizPool = [];
  quizAskedWords = [];
  
  renderFlash();renderWriterList();renderWriter();newQuiz();
  renderFavIcon();
}

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}}
$('shuffleBtn').onclick=()=>{
  shuffle(deck);
  fcIdx=0;
  
  // Reset quiz pool khi shuffle
  quizPool = [];
  quizAskedWords = [];
  
  renderFlash();
  newQuiz();
  renderWriterList();
  renderWriter();
  saveProgress();
};

// ---------- tabs ----------
function updateTabIndicator(tabEl) {
  const tabsContainer = document.querySelector('.tabs');
  if (!tabsContainer || !tabEl) return;
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const idx = tabs.indexOf(tabEl);
  if (idx !== -1) {
    tabsContainer.style.setProperty('--active-index', idx);
  }
}

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  stopAutoplay(); // Dừng chạy tự động khi đổi tab
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  $(t.dataset.p).classList.add('active');
  updateTabIndicator(t);
  if(t.dataset.p==='write') renderWriter();
  saveProgress();
});

window.addEventListener('load', () => {
  const activeTab = document.querySelector('.tab.active');
  if (activeTab) updateTabIndicator(activeTab);
});

// ---------- FLASHCARD & SWIPE GESTURES ----------
const card=$('fcCard');

function recordLearnedWord(wordStr) {
  if (!wordStr) return;
  const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
  const username = currentUser ? currentUser.username : null;
  const progress = WQStorage.getUserDataField(username, 'progress', 'wq_progress') || {};
  if (!progress.learned) progress.learned = [];
  if (!progress.learned.includes(wordStr)) {
    progress.learned.push(wordStr);
    if (currentUser) {
      WQStorage.updateUserData(username, 'progress', progress);
    } else {
      localStorage.setItem('wq_progress', JSON.stringify(progress));
    }
  }
}

function renderFlash(){
  if(!deck.length){
    $('fcHanzi').textContent='Trống';
    $('fcPinyin').textContent='';
    $('fcMean').textContent='Chưa có từ nào trong danh sách';
    $('fcEx').textContent='';
    $('fcCount').textContent='0 / 0';
    $('fcLevel').textContent=level==='favorites'?'Yêu thích':'';
    renderFavIcon();
    return;
  }
  const w=deck[fcIdx];
  recordLearnedWord(w.h);

  card.classList.remove('flip');
  card.style.transform = 'rotateY(0deg)';

  $('fcHanzi').textContent=w.h;
  $('fcPinyin').textContent=w.p;
  $('fcMean').textContent=w.m;
  $('fcEx').textContent=w.e||'';
  $('fcCount').textContent=(fcIdx+1)+' / '+deck.length;
  $('fcLevel').textContent=level==='favorites'?'Yêu thích':level;
  renderFavIcon();
}

// Hiệu ứng Parallax 3D xoay theo chuột (chỉ kích hoạt trên thiết bị có chuột)
if (card && window.matchMedia('(pointer: fine)').matches) {
  card.addEventListener('mousemove', e => {
    if (card.classList.contains('flip')) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateY = ((x - centerX) / centerX) * 15;
    const rotateX = -((y - centerY) / centerY) * 15;
    
    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });
  
  card.addEventListener('mouseleave', () => {
    if (card.classList.contains('flip')) return;
    card.style.transform = 'rotateY(0deg)';
  });
}

card.onclick=(e)=>{
  if (e.target.closest('.icon-btn')) return;
  stopAutoplay(); // Tạm dừng autoplay khi click thủ công
  card.classList.toggle('flip');
  card.style.transform = card.classList.contains('flip') ? 'rotateY(180deg)' : 'rotateY(0deg)';
};

$('fcNext').onclick=(e)=>{
  if(e) e.stopPropagation();
  stopAutoplay();
  if(!deck.length)return;
  fcIdx=(fcIdx+1)%deck.length;
  renderFlash();
  saveProgress();
  
  // Check nếu học chế độ "both" và đã xem hết flashcard
  if (typeof checkFlashcardComplete === 'function') {
    checkFlashcardComplete();
  }
};
$('fcPrev').onclick=(e)=>{
  if(e) e.stopPropagation();
  stopAutoplay();
  if(!deck.length)return;
  fcIdx=(fcIdx-1+deck.length)%deck.length;
  renderFlash();
  saveProgress();
};
$('fcAudio').onclick=e=>{e.stopPropagation(); if(!deck.length)return; speak(deck[fcIdx].h);};

// ---------- favorite toggle ----------
$('fcFav').onclick = (e) => {
  e.stopPropagation();
  if (!deck.length) return;
  const w = deck[fcIdx];
  toggleFavorite(w);
};

function toggleFavorite(w) {
  const idx = favorites.findIndex(f => f.h === w.h);
  const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
  const username = currentUser ? currentUser.username : null;
  
  if (idx === -1) {
    const levelGoc = Object.keys(DATA).find(lvl => DATA[lvl].some(item => item.h === w.h)) || 'HSK1';
    favorites.push({ ...w, levelGoc });
  } else {
    favorites.splice(idx, 1);
  }
  
  if (currentUser) {
    WQStorage.updateUserData(username, 'favorites', favorites);
  } else {
    localStorage.setItem('wq_favorites', JSON.stringify(favorites));
  }
  
  updateFavOptionText();
  renderFavIcon();
  
  if (level === 'favorites') {
    const oldWord = deck[fcIdx];
    deck = favorites.slice();
    if (deck.length === 0) {
      fcIdx = 0;
    } else {
      const newIdx = deck.findIndex(item => item.h === (oldWord && oldWord.h));
      fcIdx = newIdx !== -1 ? newIdx : Math.min(fcIdx, deck.length - 1);
    }
    renderFlash(); renderWriterList(); renderWriter(); newQuiz();
  }
}

function renderFavIcon() {
  if (!deck.length) {
    $('fcFav').classList.remove('active-fav');
    return;
  }
  const w = deck[fcIdx];
  const isFav = favorites.some(f => f.h === w.h);
  $('fcFav').classList.toggle('active-fav', isFav);
}

// TÍCH HỢP VUỐT MÀN HÌNH (SWIPE) TRÊN MOBILE CHO FLASHCARD
let touchStartX = 0;
let touchEndX = 0;

card.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

card.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const swipeThreshold = 50; 
  if (touchStartX - touchEndX > swipeThreshold) {
    $('fcNext').click();
  } else if (touchEndX - touchStartX > swipeThreshold) {
    $('fcPrev').click();
  }
}

// ---------- AUTO-PLAY SLIDESHOW FLASHCARD ----------
const autoplayBtn = $('autoplayBtn');
const autoplaySpeed = $('autoplaySpeed');
const autoplayProgress = $('autoplayProgress');

if (autoplayBtn) {
  autoplayBtn.onclick = (e) => {
    e.stopPropagation();
    if (autoplayRunning) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  };
}

function startAutoplay() {
  if (!deck.length) return;
  autoplayRunning = true;
  $('autoplayBtnText').textContent = '⏸️ Tạm dừng';
  autoplayBtn.classList.add('active-fav');
  runAutoplayCycle();
}

function stopAutoplay() {
  if (!autoplayRunning) return;
  autoplayRunning = false;
  if (autoplayBtn) {
    $('autoplayBtnText').textContent = '▶️ Tự động chạy';
    autoplayBtn.classList.remove('active-fav');
  }
  clearTimeout(autoplayTimer);
  clearInterval(autoplayInterval);
  if (autoplayProgress) autoplayProgress.style.width = '0%';
}

function runAutoplayCycle() {
  if (!autoplayRunning || !deck.length) return;
  
  card.classList.remove('flip');
  card.style.transform = 'rotateY(0deg)';
  
  speak(deck[fcIdx].h);
  
  const speed = parseInt(autoplaySpeed.value) || 5000;
  const halfSpeed = Math.floor(speed / 2);
  
  let timeSpent = 0;
  const updateInterval = 100;
  
  clearInterval(autoplayInterval);
  if (autoplayProgress) autoplayProgress.style.width = '0%';
  
  let cardFlipped = false;
  
  autoplayInterval = setInterval(() => {
    timeSpent += updateInterval;
    const pct = (timeSpent / speed) * 100;
    if (autoplayProgress) autoplayProgress.style.width = `${pct}%`;
    
    // Tự động lật mặt sau khi đi được nửa thời gian
    if (timeSpent >= halfSpeed && !cardFlipped) {
      cardFlipped = true;
      card.classList.add('flip');
      card.style.transform = 'rotateY(180deg)';
    }
    
    if (timeSpent >= speed) {
      clearInterval(autoplayInterval);
      // Chuyển từ kế tiếp
      fcIdx = (fcIdx + 1) % deck.length;
      renderFlash();
      saveProgress();
      
      // Chạy chu kỳ tiếp theo
      autoplayTimer = setTimeout(runAutoplayCycle, 300);
    }
  }, updateInterval);
}

// ---------- QUIZ & MULTIPLE MODES ----------
let qCur=null, qAnswered=false;

// Cài đặt các nút chế độ trắc nghiệm
document.querySelectorAll('.quiz-mode-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.quiz-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quizMode = btn.dataset.mode;
    localStorage.setItem('wq_quiz_mode', quizMode);
    qScore = 0;
    qTotal = 0;
    $('qScore').textContent = 'Điểm: 0 / 0';
    newQuiz();
  };
});

// Khôi phục chế độ trắc nghiệm đã lưu
const savedQuizBtn = document.querySelector(`.quiz-mode-btn[data-mode="${quizMode}"]`);
if (savedQuizBtn) {
  document.querySelectorAll('.quiz-mode-btn').forEach(b => b.classList.remove('active'));
  savedQuizBtn.classList.add('active');
}

function newQuiz(){
  if(deck.length<2){$('qHanzi').textContent='Cần ít nhất 2 từ';$('qOpts').innerHTML='';return;}
  qAnswered=false;$('qResult').textContent='';
  
  // Nếu pool rỗng, reset lại pool từ deck và shuffle
  if (quizPool.length === 0) {
    quizPool = [...deck];
    shuffle(quizPool);
    console.log('🔄 Reset quiz pool với', quizPool.length, 'từ');
  }
  
  // Lấy từ đầu tiên trong pool (đảm bảo không trùng)
  qCur = quizPool.shift();
  quizAskedWords.push(qCur);
  console.log('❓ Câu hỏi:', qCur.h, '- Còn lại trong pool:', quizPool.length);
  
  const promptHanzi = $('qHanzi');
  const promptPinyin = $('qPinyin');
  
  // Tùy chỉnh hiển thị câu hỏi dựa trên Quiz Mode
  if (quizMode === 'hanzi-to-mean') {
    promptHanzi.style.display = 'block';
    promptPinyin.style.display = 'block';
    promptHanzi.textContent = qCur.h;
    promptPinyin.textContent = qCur.p;
  } else if (quizMode === 'mean-to-hanzi') {
    promptHanzi.style.display = 'block';
    promptPinyin.style.display = 'none';
    promptHanzi.textContent = qCur.m;
  } else if (quizMode === 'hanzi-to-pinyin') {
    promptHanzi.style.display = 'block';
    promptPinyin.style.display = 'none';
    promptHanzi.textContent = qCur.h;
  } else if (quizMode === 'audio-to-mean') {
    promptHanzi.style.display = 'block';
    promptPinyin.style.display = 'none';
    promptHanzi.textContent = '🔊 Nhấn để nghe';
    speak(qCur.h); // Tự động phát âm khi hiện câu hỏi
  }
  
  let opts=[qCur];
  const pool=deck.filter(w=>w!==qCur);
  
  // Shuffle pool trước để random
  shuffle(pool);
  
  // Lấy tối đa 3 từ khác từ pool (đã shuffle nên không trùng)
  for (let i = 0; i < Math.min(3, pool.length); i++) {
    opts.push(pool[i]);
  }
  
  // Shuffle lại opts để trộn vị trí đáp án đúng
  shuffle(opts);
  
  const box=$('qOpts');box.innerHTML='';
  opts.forEach(o=>{
    const d=document.createElement('div');d.className='q-opt';
    
    // Tùy chỉnh hiển thị câu trả lời dựa trên Quiz Mode
    if (quizMode === 'hanzi-to-mean' || quizMode === 'audio-to-mean') {
      d.textContent = o.m;
    } else if (quizMode === 'mean-to-hanzi') {
      d.textContent = `${o.h} (${o.p})`;
    } else if (quizMode === 'hanzi-to-pinyin') {
      d.textContent = o.p;
    }
    
    d.onclick=()=>answer(d,o);
    box.appendChild(d);
  });
  $('qLevel').textContent=level==='favorites'?'Yêu thích':level;
}

function recordSrsAnswer(wordStr, isCorrect) {
  const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
  if (!currentUser) return;
  const username = currentUser.username;
  const srs = WQStorage.getUserDataField(username, 'srs', '') || {};
  
  if (!srs[wordStr]) {
    srs[wordStr] = {
      reviewCount: 0,
      interval: 1,
      nextReview: ''
    };
  }
  
  const item = srs[wordStr];
  if (isCorrect) {
    item.reviewCount += 1;
    item.interval = item.reviewCount === 1 ? 1 : item.interval * 2;
  } else {
    item.reviewCount = 0;
    item.interval = 1;
  }
  
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + item.interval);
  item.nextReview = nextDate.toISOString().split('T')[0];
  
  srs[wordStr] = item;
  WQStorage.updateUserData(username, 'srs', srs);
}

function answer(el,o){
  if(qAnswered)return;qAnswered=true;qTotal++;
  document.querySelectorAll('.q-opt').forEach(x=>x.classList.add('disabled'));
  
  // Xác định câu trả lời đúng định dạng hiển thị
  let correctText = '';
  if (quizMode === 'hanzi-to-mean' || quizMode === 'audio-to-mean') {
    correctText = qCur.m;
  } else if (quizMode === 'mean-to-hanzi') {
    correctText = `${qCur.h} (${qCur.p})`;
  } else if (quizMode === 'hanzi-to-pinyin') {
    correctText = qCur.p;
  }
  
  if(o===qCur){
    el.classList.add('correct');
    qScore++;
    $('qResult').textContent='✓ Chính xác!';
    $('qResult').style.color='var(--neon-green)';
    recordSrsAnswer(qCur.h, true);
  } else {
    el.classList.add('wrong');
    document.querySelectorAll('.q-opt').forEach(x=>{
      if(x.textContent===correctText) x.classList.add('correct');
    });
    $('qResult').textContent='✗ Đáp án: '+correctText;
    $('qResult').style.color='var(--neon-red)';
    recordSrsAnswer(qCur.h, false);
  }
  speak(qCur.h);
  $('qScore').textContent='Điểm: '+qScore+' / '+qTotal;
}

$('qNext').onclick=newQuiz;
$('qAudio').onclick=()=>speak(qCur&&qCur.h);

// ---------- WRITER ----------
function renderWriterList(){
  const pick=$('wPick');pick.innerHTML='';
  deck.forEach((w,i)=>{
    const d=document.createElement('div');d.className='w-char';d.textContent=w.h;
    d.onclick=()=>{wIdx=i;renderWriter();};
    pick.appendChild(d);
  });
}

function renderWriter(){
  if(!deck.length)return;
  const w=deck[wIdx];
  recordLearnedWord(w.h);
  $('wPinyin').textContent=w.p;
  $('wMean').textContent=w.m;
  $('wWord').textContent=w.h;
  $('wLevel').textContent=level==='favorites'?'Yêu thích':level;
  document.querySelectorAll('#wPick .w-char').forEach((c,i)=>c.classList.toggle('active',i===wIdx));
  buildWriter(w.h);
}

function buildWriter(word){
  const tgt=$('writer-target');tgt.innerHTML='';
  wChars=[...word].filter(c=>/[\u4e00-\u9fff]/.test(c));
  if(!wChars.length){tgt.innerHTML='<div style="padding:40px;color:var(--text-muted)">Không có chữ Hán</div>';writer=null;return;}
  
  const containerWidth = tgt.clientWidth || tgt.parentElement.clientWidth || 300;
  const padding = 16;
  const gap = 12;
  const maxCols = Math.min(wChars.length, 4);
  const availableWidth = containerWidth - (padding * 2) - (gap * (maxCols - 1));
  let size = Math.floor(availableWidth / maxCols);
  size = Math.min(160, Math.max(100, size));
  
  const writers=[];
  wChars.forEach((ch,i)=>{
    const div=document.createElement('div');
    div.id='wz'+i;
    div.style.display='inline-block';
    div.style.margin = '6px';
    div.style.background = 'rgba(255, 255, 255, 0.02)';
    div.style.borderRadius = '16px';
    div.style.border = '1px solid rgba(139, 92, 246, 0.15)';
    div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
    div.style.touchAction = 'none';
    tgt.appendChild(div);
    
    writers.push(HanziWriter.create('wz'+i,ch,{
      width:size,
      height:size,
      padding: Math.floor(size * 0.08),
      strokeColor:'#332f55',
      radicalColor:'#D946EF',
      showOutline:true,
      showCharacter:true,
      drawingColor:'#00F2FE',
      drawingWidth: 5
    }));
  });
  writer={writers};
}

$('wAnimate').onclick=()=>{
  if(!writer)return;
  let i=0;
  const run=()=>{if(i<writer.writers.length){writer.writers[i].animateCharacter({onComplete:()=>{i++;run();}});}};
  run();
  speak(deck[wIdx].h);
};

$('wQuiz').onclick=()=>{
  if(!writer)return;
  writer.writers.forEach(wz=>wz.quiz());
};
$('wAudio').onclick=()=>speak(deck[wIdx].h);

// keyboard for flashcard
document.addEventListener('keydown',e=>{
  if(!$('flash').classList.contains('active'))return;
  if(e.key==='ArrowRight')$('fcNext').click();
  if(e.key==='ArrowLeft')$('fcPrev').click();
  if(e.key===' '){e.preventDefault(); card.click();}
});

// ---------- PROGRESS SAVING & LOADING ----------
function saveProgress() {
  const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
  const username = currentUser ? currentUser.username : null;
  const progressData = {
    level,
    rangeVal: $('rangeSel')?.value || 'all',
    fcIdx,
    wIdx,
    activeTab: document.querySelector('.tab.active')?.dataset.p || 'flash',
    learned: (currentUser ? WQStorage.getUserDataField(username, 'progress', 'wq_progress')?.learned : JSON.parse(localStorage.getItem('wq_progress'))?.learned) || []
  };
  
  if (currentUser) {
    WQStorage.updateUserData(username, 'progress', progressData);
  } else {
    localStorage.setItem('wq_progress', JSON.stringify(progressData));
  }
}

function loadProgress() {
  const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
  const username = currentUser ? currentUser.username : null;
  const saved = WQStorage.getUserDataField(username, 'progress', 'wq_progress');
  
  // Check if elements exist
  if (!lvlSel) {
    console.warn('⚠️ loadProgress: lvlSel not ready yet');
    return;
  }
  
  if (saved) {
    if (saved.level) {
      level = saved.level;
      lvlSel.value = level;
    }
    buildRanges();
    const rangeSel = $('rangeSel');
    if (saved.rangeVal && rangeSel) {
      rangeSel.value = saved.rangeVal;
    }
    applyRange();
    if (saved.fcIdx !== undefined && saved.fcIdx < deck.length) {
      fcIdx = saved.fcIdx;
      renderFlash();
    }
    if (saved.wIdx !== undefined && saved.wIdx < deck.length) {
      wIdx = saved.wIdx;
      renderWriterList();
      renderWriter();
    }
    if (saved.activeTab) {
      const tab = document.querySelector(`.tab[data-p="${saved.activeTab}"]`);
      if (tab) tab.click();
    }
  } else {
    buildRanges();
    applyRange();
  }
}

// ---------- SYNC DATA FOR AUTH ----------
window.WQSyncData = function(username) {
  favorites = WQStorage.getUserDataField(username, 'favorites', 'wq_favorites');
  updateFavOptionText();
  
  const userProgress = WQStorage.getUserDataField(username, 'progress', 'wq_progress');
  if (userProgress) {
    if (userProgress.level) {
      level = userProgress.level;
      if (lvlSel) lvlSel.value = level;
    }
    buildRanges();
    if (userProgress.rangeVal) {
      const rangeSel = $('rangeSel');
      if (rangeSel) rangeSel.value = userProgress.rangeVal;
    }
    applyRange();
    if (userProgress.fcIdx !== undefined && userProgress.fcIdx < deck.length) {
      fcIdx = userProgress.fcIdx;
      renderFlash();
    }
    if (userProgress.wIdx !== undefined && userProgress.wIdx < deck.length) {
      wIdx = userProgress.wIdx;
      renderWriterList();
      renderWriter();
    }
    if (userProgress.activeTab) {
      const tab = document.querySelector(`.tab[data-p="${userProgress.activeTab}"]`);
      if (tab) tab.click();
    }
  } else {
    level = 'HSK1';
    if (lvlSel) lvlSel.value = 'HSK1';
    buildRanges();
    applyRange();
  }
};

// Khởi chạy - wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  if (typeof DATA !== 'undefined') {
    if (window.WQAuth) {
      window.WQAuth.init();
    }
    // Load progress after lvlSel is ready
    setTimeout(() => {
      if (lvlSel) loadProgress();
    }, 100);
  }
});

// ---------- SEARCH FUNCTIONALITY ----------
function removePinyinTones(str) {
  if (!str) return '';
  const toneMap = {
    'ā':'a', 'á':'a', 'ǎ':'a', 'à':'a',
    'ē':'e', 'é':'e', 'ě':'e', 'è':'e',
    'ī':'i', 'í':'i', 'ǐ':'i', 'ì':'i',
    'ō':'o', 'ó':'o', 'ǒ':'o', 'ò':'o',
    'ū':'u', 'ú':'u', 'ǔ':'u', 'ù':'u',
    'ü':'u', 'ǘ':'u', 'ǚ':'u', 'ǜ':'u',
    'ā':'a', 'á':'a', 'ǎ':'a', 'à':'a',
    'ē':'e', 'é':'e', 'ě':'e', 'è':'e',
    'ī':'i', 'í':'i', 'ǐ':'i', 'ì':'i',
    'ō':'o', 'ó':'o', 'ǒ':'o', 'ò':'o',
    'ū':'u', 'ú':'u', 'ǔ':'u', 'ù':'u',
    'ü':'u', 'ǘ':'u', 'ǚ':'u', 'ǜ':'u'
  };
  return str.toLowerCase().split('').map(char => toneMap[char] || char).join('')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const searchInput = $('searchInput');
const suggestionsBox = $('searchSuggestions');

if (searchInput && suggestionsBox) {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      suggestionsBox.style.display = 'none';
      return;
    }
    
    const normQuery = removePinyinTones(query);
    let results = [];
    
    Object.keys(DATA).forEach(lvl => {
      DATA[lvl].forEach(w => {
        const matchHanzi = w.h.toLowerCase().includes(query);
        const matchMean = w.m.toLowerCase().includes(query);
        const matchPinyin = w.p.toLowerCase().includes(query) || removePinyinTones(w.p).includes(normQuery);
        
        if (matchHanzi || matchMean || matchPinyin) {
          if (!results.some(r => r.h === w.h)) {
            results.push({ ...w, level: lvl });
          }
        }
      });
    });
    
    results = results.slice(0, 10);
    
    if (results.length > 0) {
      suggestionsBox.innerHTML = '';
      results.forEach(w => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
          <div class="suggestion-header">
            <span class="suggestion-hanzi">${w.h}</span>
            <span class="suggestion-level">${w.level}</span>
          </div>
          <span class="suggestion-pinyin">${w.p}</span>
          <span class="suggestion-mean">${w.m}</span>
        `;
        div.onclick = () => {
          navigateToWord(w);
          suggestionsBox.style.display = 'none';
          searchInput.value = '';
        };
        suggestionsBox.appendChild(div);
      });
      suggestionsBox.style.display = 'block';
    } else {
      suggestionsBox.innerHTML = '<div style="padding:12px 18px; color: var(--text-muted); font-size:0.9rem">Không tìm thấy kết quả</div>';
      suggestionsBox.style.display = 'block';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
      suggestionsBox.style.display = 'none';
    }
  });
}

function navigateToWord(w) {
  level = w.level;
  lvlSel.value = level;
  
  const src = DATA[level];
  const originalIdx = src.findIndex(item => item.h === w.h);
  
  if (originalIdx !== -1) {
    const rangeSel = $('rangeSel');
    const size = 50;
    const rangeStart = Math.floor(originalIdx / size) * size;
    const rangeEnd = Math.min(rangeStart + size, src.length);
    const rangeValue = rangeStart + '-' + rangeEnd;
    
    buildRanges();
    rangeSel.value = rangeValue;
    
    deck = src.slice(rangeStart, rangeEnd);
    fcIdx = originalIdx - rangeStart;
    wIdx = originalIdx - rangeStart;
    qScore = 0; qTotal = 0;
    
    const flashTab = document.querySelector('.tab[data-p="flash"]');
    if (flashTab) flashTab.click();
    
    renderFlash();
    renderWriterList();
    renderWriter();
    newQuiz();
    saveProgress();
  }
}

// ---------- FAVORITE MODAL LIST ----------
const favModal = $('favModal');
const favModalList = $('favModalList');
const favModalCount = $('favModalCount');
const favListBtn = $('favListBtn');
const closeFavModalBtn = $('closeFavModalBtn');

function renderFavModalList() {
  if (!favModalList) return;
  favModalList.innerHTML = '';
  if (favModalCount) favModalCount.textContent = favorites.length;
  
  if (favorites.length === 0) {
    favModalList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Danh sách yêu thích trống</div>';
    return;
  }
  
  favorites.forEach((w) => {
    const item = document.createElement('div');
    item.className = 'fav-item';
    
    item.onclick = (e) => {
      if (e.target.closest('.fav-item-btn')) return;
      navigateToWord({ ...w, level: w.levelGoc || 'HSK1' });
      if (favModal) favModal.classList.remove('active');
    };
    
    item.innerHTML = `
      <div class="fav-item-info">
        <div class="fav-item-main">
          <span class="fav-item-hanzi">${w.h}</span>
          <span class="fav-item-level">${w.levelGoc || 'HSK'}</span>
          <span class="fav-item-pinyin">${w.p}</span>
        </div>
        <span class="fav-item-mean">${w.m}</span>
      </div>
      <div class="fav-item-actions">
        <button class="fav-item-btn speak" aria-label="Speak">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        </button>
        <button class="fav-item-btn delete" aria-label="Delete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    `;
    
    item.querySelector('.fav-item-btn.speak').onclick = (e) => {
      e.stopPropagation();
      speak(w.h);
    };
    
    item.querySelector('.fav-item-btn.delete').onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(w);
      renderFavModalList();
    };
    
    favModalList.appendChild(item);
  });
}

if (favListBtn && favModal) {
  favListBtn.onclick = (e) => {
    e.stopPropagation();
    stopAutoplay();
    renderFavModalList();
    favModal.classList.add('active');
  };
}

if (closeFavModalBtn && favModal) {
  closeFavModalBtn.onclick = () => {
    favModal.classList.remove('active');
  };
}

window.addEventListener('click', (e) => {
  if (favModal && e.target === favModal) {
    favModal.classList.remove('active');
  }
});

// ---------- SIDEBAR NAVIGATION & MODERN DASHBOARD ----------
(function() {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const headerTitle = document.getElementById('headerTitle');
  const learnSelectorsWrapper = document.getElementById('learnSelectorsWrapper');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

  // Khởi tạo các sự kiện điều hướng Sidebar
  function initSidebarNavigation() {
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    
    menuItems.forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        const sectionId = item.dataset.section;
        if (!sectionId) return;

        // Cập nhật trạng thái active của menu
        menuItems.forEach(x => x.classList.remove('active'));
        item.classList.add('active');

        // Đổi tiêu đề header
        headerTitle.textContent = item.querySelector('.menu-text').textContent;

        // Ẩn tất cả section và panel
        document.querySelectorAll('.app-section').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));

        // Kiểm tra loại section để xử lý hiển thị bộ chọn level/range
        if (['flash', 'quiz', 'write'].includes(sectionId)) {
          if (learnSelectorsWrapper) learnSelectorsWrapper.style.display = 'flex';
          
          // Kích hoạt tab học tương ứng trong app.js bằng cách click tab ẩn
          const targetTab = document.querySelector(`.tab[data-p="${sectionId}"]`);
          if (targetTab) {
            targetTab.click(); // Điều này sẽ tự động thêm active cho panel và chạy render
          }
        } else {
          if (learnSelectorsWrapper) learnSelectorsWrapper.style.display = 'none';
          stopAutoplay();

          // Hiển thị section tùy chỉnh
          const targetSection = document.getElementById(`section-${sectionId}`);
          if (targetSection) {
            targetSection.classList.add('active');
          }

          // Kích hoạt render dữ liệu cụ thể cho từng Section
          if (sectionId === 'home') {
            updateHomeDashboard();
          } else if (sectionId === 'profile' && window.WQProfile) {
            window.WQProfile.openProfileModal();
          } else if (sectionId === 'stats' && window.WQProfile) {
            window.WQProfile.openStatsModal();
          } else if (sectionId === 'favorites') {
            if (typeof renderFavModalList === 'function') {
              renderFavModalList();
            }
          } else if (sectionId === 'settings') {
            updateSettingsUI();
          }
        }

        // Tự động đóng sidebar trên mobile sau khi chọn menu
        if (sidebar) sidebar.classList.remove('active');
      };
    });

    // Nút mở/đóng Sidebar trên Mobile
    if (sidebarToggleBtn && sidebar) {
      sidebarToggleBtn.onclick = (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('active');
      };
      
      // Click ra ngoài để đóng sidebar trên mobile
      document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== sidebarToggleBtn) {
          sidebar.classList.remove('active');
        }
      });
    }

    // Nút Đăng xuất ở chân Sidebar
    if (sidebarLogoutBtn && window.WQAuth) {
      sidebarLogoutBtn.onclick = (e) => {
        e.preventDefault();
        window.WQAuth.logout();
      };
    }
  }

  // Cập nhật số liệu & cấp độ HSK ở Trang chủ
  function updateHomeDashboard() {
    const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
    const welcomeText = document.getElementById('welcomeUserText');
    const userStreakVal = document.getElementById('userStreakVal');
    
    if (currentUser) {
      if (welcomeText) welcomeText.innerHTML = `Chào mừng quay lại, <span style="background:var(--accent-gradient); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">${currentUser.username}</span>! 👋`;
      
      const users = WQStorage.getUsers();
      const user = users.find(u => u.username === currentUser.username);
      if (user) {
        // Tính chuỗi streak (giả lập hoặc tính ngày dựa trên progress/srs)
        const learned = user.progress?.learned || [];
        const streak = learned.length > 0 ? Math.max(1, Math.min(7, Math.ceil(learned.length / 5))) : 0;
        if (userStreakVal) userStreakVal.textContent = `${streak} ngày`;
      }
    } else {
      if (welcomeText) welcomeText.textContent = `Chào mừng bạn học tập! 👋`;
      if (userStreakVal) userStreakVal.textContent = `0 ngày`;
    }

    renderHomeHskGrid();
  }

  // Render 6 cấp độ HSK ở Trang chủ
  function renderHomeHskGrid() {
    const homeHskGrid = document.getElementById('homeHskGrid');
    if (!homeHskGrid || typeof DATA === 'undefined') return;

    homeHskGrid.innerHTML = '';
    const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
    const username = currentUser ? currentUser.username : null;
    const learnedList = (currentUser ? WQStorage.getUserDataField(username, 'progress', 'wq_progress')?.learned : JSON.parse(localStorage.getItem('wq_progress'))?.learned) || [];

    const colors = [
      'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)', // Cyan (HSK1)
      'linear-gradient(135deg, #10B981 0%, #059669 100%)', // Green (HSK2)
      'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', // Yellow/Orange (HSK3)
      'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)', // Pink (HSK4)
      'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)', // Purple (HSK5)
      'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'  // Red (HSK6)
    ];

    Object.keys(DATA).forEach((lvl, index) => {
      const words = DATA[lvl];
      const total = words.length;
      let learnedCount = 0;
      words.forEach(w => {
        if (learnedList.includes(w.h)) learnedCount++;
      });
      const percent = total > 0 ? Math.round((learnedCount / total) * 100) : 0;
      const color = colors[index % colors.length];

      const card = document.createElement('div');
      card.className = 'hsk-card';
      card.style.setProperty('--card-color', color);
      card.innerHTML = `
        <div class="hsk-card-header">
          <h4>${lvl}</h4>
          <span class="word-count">${total} từ</span>
        </div>
        <div class="progress-wrapper">
          <div class="progress-info">
            <span>Tiến độ</span>
            <span>${learnedCount}/${total} (${percent}%)</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>
        <button class="btn start-learn-btn" style="background: ${color}; border: none; color: #fff;">Học ngay</button>
      `;

      card.querySelector('.start-learn-btn').onclick = () => {
        // Cập nhật Selector
        const lvlSel = document.getElementById('levelSel');
        if (lvlSel) {
          lvlSel.value = lvl;
          lvlSel.dispatchEvent(new Event('change'));
        }

        // Chuyển hướng sang Flashcard
        const flashMenu = document.querySelector('.sidebar-menu .menu-item[data-section="flash"]');
        if (flashMenu) flashMenu.click();
      };

      homeHskGrid.appendChild(card);
    });
  }

  // Đồng bộ giao diện Cài đặt (Settings UI)
  function updateSettingsUI() {
    const isLightTheme = document.documentElement.classList.contains('light-theme');
    const settingsThemeBtn = document.getElementById('settingsThemeBtn');
    if (settingsThemeBtn) {
      settingsThemeBtn.textContent = isLightTheme ? '☀️ Chế độ sáng' : '🌙 Chế độ tối';
    }

    const settingsAutoplaySpeed = document.getElementById('settingsAutoplaySpeed');
    const autoplaySpeed = document.getElementById('autoplaySpeed');
    if (settingsAutoplaySpeed && autoplaySpeed) {
      settingsAutoplaySpeed.value = autoplaySpeed.value;
    }
  }

  // Khởi tạo các sự kiện trong Cài đặt
  function initSettingsEvents() {
    const settingsThemeBtn = document.getElementById('settingsThemeBtn');
    const settingsAutoplaySpeed = document.getElementById('settingsAutoplaySpeed');
    const resetProgressBtn = document.getElementById('resetProgressBtn');

    // Chuyển Theme từ Cài đặt
    if (settingsThemeBtn) {
      settingsThemeBtn.onclick = () => {
        // Tìm và click themeBtn cũ ẩn trong DOM
        const themeBtn = document.getElementById('themeBtn');
        if (themeBtn) {
          // Thao tác đổi theme giống hệt logic cũ của app.js
          const isLight = document.documentElement.classList.toggle('light-theme');
          themeBtn.textContent = isLight ? '☀️' : '🌙';
          localStorage.setItem('wq_theme', isLight ? 'light' : 'dark');
          
          setTimeout(updateSettingsUI, 50); // Cập nhật lại UI Cài đặt
        } else {
          // Fallback nếu không có themeBtn cũ
          const isLight = document.documentElement.classList.toggle('light-theme');
          localStorage.setItem('wq_theme', isLight ? 'light' : 'dark');
          setTimeout(updateSettingsUI, 50);
        }
      };
    }

    // Tốc độ Autoplay
    if (settingsAutoplaySpeed) {
      settingsAutoplaySpeed.onchange = () => {
        const autoplaySpeed = document.getElementById('autoplaySpeed');
        if (autoplaySpeed) {
          autoplaySpeed.value = settingsAutoplaySpeed.value;
          autoplaySpeed.dispatchEvent(new Event('change'));
        }
      };
    }

    // Reset tiến trình học tập
    if (resetProgressBtn) {
      resetProgressBtn.onclick = () => {
        const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
        if (!currentUser) return;

        const confirmReset = confirm("Bạn có chắc chắn muốn xóa toàn bộ tiến trình học tập, danh sách yêu thích và lịch ôn tập SRS của tài khoản này không? Hành động này không thể hoàn tác!");
        if (confirmReset) {
          const username = currentUser.username;
          // Cập nhật dữ liệu trống trong storage
          WQStorage.updateUserData(username, 'progress', { level: 'HSK1', rangeVal: 'all', fcIdx: 0, wIdx: 0, learned: [] });
          WQStorage.updateUserData(username, 'favorites', []);
          WQStorage.updateUserData(username, 'srs', {});

          // Đồng bộ lại giao diện
          if (window.WQSyncData) {
            window.WQSyncData(username);
          }

          if (window.showToast) {
            window.showToast("Đã khôi phục cài đặt tiến trình học tập về ban đầu!", "success");
          }

          // Quay về Trang chủ
          const homeMenu = document.querySelector('.sidebar-menu .menu-item[data-section="home"]');
          if (homeMenu) homeMenu.click();
        }
      };
    }
  }

  // Override hàm toàn cục WQSyncData để đồng bộ cả Dashboard trang chủ khi đổi User
  const originalSyncData = window.WQSyncData;
  window.WQSyncData = function(username) {
    if (typeof originalSyncData === 'function') {
      originalSyncData(username);
    }
    
    // Cập nhật Dashboard Trang chủ khi đồng bộ
    updateHomeDashboard();
  };

  // Lắng nghe sự kiện nạp trang
  document.addEventListener('DOMContentLoaded', () => {
    // Đảm bảo chỉ trang chủ active khi load
    document.querySelectorAll('.app-section').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    const homeSection = document.getElementById('section-home');
    if (homeSection) homeSection.classList.add('active');
    
    // Ẩn learn selectors ban đầu (chỉ hiện khi vào flash/quiz/write)
    if (learnSelectorsWrapper) learnSelectorsWrapper.style.display = 'none';
    
    initSidebarNavigation();
    initSettingsEvents();
    
    // Tự động load Dashboard trang chủ lần đầu
    setTimeout(updateHomeDashboard, 100);
  });
})();


// ==================== CUSTOM DECK FEATURE ====================
(function() {
  let currentCustomWords = []; // Bộ từ đang soạn
  let customHistory = []; // Lịch sử các bộ từ đã lưu
  let selectedWord = null; // Từ được chọn từ database

  // Load lịch sử từ localStorage
  function loadCustomHistory() {
    const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
    const username = currentUser ? currentUser.username : null;
    
    if (username) {
      customHistory = WQStorage.getUserDataField(username, 'customDecks', '') || [];
    } else {
      customHistory = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
    }
  }

  // Lưu lịch sử vào localStorage
  function saveCustomHistory() {
    const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
    const username = currentUser ? currentUser.username : null;
    
    if (username) {
      WQStorage.updateUserData(username, 'customDecks', customHistory);
    } else {
      localStorage.setItem('wq_custom_decks', JSON.stringify(customHistory));
    }
  }

  // Tìm kiếm từ trong database (with API fallback)
  async function searchInDatabase(query) {
    if (!query) return [];
    
    // Try API search first if available
    if (API_ENABLED && window.WeiQuanAPI) {
      try {
        const response = await window.WeiQuanAPI.search(query);
        if (response.success && response.data.length > 0) {
          return response.data.slice(0, 8).map(item => ({
            h: item.hanzi,
            p: item.pinyin,
            m: item.meaning,
            e: item.example || '',
            level: item.level
          }));
        }
      } catch (error) {
        console.warn('⚠️ API search failed, using local data:', error);
      }
    }
    
    // Fallback to local search
    if (typeof DATA === 'undefined' || Object.keys(DATA).length === 0) return [];
    
    const normQuery = removePinyinTones(query.toLowerCase());
    let results = [];
    
    Object.keys(DATA).forEach(lvl => {
      if (!DATA[lvl]) return;
      DATA[lvl].forEach(w => {
        const matchHanzi = w.h.toLowerCase().includes(query);
        const matchMean = w.m.toLowerCase().includes(query);
        const matchPinyin = w.p.toLowerCase().includes(query) || removePinyinTones(w.p).includes(normQuery);
        
        if (matchHanzi || matchMean || matchPinyin) {
          if (!results.some(r => r.h === w.h)) {
            results.push({ ...w, level: lvl });
          }
        }
      });
    });
    
    return results.slice(0, 8);
  }

  // Render suggestions khi search (async version)
  async function renderCustomSearchSuggestions(query) {
    const suggestionsBox = $('customSearchSuggestions');
    const clearBtn = $('customSearchClearBtn');
    
    if (!query.trim()) {
      suggestionsBox.style.display = 'none';
      clearBtn.style.display = 'none';
      return;
    }

    clearBtn.style.display = 'flex';
    
    // Show loading
    suggestionsBox.innerHTML = '<div style="padding:12px 18px; color: var(--text-muted);">🔍 Đang tìm...</div>';
    suggestionsBox.style.display = 'block';
    
    const results = await searchInDatabase(query);
    
    if (results.length > 0) {
      suggestionsBox.innerHTML = '';
      results.forEach(w => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
          <div class="suggestion-header">
            <span class="suggestion-hanzi">${w.h}</span>
            <span class="suggestion-level">${w.level}</span>
          </div>
          <span class="suggestion-pinyin">${w.p}</span>
          <span class="suggestion-mean">${w.m}</span>
        `;
        div.onclick = () => selectWordFromDatabase(w);
        suggestionsBox.appendChild(div);
      });
      suggestionsBox.style.display = 'block';
    } else {
      suggestionsBox.innerHTML = '<div style="padding:12px 18px; color: var(--text-muted); font-size:0.9rem">Không tìm thấy. Bạn có thể nhập thủ công ở dưới.</div>';
      suggestionsBox.style.display = 'block';
    }
  }

  // Chọn từ từ database
  function selectWordFromDatabase(word) {
    selectedWord = word;
    
    // Ẩn search box và suggestions
    $('customSearchInput').value = '';
    $('customSearchSuggestions').style.display = 'none';
    $('customSearchClearBtn').style.display = 'none';
    
    // Hiển thị từ đã chọn
    $('selectedHanzi').textContent = word.h;
    $('selectedPinyin').textContent = word.p;
    $('selectedMeaning').textContent = word.m;
    $('selectedExample').textContent = word.ex || 'Không có ví dụ';
    $('customSelectedWord').style.display = 'block';
    
    // Ẩn form manual
    const manualDetails = $('manualInputDetails');
    if (manualDetails) manualDetails.removeAttribute('open');
  }

  // Hủy chọn từ
  function deselectWord() {
    selectedWord = null;
    $('customSelectedWord').style.display = 'none';
    $('customSearchInput').focus();
  }

  // Thêm từ đã chọn từ database
  function addSelectedWord() {
    if (!selectedWord) return;
    
    // Kiểm tra trùng
    if (currentCustomWords.some(w => w.h === selectedWord.h)) {
      if (window.showToast) {
        window.showToast(`Từ "${selectedWord.h}" đã có trong danh sách!`, 'error');
      }
      return;
    }

    currentCustomWords.push({
      h: selectedWord.h,
      p: selectedWord.p,
      m: selectedWord.m,
      ex: selectedWord.ex || ''
    });
    
    deselectWord();
    renderCustomWordsList();
    
    if (window.showToast) {
      window.showToast(`Đã thêm từ "${selectedWord.h}"`, 'success');
    }
  }

  // Thêm từ thủ công
  function addManualWord() {
    const hanzi = $('customHanzi').value.trim();
    const pinyin = $('customPinyin').value.trim();
    const meaning = $('customMeaning').value.trim();
    const example = $('customExample').value.trim();

    if (!hanzi || !pinyin || !meaning) {
      if (window.showToast) {
        window.showToast('Vui lòng nhập đầy đủ Hán tự, Pinyin và Nghĩa!', 'error');
      } else {
        alert('Vui lòng nhập đầy đủ Hán tự, Pinyin và Nghĩa!');
      }
      return;
    }

    // Kiểm tra trùng
    if (currentCustomWords.some(w => w.h === hanzi)) {
      if (window.showToast) {
        window.showToast(`Từ "${hanzi}" đã có trong danh sách!`, 'error');
      }
      return;
    }

    const word = {
      h: hanzi,
      p: pinyin,
      m: meaning,
      ex: example
    };

    currentCustomWords.push(word);
    clearManualForm();
    renderCustomWordsList();
    
    if (window.showToast) {
      window.showToast(`Đã thêm từ "${hanzi}"`, 'success');
    }
  }

  // Xóa form nhập thủ công
  function clearManualForm() {
    $('customHanzi').value = '';
    $('customPinyin').value = '';
    $('customMeaning').value = '';
    $('customExample').value = '';
  }

  // Render danh sách từ hiện tại
  function renderCustomWordsList() {
    const list = $('customWordsList');
    const count = $('customWordCount');
    
    count.textContent = currentCustomWords.length;

    if (currentCustomWords.length === 0) {
      list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Chưa có từ nào. Hãy tìm và thêm từ ở trên! 👆</div>';
      return;
    }

    list.innerHTML = '';
    currentCustomWords.forEach((word, index) => {
      const item = document.createElement('div');
      item.className = 'custom-word-item';
      item.innerHTML = `
        <div class="custom-word-info">
          <div class="custom-word-main">
            <span class="custom-word-hanzi">${word.h}</span>
            <span class="custom-word-pinyin">${word.p}</span>
          </div>
          <span class="custom-word-meaning">${word.m}</span>
        </div>
        <div class="custom-word-actions">
          <button class="custom-word-btn speak" aria-label="Speak" data-index="${index}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          </button>
          <button class="custom-word-btn delete" aria-label="Delete" data-index="${index}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      `;

      item.querySelector('.speak').onclick = (e) => {
        e.stopPropagation();
        speak(word.h);
      };

      item.querySelector('.delete').onclick = (e) => {
        e.stopPropagation();
        currentCustomWords.splice(index, 1);
        renderCustomWordsList();
        if (window.showToast) {
          window.showToast(`Đã xóa từ "${word.h}"`, 'info');
        }
      };

      list.appendChild(item);
    });
  }

  // Lưu bộ từ vào lịch sử
  async function saveCustomDeck() {
    if (currentCustomWords.length === 0) {
      if (window.showToast) {
        window.showToast('Bộ từ đang trống! Hãy thêm từ trước khi lưu.', 'error');
      } else {
        alert('Bộ từ đang trống! Hãy thêm từ trước khi lưu.');
      }
      return;
    }

    const deckName = prompt('Đặt tên cho bộ từ này:', `Bộ từ ${customHistory.length + 1}`);
    if (!deckName) return;

    const deck = {
      id: Date.now(),
      name: deckName,
      words: [...currentCustomWords],
      createdAt: new Date().toISOString().split('T')[0],
      wordCount: currentCustomWords.length
    };

    // Save to localStorage
    customHistory.unshift(deck);
    saveCustomHistory();
    renderCustomHistory();

    // Sync to API if available
    if (API_ENABLED && window.WeiQuanAPI) {
      try {
        console.log('☁️ Syncing deck to API...');
        await window.WeiQuanAPI.createDeck(userId, deckName, currentCustomWords);
        console.log('✅ Deck synced to cloud');
        
        if (window.showToast) {
          window.showToast(`✅ Đã lưu "${deckName}" (${deck.wordCount} từ) + sync cloud`, 'success');
        }
      } catch (error) {
        console.warn('⚠️ Failed to sync to API:', error);
        if (window.showToast) {
          window.showToast(`⚠️ Đã lưu local "${deckName}" (${deck.wordCount} từ)`, 'warning');
        }
      }
    } else {
      if (window.showToast) {
        window.showToast(`Đã lưu bộ từ "${deckName}" (${deck.wordCount} từ)`, 'success');
      }
    }
  }

  // Học bộ từ hiện tại
  function studyCustomDeck() {
    if (currentCustomWords.length === 0) {
      if (window.showToast) {
        window.showToast('Bộ từ đang trống! Hãy thêm từ trước.', 'error');
      } else {
        alert('Bộ từ đang trống! Hãy thêm từ trước.');
      }
      return;
    }

    // Hiển thị modal chọn chế độ học
    showStudyModeModal('Bộ từ tự tạo', [...currentCustomWords]);
  }

  // Hiển thị modal chọn chế độ học
  function showStudyModeModal(deckName, words) {
    const modal = $('studyModeModal');
    if (!modal) return;

    modal.classList.add('active');

    // Remove old event listeners
    const options = document.querySelectorAll('.study-mode-option');
    options.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });

    // Add new event listeners
    document.querySelectorAll('.study-mode-option').forEach(btn => {
      btn.onclick = () => {
        const mode = btn.dataset.mode;
        modal.classList.remove('active');
        startStudySession(deckName, words, mode);
      };
    });
  }

  // Helper function để navigate sang Quiz và start quiz
  function navigateToQuizAndStart(deckName, words) {
    console.log('🚀 navigateToQuizAndStart START:', { deckName, wordCount: words.length });
    
    if (words.length < 2) {
      console.error('❌ Not enough words for quiz:', words.length);
      if (window.showToast) {
        window.showToast('Cần ít nhất 2 từ để làm trắc nghiệm!', 'error');
      }
      return;
    }
    
    // Đặt deck và level trước
    level = deckName;
    deck = [...words];
    fcIdx = 0;
    wIdx = 0;
    qScore = 0;
    qTotal = 0;

    console.log('📝 Set global vars:', { level, deckLength: deck.length });

    // Manually activate quiz menu item
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    console.log('🔍 Found menu items:', menuItems.length);
    menuItems.forEach(x => x.classList.remove('active'));
    const quizMenuItem = document.querySelector('.menu-item[data-section="quiz"]');
    console.log('🔍 Found quiz menu item:', !!quizMenuItem);
    if (quizMenuItem) {
      quizMenuItem.classList.add('active');
      
      // Update header
      const headerTitle = document.querySelector('.header-title');
      if (headerTitle) {
        headerTitle.textContent = '✏️ Trắc nghiệm';
      }
    }

    // Manually show selectors and activate quiz tab/panel
    const learnSelectorsWrapper = document.querySelector('.learn-selectors-wrapper');
    console.log('🔍 Found selectors wrapper:', !!learnSelectorsWrapper);
    if (learnSelectorsWrapper) learnSelectorsWrapper.style.display = 'flex';
    
    // Hide all sections
    document.querySelectorAll('.app-section').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    
    // Activate quiz tab and panel
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    const quizTab = document.querySelector('.tab[data-p="quiz"]');
    const quizPanel = document.getElementById('quiz');
    console.log('🔍 Found quiz tab:', !!quizTab, 'quiz panel:', !!quizPanel);
    if (quizTab) quizTab.classList.add('active');
    if (quizPanel) quizPanel.classList.add('active');
    
    // Update tab indicator
    if (quizTab && typeof updateTabIndicator === 'function') {
      updateTabIndicator(quizTab);
    }

    // Đợi một chút để DOM render xong, rồi gọi startQuizWithDeck
    console.log('⏳ Waiting 150ms before calling startQuizWithDeck...');
    setTimeout(() => {
      console.log('⏰ Timeout fired, checking window.startQuizWithDeck...');
      if (window.startQuizWithDeck) {
        console.log('✅ Calling window.startQuizWithDeck with', deckName, words.length, 'words');
        window.startQuizWithDeck(deckName, words);
      } else {
        console.error('❌ window.startQuizWithDeck not found!');
      }
    }, 150);
  }

  // Bắt đầu session học
  function startStudySession(deckName, words, mode) {
    console.log('📚 startStudySession called:', { deckName, wordCount: words.length, mode });
    
    level = deckName;
    deck = [...words];
    fcIdx = 0;
    wIdx = 0;
    qScore = 0;
    qTotal = 0;

    if (mode === 'flashcard') {
      // Chỉ học Flashcard
      const flashMenu = document.querySelector('.sidebar-menu .menu-item[data-section="flash"]');
      if (flashMenu) flashMenu.click();
      renderFlash();
      renderWriterList();
      renderWriter();
      
      if (window.showToast) {
        window.showToast(`📇 Bắt đầu học Flashcard - ${deck.length} từ!`, 'success');
      }
    } else if (mode === 'quiz') {
      // Chỉ học Quiz - Sử dụng hàm helper để navigate đúng cách
      console.log('🎯 Mode is QUIZ, calling navigateToQuizAndStart...');
      navigateToQuizAndStart(deckName, words);
      
      if (window.showToast) {
        window.showToast(`✏️ Bắt đầu Trắc nghiệm - ${deck.length} từ!`, 'success');
      }
    } else if (mode === 'both') {
      // Học cả hai: Flashcard trước
      const flashMenu = document.querySelector('.sidebar-menu .menu-item[data-section="flash"]');
      if (flashMenu) flashMenu.click();
      renderFlash();
      renderWriterList();
      renderWriter();
      
      // Lưu flag để chuyển sang Quiz sau khi xem hết Flashcard
      sessionStorage.setItem('wq_study_mode', 'both');
      sessionStorage.setItem('wq_study_deck', JSON.stringify({ name: deckName, words: words }));
      
      if (window.showToast) {
        window.showToast(`🎓 Bắt đầu học đầy đủ - ${deck.length} từ!\n📇 Flashcard → ✏️ Trắc nghiệm`, 'success');
      }
    }
  }

  // Kiểm tra khi đến từ cuối cùng của Flashcard trong chế độ "both"
  function checkFlashcardComplete() {
    const studyMode = sessionStorage.getItem('wq_study_mode');
    if (studyMode === 'both' && fcIdx === deck.length - 1) {
      // Đã xem hết flashcard, hiện thông báo chuyển sang Quiz
      setTimeout(() => {
        if (confirm('🎉 Bạn đã xem hết Flashcard!\n\n✏️ Bạn có muốn tiếp tục làm Trắc nghiệm không?')) {
          const deckData = JSON.parse(sessionStorage.getItem('wq_study_deck') || '{}');
          sessionStorage.removeItem('wq_study_mode');
          sessionStorage.removeItem('wq_study_deck');
          
          navigateToQuizAndStart(deckData.name || level, deckData.words);
          
          if (window.showToast) {
            window.showToast('✏️ Chuyển sang Trắc nghiệm!', 'info');
          }
        } else {
          sessionStorage.removeItem('wq_study_mode');
          sessionStorage.removeItem('wq_study_deck');
        }
      }, 500);
    }
  }

  // Render lịch sử bộ từ đã lưu
  function renderCustomHistory() {
    const list = $('customHistoryList');
    
    if (customHistory.length === 0) {
      list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Chưa có lịch sử</div>';
      return;
    }

    list.innerHTML = '';
    customHistory.forEach((deck, index) => {
      const item = document.createElement('div');
      item.className = 'custom-deck-history-item';
      item.innerHTML = `
        <div class="custom-deck-info">
          <div class="custom-deck-title">
            📚 ${deck.name}
            <span class="custom-deck-badge">${deck.wordCount} từ</span>
          </div>
          <div class="custom-deck-meta">
            <span>📅 ${deck.createdAt}</span>
          </div>
        </div>
        <div class="custom-deck-actions">
          <button class="btn" style="padding: 8px 16px; border-radius: 12px; font-size: 0.85rem;" data-action="load">
            📥 Tải lại
          </button>
          <button class="btn" style="padding: 8px 16px; border-radius: 12px; font-size: 0.85rem; background: var(--accent-gradient); color: #fff; border: none;" data-action="study">
            🎯 Học
          </button>
          <button class="custom-word-btn delete" style="width: 36px; height: 36px;" data-action="delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      `;

      item.querySelector('[data-action="load"]').onclick = (e) => {
        e.stopPropagation();
        currentCustomWords = [...deck.words];
        renderCustomWordsList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.showToast) {
          window.showToast(`Đã tải "${deck.name}" (${deck.wordCount} từ)`, 'success');
        }
      };

      item.querySelector('[data-action="study"]').onclick = (e) => {
        e.stopPropagation();
        showStudyModeModal(deck.name, [...deck.words]);
      };

      item.querySelector('[data-action="delete"]').onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Bạn có chắc muốn xóa bộ từ "${deck.name}"?`)) {
          customHistory.splice(index, 1);
          saveCustomHistory();
          renderCustomHistory();
          if (window.showToast) {
            window.showToast(`Đã xóa "${deck.name}"`, 'info');
          }
        }
      };

      list.appendChild(item);
    });
  }

  // Khởi tạo events
  function initCustomDeckEvents() {
    const searchInput = $('customSearchInput');
    const searchClearBtn = $('customSearchClearBtn');
    const suggestionsBox = $('customSearchSuggestions');
    const deselectBtn = $('deselectWordBtn');
    const addSelectedBtn = $('addSelectedWordBtn');
    const addManualBtn = $('addManualWordBtn');
    const saveBtn = $('saveCustomDeckBtn');
    const studyBtn = $('studyCustomDeckBtn');
    const studyModeModal = $('studyModeModal');
    const closeStudyModeBtn = $('closeStudyModeBtn');

    // Search autocomplete
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderCustomSearchSuggestions(e.target.value);
      });
    }

    // Clear search
    if (searchClearBtn) {
      searchClearBtn.onclick = () => {
        searchInput.value = '';
        suggestionsBox.style.display = 'none';
        searchClearBtn.style.display = 'none';
        searchInput.focus();
      };
    }

    // Click outside để đóng suggestions
    document.addEventListener('click', (e) => {
      if (suggestionsBox && !e.target.closest('#customSearchInput') && !e.target.closest('#customSearchSuggestions')) {
        suggestionsBox.style.display = 'none';
      }
    });

    // Deselect word
    if (deselectBtn) {
      deselectBtn.onclick = deselectWord;
    }

    // Add selected word
    if (addSelectedBtn) {
      addSelectedBtn.onclick = addSelectedWord;
    }

    // Add manual word
    if (addManualBtn) {
      addManualBtn.onclick = addManualWord;
    }

    if (saveBtn) {
      saveBtn.onclick = saveCustomDeck;
    }

    if (studyBtn) {
      studyBtn.onclick = studyCustomDeck;
    }

    // Close study mode modal
    if (closeStudyModeBtn && studyModeModal) {
      closeStudyModeBtn.onclick = () => {
        studyModeModal.classList.remove('active');
      };
    }

    // Click outside modal to close
    if (studyModeModal) {
      window.addEventListener('click', (e) => {
        if (e.target === studyModeModal) {
          studyModeModal.classList.remove('active');
        }
      });
    }
  }

  // Khi mở section Custom
  document.addEventListener('DOMContentLoaded', () => {
    initCustomDeckEvents();
    loadCustomHistory();
    renderCustomHistory();

    setTimeout(() => {
      const customMenuItem = document.querySelector('.menu-item[data-section="custom"]');
      if (customMenuItem) {
        customMenuItem.addEventListener('click', () => {
          loadCustomHistory();
          renderCustomWordsList();
          renderCustomHistory();
        });
      }
    }, 500);
  });

  // Export functions ra global để dùng ở nơi khác
  window.checkFlashcardComplete = checkFlashcardComplete;
})();


// ==================== QUIZ DECK SELECTION ====================
(function() {
  // Render HSK grid cho Quiz
  function renderQuizHskGrid() {
    const grid = $('quizHskGrid');
    if (!grid || typeof DATA === 'undefined') return;

    grid.innerHTML = '';
    
    const colors = [
      'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
      'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
      'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
      'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
    ];

    Object.keys(DATA).forEach((lvl, index) => {
      const words = DATA[lvl];
      const total = words.length;
      const color = colors[index % colors.length];

      const card = document.createElement('div');
      card.className = 'hsk-card';
      card.style.setProperty('--card-color', color);
      card.innerHTML = `
        <div class="hsk-card-header">
          <h4>${lvl}</h4>
          <span class="word-count">${total} từ</span>
        </div>
        <div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.9rem;">
          Làm trắc nghiệm với ${total} từ vựng
        </div>
        <button class="btn start-learn-btn" style="background: ${color}; border: none; color: #fff;">✏️ Bắt đầu Quiz</button>
      `;

      card.querySelector('.start-learn-btn').onclick = () => {
        startQuizWithDeck(lvl, words);
      };

      grid.appendChild(card);
    });
  }

  // Render custom decks cho Quiz
  function renderQuizCustomDecks() {
    const list = $('quizCustomDecksList');
    if (!list) return;

    const currentUser = window.WQAuth && window.WQAuth.getCurrentUser();
    const username = currentUser ? currentUser.username : null;
    let customDecks = [];
    
    if (username) {
      customDecks = WQStorage.getUserDataField(username, 'customDecks', '') || [];
    } else {
      customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
    }

    if (customDecks.length === 0) {
      list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">Chưa có bộ từ tự tạo. <a href="#" id="goToCustomLink" style="color: var(--accent-purple); text-decoration: underline;">Tạo ngay</a></div>';
      
      const link = $('goToCustomLink');
      if (link) {
        link.onclick = (e) => {
          e.preventDefault();
          const customMenu = document.querySelector('.menu-item[data-section="custom"]');
          if (customMenu) customMenu.click();
        };
      }
      return;
    }

    list.innerHTML = '';
    customDecks.forEach((deck) => {
      const card = document.createElement('div');
      card.className = 'hsk-card';
      card.style.setProperty('--card-color', 'var(--accent-gradient)');
      card.innerHTML = `
        <div class="hsk-card-header">
          <h4>📚 ${deck.name}</h4>
          <span class="word-count">${deck.wordCount} từ</span>
        </div>
        <div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.85rem;">
          📅 ${deck.createdAt}
        </div>
        <button class="btn start-learn-btn" style="background: var(--accent-gradient); border: none; color: #fff;">✏️ Bắt đầu Quiz</button>
      `;

      card.querySelector('.start-learn-btn').onclick = () => {
        startQuizWithDeck(deck.name, deck.words);
      };

      list.appendChild(card);
    });
  }

  // Bắt đầu quiz với deck đã chọn
  function startQuizWithDeck(deckName, words) {
    console.log('🎯 startQuizWithDeck called:', deckName, words.length, 'words');
    
    if (words.length < 2) {
      if (window.showToast) {
        window.showToast('Cần ít nhất 2 từ để làm trắc nghiệm!', 'error');
      }
      return;
    }

    level = deckName;
    deck = [...words];
    fcIdx = 0;
    wIdx = 0;
    qScore = 0;
    qTotal = 0;
    
    // Reset quiz pool và tracking
    quizPool = [];
    quizAskedWords = [];

    console.log('📊 deck set to:', deck.length, 'words');

    // Ẩn trang chọn, hiện trang quiz
    const deckSelection = $('quizDeckSelection');
    const gameSection = $('quizGameSection');
    
    if (deckSelection) deckSelection.style.display = 'none';
    if (gameSection) gameSection.style.display = 'block';

    console.log('🎮 Calling newQuiz...');
    newQuiz();

    if (window.showToast) {
      window.showToast(`✏️ Bắt đầu trắc nghiệm "${deckName}"!`, 'success');
    }
  }

  // Quay lại trang chọn deck
  function backToQuizSelection() {
    $('quizDeckSelection').style.display = 'block';
    $('quizGameSection').style.display = 'none';
    
    // Reset quiz state
    qScore = 0;
    qTotal = 0;
    $('qScore').textContent = 'Điểm: 0 / 0';
    $('qResult').textContent = '';
  }

  // Init events
  document.addEventListener('DOMContentLoaded', () => {
    const qBackBtn = $('qBackBtn');
    if (qBackBtn) {
      qBackBtn.onclick = backToQuizSelection;
    }

    // Khi click vào menu Quiz, render lại danh sách
    setTimeout(() => {
      const quizMenuItem = document.querySelector('.menu-item[data-section="quiz"]');
      if (quizMenuItem) {
        quizMenuItem.addEventListener('click', () => {
          // Hiện trang chọn deck
          $('quizDeckSelection').style.display = 'block';
          $('quizGameSection').style.display = 'none';
          
          renderQuizHskGrid();
          renderQuizCustomDecks();
        });
      }
    }, 500);

    // Render lần đầu
    renderQuizHskGrid();
    renderQuizCustomDecks();
  });

  // Export function
  window.startQuizWithDeck = startQuizWithDeck;
})();
