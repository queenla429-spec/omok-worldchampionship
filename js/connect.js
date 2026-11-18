/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const $ = (s, r = document) => r.querySelector(s);

  function parseFirebaseConfig(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('코드를 붙여넣어 주세요.');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('{ ... } 형태의 설정 코드를 찾을 수 없습니다.');
    let jsonLike = m[0]
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/([{,]\s*)([A-Za-z0-9_$]+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1');
    let obj;
    try { obj = JSON.parse(jsonLike); }
    catch { throw new Error('코드 형식을 읽지 못했습니다. const firebaseConfig = { ... }; 부분을 통째로 복사했는지 확인하세요.'); }
    if (!obj.apiKey || !obj.databaseURL) {
      throw new Error('apiKey 또는 databaseURL이 빠져 있습니다. Realtime Database를 먼저 만든 뒤 구성 코드를 다시 복사하세요.');
    }
    return obj;
  }

  function encodeConfig(cfg) {
    const str = unescape(encodeURIComponent(JSON.stringify(cfg)));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function saveAndReload(cfg) {
    localStorage.setItem('omokFirebaseConfig', JSON.stringify(cfg));
    localStorage.removeItem('omokDemoMode');
    location.reload();
  }

  const DB_RULES = JSON.stringify({
    rules: {
      config: {
        master: { ".read": true, ".write": "!data.exists()" },
        masterName: { ".read": "auth != null", ".write": "auth != null && root.child('config/master').val() === auth.uid" },
        joinCode: { ".read": "auth != null", ".write": "auth != null && root.child('config/master').val() === auth.uid" }
      },
      classList: { ".read": true, ".write": "auth != null" },
      members: { "$uid": { ".read": "auth != null", ".write": "auth != null" } },
      classes: {
        "$cid": {
          pub: { ".read": true, ".write": "auth != null" },
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }, null, 2);

  const SLIDES = [
    {
      chip: '1. 프로젝트',
      title: '1단계: Firebase 프로젝트 만들기',
      body: `<ol>
        <li><a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Firebase 콘솔</a>에 구글 계정으로 로그인합니다.</li>
        <li><span class="cn-red">프로젝트 만들기</span>(또는 프로젝트 추가)를 누르고 이름(예: <code>omok-arena</code>)을 입력한 뒤 계속 진행해 만듭니다.</li>
      </ol>`
    },
    {
      chip: '2. 로그인 기능',
      title: '2단계: 이메일/비밀번호 로그인 켜기',
      body: `<ol>
        <li>왼쪽 메뉴에서 <span class="cn-red">빌드 → Authentication</span>을 누르고 <b>시작하기</b>를 클릭합니다.</li>
        <li>로그인 제공업체 목록에서 <span class="cn-red">이메일/비밀번호</span>를 선택하고, 맨 위 <b>사용 설정</b> 스위치를 켠 뒤 <b>저장</b>합니다.</li>
      </ol>`
    },
    {
      chip: '3. 데이터베이스',
      title: '3단계: Realtime Database 만들기 & 규칙 붙여넣기',
      body: `<ol>
        <li>왼쪽 메뉴에서 <span class="cn-red">빌드 → Realtime Database</span>를 누르고 <b>데이터베이스 만들기</b>를 클릭합니다.</li>
        <li>위치는 기본값(또는 싱가포르)으로 두고, 보안 규칙은 <b>잠금 모드</b>로 시작합니다.</li>
        <li>상단 <span class="cn-red">규칙(Rules)</span> 탭을 눌러 기존 내용을 지우고 아래 규칙을 붙여넣은 뒤 <b>게시</b>를 누릅니다.</li>
      </ol>
      <div class="cn-rules" id="cn-rules-box">${DB_RULES}</div>
      <button class="btn sm" type="button" id="cn-copy-rules">규칙 복사하기</button>`
    },
    {
      chip: '4. 연결 코드',
      title: '4단계: 웹 앱 등록 후 연결 코드 붙여넣기',
      body: `<ol>
        <li>왼쪽 위 톱니바퀴 <span class="cn-red">프로젝트 설정 → 일반</span>으로 이동합니다.</li>
        <li>아래쪽 「내 앱」에서 <span class="cn-red">&lt;/&gt; (웹)</span> 아이콘을 누르고 앱 닉네임(예: <code>omok</code>)을 적은 뒤 <b>앱 등록</b>을 누릅니다.</li>
        <li>화면에 나오는 <code>const firebaseConfig = { ... };</code> 코드를 복사해 아래 칸에 붙여넣으세요.</li>
      </ol>
      <textarea id="cn-config" rows="6" spellcheck="false" placeholder="const firebaseConfig = {\n  apiKey: &quot;...&quot;,\n  databaseURL: &quot;...&quot;,\n  ...\n};"></textarea>
      <button class="btn primary lg" type="button" id="cn-connect-go" style="margin-top:10px">연결하고 시작하기</button>
      <p class="err" id="cn-err"></p>`
    }
  ];

  let slideIdx = 0;
  function renderGuide() {
    const chips = $('#cn-chips'), track = $('#cn-track'), count = $('#cn-count');
    if (!chips || !track) return;
    chips.innerHTML = SLIDES.map((s, i) => `<button type="button" data-si="${i}" class="${i === slideIdx ? 'on' : ''}">${s.chip}</button>`).join('');
    const cur = SLIDES[slideIdx];
    track.innerHTML = `<div class="cn-slide"><h4>${cur.title}</h4>${cur.body}</div>`;
    count.textContent = `${slideIdx + 1} / ${SLIDES.length}`;
    $('#cn-prev').disabled = slideIdx === 0;
    $('#cn-next').disabled = slideIdx === SLIDES.length - 1;

    const copyBtn = $('#cn-copy-rules');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(DB_RULES);
        copyBtn.textContent = '복사 완료!';
        setTimeout(() => { copyBtn.textContent = '규칙 복사하기'; }, 1500);
      };
    }
    const goBtn = $('#cn-connect-go');
    if (goBtn) {
      goBtn.onclick = () => {
        try {
          const cfg = parseFirebaseConfig($('#cn-config').value);
          saveAndReload(cfg);
        } catch (err) {
          $('#cn-err').textContent = err.message;
        }
      };
    }
  }

  function showConnectView(view) {
    $('#cn-home').classList.toggle('hidden', view !== 'home');
    $('#cn-guide').classList.toggle('hidden', view !== 'guide');
    $('#cn-relink').classList.toggle('hidden', view !== 'relink');
    $('.connect-card').classList.toggle('wide', view === 'guide');
    if (view === 'guide') renderGuide();
  }

  window.addEventListener('DOMContentLoaded', () => {
    $('#cn-start')?.addEventListener('click', () => { slideIdx = 0; showConnectView('guide'); });
    $('#cn-again')?.addEventListener('click', () => showConnectView('relink'));
    $('#cn-back')?.addEventListener('click', () => showConnectView('home'));
    $('#cn-again-back')?.addEventListener('click', () => showConnectView('home'));
    $('#cn-prev')?.addEventListener('click', () => { if (slideIdx > 0) { slideIdx--; renderGuide(); } });
    $('#cn-next')?.addEventListener('click', () => { if (slideIdx < SLIDES.length - 1) { slideIdx++; renderGuide(); } });
    $('#cn-chips')?.addEventListener('click', e => {
      const b = e.target.closest('[data-si]');
      if (b) { slideIdx = Number(b.dataset.si); renderGuide(); }
    });

    $('#cn-again-form')?.addEventListener('submit', e => {
      e.preventDefault();
      try {
        const cfg = parseFirebaseConfig($('#cn-again-config').value);
        saveAndReload(cfg);
      } catch (err) {
        $('#cn-again-err').textContent = err.message;
      }
    });

    $('#cn-link-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const val = $('#cn-link').value.trim();
      const m = val.match(/[#&]fb=([^&]+)/);
      if (!m) { $('#cn-link-err').textContent = '접속 링크에 연결 정보(#fb=...)가 없습니다.'; return; }
      try {
        const b64 = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
        const cfg = JSON.parse(decodeURIComponent(escape(atob(b64))));
        if (!cfg.apiKey || !cfg.databaseURL) throw new Error();
        saveAndReload(cfg);
      } catch {
        $('#cn-link-err').textContent = '올바른 접속 링크가 아닙니다.';
      }
    });

    $('#cn-demo')?.addEventListener('click', () => {
      localStorage.setItem('omokDemoMode', '1');
      location.reload();
    });

    $('#demo-exit')?.addEventListener('click', () => {
      localStorage.removeItem('omokDemoMode');
      location.reload();
    });

    $('#relink')?.addEventListener('click', () => {
      window.App.show('connect');
      showConnectView('relink');
    });

    $('#forgot-master')?.addEventListener('click', () => {
      window.App.modal(`<h3>master 비밀번호 재설정</h3>
        <div class="forgot-box">
          <ol class="forgot-steps">
            <li><a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Firebase 콘솔</a> → <b>Authentication → Users</b>로 이동합니다.</li>
            <li><code>master@omok.example.com</code> 계정을 찾아 오른쪽 점 3개 메뉴에서 <b>계정 삭제</b>를 누릅니다.</li>
            <li><b>Realtime Database</b>에서 <code>config/master</code> 항목을 삭제한 뒤 이 페이지를 새로고침하면 처음 설정 화면이 다시 열립니다.</li>
          </ol>
        </div>
        <div class="foot"><button class="btn primary" data-close>확인</button></div>`);
    });
  });

  window.OmokShare = function(cid, cname) {
    const cfg = window.OMOK_FB_CONFIG;
    const base = location.origin + location.pathname;
    const url = cfg
      ? `${base}?c=${encodeURIComponent(cid)}#fb=${encodeConfig(cfg)}`
      : `${base}?c=${encodeURIComponent(cid)}`;

    const qrImg = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}" alt="QR Code" style="width:200px;height:200px;display:block">`;
    const m = window.App.modal(`<h3>학생 접속 링크 · QR (${window.App.esc(cname || cid)})</h3>
      <p class="muted" style="margin-top:0;font-size:.9em">학생 태블릿·크롬북으로 아래 QR 코드를 찍거나 접속 링크를 공유하세요. 반 코드(<b>${window.App.esc(cid)}</b>)와 서버 연결 정보가 함께 들어 있습니다.</p>
      <div class="share-qr">${qrImg}</div>
      <label>접속 링크<textarea id="sh-link" rows="3" readonly>${window.App.esc(url)}</textarea></label>
      <div class="foot">
        <button class="btn ghost" data-close>닫기</button>
        <button class="btn primary" id="sh-copy">링크 복사</button>
      </div>`);
    m.el.querySelector('#sh-copy').onclick = async () => {
      await navigator.clipboard.writeText(url);
      window.App.toast('접속 링크를 복사했어요.', 'good');
    };
  };
})();
