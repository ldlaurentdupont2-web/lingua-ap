async function callClaude(messages, system) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system })
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function saveWords(words) {
  localStorage.setItem("lingua_words", JSON.stringify(words));
}

function loadWords() {
  try {
    return JSON.parse(localStorage.getItem("lingua_words")) || [];
  } catch(e) { return []; }
}

function saveSRSData(data) {
  localStorage.setItem("lingua_srs", JSON.stringify(data));
}

function loadSRSData() {
  try {
    return JSON.parse(localStorage.getItem("lingua_srs")) || {};
  } catch(e) { return {}; }
}

function getDueWords(words, srsData) {
  const now = Date.now();
  return words.filter(w => {
    const d = srsData[w.id];
    if (!d) return true;
    return now >= d.nextReview;
  });
}

function updateSRS(wordId, result, srsData) {
  const d = srsData[wordId] || { interval: 1, ease: 2.5, reps: 0 };
  const now = Date.now();
  const day = 86400000;

  if (result === "easy") {
    d.reps++;
    d.interval = d.reps === 1 ? 1 : d.reps === 2 ? 3 : Math.round(d.interval * d.ease);
    d.ease = Math.min(d.ease + 0.1, 3.0);
  } else if (result === "good") {
    d.reps++;
    d.interval = d.reps === 1 ? 1 : Math.round(d.interval * d.ease);
  } else if (result === "hard") {
    d.interval = Math.max(1, Math.round(d.interval * 0.8));
    d.ease = Math.max(1.3, d.ease - 0.15);
  } else {
    d.reps = 0;
    d.interval = 0.02;
    d.ease = Math.max(1.3, d.ease - 0.2);
  }
  d.nextReview = now + d.interval * day;
  srsData[wordId] = d;
  return srsData;
}

const JOURNALS = [
  { name: "BBC News", url: "https://www.bbc.com/news", cat: "World" },
  { name: "BBC Science", url: "https://www.bbc.com/news/science_and_environment", cat: "Science" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world", cat: "World" },
  { name: "The Guardian Science", url: "https://www.theguardian.com/science", cat: "Science" },
  { name: "The Guardian Sport", url: "https://www.theguardian.com/sport", cat: "Sport" },
  { name: "NPR News", url: "https://www.npr.org/sections/news/", cat: "World" },
  { name: "Scientific American", url: "https://www.scientificamerican.com", cat: "Science" },
  { name: "BBC Sport", url: "https://www.bbc.com/sport", cat: "Sport" },
];

const GRAMMAR_TOPICS = [
  "Present Perfect vs Simple Past",
  "Conditionals: 0, 1, 2 and 3",
  "Passive Voice",
  "Reported Speech",
  "Modal Verbs: must, should, might",
  "Articles: a, an, the",
  "Relative Clauses",
  "Future: will vs going to"
];

let state = {
  tab: "read",
  words: loadWords(),
  srsData: loadSRSData(),
  chatMessages: [],
  chatContext: "",
  grammarHistory: [],
  currentLesson: "",
  currentLessonTopic: "",
  quizWord: null,
  quizPhase: "show",
  quizResult: null,
  podcastContext: "",
  busy: false,
  listening: false,
  catFilter: "All"
};

function render() {
  const app = document.getElementById("root");
  app.innerHTML = "";
  app.appendChild(buildHeader());
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  if (state.tab === "read") wrap.appendChild(buildRead());
  if (state.tab === "vocab") wrap.appendChild(buildVocab());
  if (state.tab === "chat") wrap.appendChild(buildChat());
  if (state.tab === "grammar") wrap.appendChild(buildGrammar());
  app.appendChild(wrap);
}

function buildHeader() {
  const hdr = el("div", "hdr");
  const logo = el("div");
  logo.innerHTML = '<div class="logo">Lingua</div><div class="logo-sub">English B2 Coach</div>';
  const tabs = el("div", "tabs");
  [["read","📰"],["vocab","📚"],["chat","💬"],["grammar","✏️"]].forEach(([id, icon]) => {
    const btn = el("button", "tab " + (state.tab === id ? "on" : "off"));
    btn.textContent = icon;
    btn.title = id;
    btn.onclick = () => { state.tab = id; render(); };
    tabs.appendChild(btn);
  });
  const due = getDueWords(state.words, state.srsData).length;
  const badge = el("div", "badge-wrap");
  badge.innerHTML = '<div class="badge-num">' + due + '</div><div class="badge-lbl">due</div>';
  hdr.appendChild(logo);
  hdr.appendChild(tabs);
  hdr.appendChild(badge);
  return hdr;
}

function buildRead() {
  const div = el("div");
  div.innerHTML = '<h1>Read in English</h1><p class="sub">Open an article, then come back to translate words and discuss</p>';

  const cats = ["All", "World", "Science", "Sport"];
  const filterRow = el("div", "pill-row");
  cats.forEach(c => {
    const btn = el("button", "pill " + (state.catFilter === c ? "on" : "off"));
    btn.textContent = c;
    btn.onclick = () => { state.catFilter = c; render(); };
    filterRow.appendChild(btn);
  });
  div.appendChild(filterRow);

  const filtered = JOURNALS.filter(j => state.catFilter === "All" || j.cat === state.catFilter);
  filtered.forEach(j => {
    const card = el("div", "card journal-card");
    const cat = el("span", "cat-badge"); cat.textContent = j.cat;
    const name = el("div", "journal-name"); name.textContent = j.name;
    const link = el("a", "journal-link");
    link.textContent = "Open article →";
    link.href = j.url;
    link.target = "_blank";
    card.appendChild(cat);
    card.appendChild(name);
    card.appendChild(link);
    div.appendChild(card);
  });

  div.appendChild(el("div", "divider"));

  const transBox = el("div", "trans-box");
  transBox.innerHTML = '<div class="trans-label">🔍 Translate a word from your article</div>';
  const row = el("div", "input-row");
  const inp = el("input", "inp");
  inp.placeholder = "Paste or type a word...";
  inp.id = "trans-input";
  const btn = el("button", "btn blue");
  btn.textContent = "Translate";
  btn.onclick = () => translateWord();
  row.appendChild(inp);
  row.appendChild(btn);
  transBox.appendChild(row);
  const result = el("div", "trans-result"); result.id = "trans-result";
  transBox.appendChild(result);
  div.appendChild(transBox);

  const podBox = el("div", "pod-box");
  podBox.innerHTML = '<div class="trans-label">🎧 Podcast or article to discuss</div>';
  const podRow = el("div", "input-row");
  const podInp = el("input", "inp");
  podInp.placeholder = "Paste title, link or topic...";
  podInp.value = state.podcastContext;
  podInp.id = "pod-input";
  const podBtn = el("button", "btn blue");
  podBtn.textContent = "Discuss →";
  podBtn.onclick = () => {
    const val = document.getElementById("pod-input").value.trim();
    if (!val) return;
    state.podcastContext = val;
    state.chatContext = "We are going to discuss this content: " + val + ". Ask me about my opinion and understanding.";
    state.chatMessages = [{ role: "assistant", content: "Great! Let's talk about: \"" + val + "\"\n\nWhat did you think about it? What was the main idea you got from it?" }];
    state.tab = "chat";
    render();
  };
  podRow.appendChild(podInp);
  podRow.appendChild(podBtn);
  podBox.appendChild(podRow);
  div.appendChild(podBox);

  return div;
}

async function translateWord() {
  const inp = document.getElementById("trans-input");
  const word = inp.value.trim();
  if (!word) return;
  const result = document.getElementById("trans-result");
  result.textContent = "Translating...";
  const text = await callClaude(
    [{ role: "user", content: "English word or phrase: \"" + word + "\"\nFrench: [translation]\nMeaning: [short English definition]\nExample: [1 natural example sentence]" }],
    "You are a concise English-French dictionary for B2 learners."
  );
  result.innerHTML = '<div class="trans-text">' + text.replace(/\n/g, "<br>") + '</div>' +
    '<button class="btn green sm" onclick="saveFromTranslate(\'' + word.replace(/'/g,"") + '\', this)">+ Save to vocabulary</button>';
}

function saveFromTranslate(word, btn) {
  const resultDiv = btn.previousSibling;
  const translation = resultDiv ? resultDiv.innerText : "";
  const w = {
    id: Date.now(),
    word: word,
    translation: translation,
    date: new Date().toLocaleDateString("fr-FR")
  };
  state.words = [w, ...state.words.filter(x => x.word.toLowerCase() !== word.toLowerCase())];
  saveWords(state.words);
  btn.textContent = "✅ Saved!";
  btn.disabled = true;
}

function buildVocab() {
  const div = el("div");
  const due = getDueWords(state.words, state.srsData);
  div.innerHTML = '<h1>Vocabulary</h1><p class="sub">' + state.words.length + ' words · ' + due.length + ' to review today</p>';

  const addRow = el("div", "input-row");
  const inp = el("input", "inp");
  inp.placeholder = "Add a word manually...";
  inp.id = "add-word-inp";
  inp.onkeydown = (e) => { if (e.key === "Enter") addWordManual(); };
  const btn = el("button", "btn blue");
  btn.textContent = "+ Add";
  btn.onclick = addWordManual;
  addRow.appendChild(inp);
  addRow.appendChild(btn);
  div.appendChild(addRow);

  if (state.quizWord) {
    div.appendChild(buildQuizCard());
    return div;
  }

  if (due.length > 0) {
    const practiceBtn = el("button", "btn blue full");
    practiceBtn.textContent = "🎯 Practice " + due.length + " words due today";
    practiceBtn.onclick = () => {
      state.quizWord = due[Math.floor(Math.random() * due.length)];
      state.quizPhase = "show";
      state.quizResult = null;
      render();
    };
    div.appendChild(practiceBtn);
  }

  if (state.words.length === 0) {
    const empty = el("div", "empty");
    empty.innerHTML = '<div class="empty-icon">📖</div><div>Save words from articles or add manually</div>';
    div.appendChild(empty);
  }

  state.words.forEach(w => {
    const row = el("div", "word-row");
    const info = el("div", "word-info");
    info.innerHTML = '<div class="word-name">' + w.word + '</div>' +
      '<div class="word-trans">' + (w.translation || "").split("\n")[0].slice(0, 80) + '</div>' +
      '<div class="word-meta">' + w.date + srsInfo(w.id) + '</div>';
    const del = el("button", "del-btn");
    del.textContent = "×";
    del.onclick = () => {
      state.words = state.words.filter(x => x.id !== w.id);
      saveWords(state.words);
      render();
    };
    row.appendChild(info);
    row.appendChild(del);
    div.appendChild(row);
  });

  return div;
}

function srsInfo(id) {
  const d = state.srsData[id];
  if (!d) return "";
  const due = d.nextReview <= Date.now() ? " · <span style='color:#dc2626'>due now</span>" : " · next in " + Math.ceil((d.nextReview - Date.now()) / 86400000) + "d";
  return due;
}

function buildQuizCard() {
  const w = state.quizWord;
  const card = el("div", "quiz-card");

  if (state.quizPhase === "show") {
    const fr = w.translation ? w.translation.split("\n")[0].replace("French:", "").trim() : w.word;
    card.innerHTML = '<div class="quiz-label">How do you say this in English?</div>' +
      '<div class="quiz-french">' + fr + '</div>' +
      '<div class="quiz-example-fr">' + (w.translation ? (w.translation.split("\n")[2] || "") : "") + '</div>';

    const inp = el("input", "inp");
    inp.placeholder = "Type in English...";
    inp.id = "quiz-inp";
    inp.style.marginTop = "14px";
    card.appendChild(inp);

    const micRow = el("div", "mic-row");
    const micBtn = el("button", "mic-btn");
    micBtn.textContent = "🎤";
    micBtn.title = "Speak your answer";
    micBtn.onclick = () => startMicForQuiz();
    micRow.appendChild(micBtn);
    const checkBtn = el("button", "btn blue");
    checkBtn.textContent = "Check →";
    checkBtn.onclick = () => checkQuizAnswer();
    micRow.appendChild(checkBtn);
    card.appendChild(micRow);

  } else {
    const res = state.quizResult;
    card.innerHTML = '<div class="quiz-label">Result</div>' +
      '<div class="quiz-french">' + w.word + '</div>' +
      '<div class="quiz-translation">' + (w.translation || "") + '</div>' +
      '<div class="quiz-feedback ' + (res.ok ? "ok" : "wrong") + '">' + res.feedback + '</div>';

    const btns = el("div", "srs-btns");
    [["again","❌ Again"],["hard","😕 Hard"],["good","✅ Good"],["easy","🌟 Easy"]].forEach(([val, label]) => {
      const b = el("button", "btn srs-btn");
      b.textContent = label;
      b.onclick = () => {
        state.srsData = updateSRS(w.id, val, state.srsData);
        saveSRSData(state.srsData);
        const due = getDueWords(state.words, state.srsData);
        if (due.length > 0) {
          state.quizWord = due[Math.floor(Math.random() * due.length)];
          state.quizPhase = "show";
          state.quizResult = null;
        } else {
          state.quizWord = null;
        }
        render();
      };
      btns.appendChild(b);
    });
    card.appendChild(btns);
  }

  const skipBtn = el("button", "btn gray sm");
  skipBtn.textContent = "Stop practice";
  skipBtn.style.marginTop = "12px";
  skipBtn.onclick = () => { state.quizWord = null; render(); };
  card.appendChild(skipBtn);
  return card;
}

async function checkQuizAnswer() {
  const inp = document.getElementById("quiz-inp");
  const answer = inp ? inp.value.trim() : "";
  if (!answer) return;
  const w = state.quizWord;
  const text = await callClaude(
    [{ role: "user", content: 'The correct English word is "' + w.word + '". The learner answered: "' + answer + '". Is it correct or close enough? Reply with OK or WRONG, then one short sentence of feedback in English.' }],
    "You evaluate vocabulary quiz answers for a B2 French learner. Be encouraging."
  );
  const ok = text.toLowerCase().startsWith("ok");
  state.quizResult = { ok, feedback: text };
  state.quizPhase = "result";
  render();
}

function startMicForQuiz() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Microphone not available. Please type your answer."); return; }
  const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false;
  rec.onresult = (e) => {
    const inp = document.getElementById("quiz-inp");
    if (inp) inp.value = e.results[0][0].transcript;
  };
  rec.onerror = () => {};
  rec.start();
}

async function addWordManual() {
  const inp = document.getElementById("add-word-inp");
  const word = inp.value.trim();
  if (!word) return;
  inp.value = "";
  inp.disabled = true;
  const text = await callClaude(
    [{ role: "user", content: 'English word: "' + word + '"\nFrench: [translation]\nMeaning: [short English definition]\nExample: [1 example sentence]' }],
    "Concise English-French dictionary for B2 learners."
  );
  const w = { id: Date.now(), word, translation: text, date: new Date().toLocaleDateString("fr-FR") };
  state.words = [w, ...state.words.filter(x => x.word.toLowerCase() !== word.toLowerCase())];
  saveWords(state.words);
  inp.disabled = false;
  render();
}

function buildChat() {
  const div = el("div");
  div.innerHTML = '<h1>Conversation</h1><p class="sub">' + (state.chatContext ? state.chatContext.slice(0, 60) + "..." : "Free English practice") + '</p>';

  if (state.chatMessages.length === 0) {
    const welcome = el("div", "welcome-box");
    welcome.innerHTML = '<div style="font-size:36px;margin-bottom:10px">🗣️</div><div>Speak or write in English. Your tutor corrects gently and keeps the conversation going!</div>';
    div.appendChild(welcome);
    ["Tell me about something you read recently", "What do you think about AI?", "Describe your perfect weekend", "What's a topic you find fascinating?"].forEach(s => {
      const btn = el("button", "starter-btn");
      btn.textContent = '"' + s + '"';
      btn.onclick = () => {
        state.chatMessages = [];
        document.getElementById("chat-inp") && (document.getElementById("chat-inp").value = s);
        sendChat(s);
      };
      div.appendChild(btn);
    });
  }

  const chatWrap = el("div", "chat-wrap");
  chatWrap.id = "chat-wrap";
  state.chatMessages.forEach(m => {
    const row = el("div", "msg-row " + (m.role === "user" ? "user" : "bot"));
    const bubble = el("div", m.role === "user" ? "msg-user" : "msg-bot");
    bubble.textContent = m.content;
    row.appendChild(bubble);
    if (m.role === "assistant") {
      const spk = el("button", "speak-btn");
      spk.textContent = "🔊";
      spk.onclick = () => speakText(m.content);
      row.appendChild(spk);
    }
    chatWrap.appendChild(row);
  });
  if (state.busy) {
    const typing = el("div", "msg-bot typing");
    typing.textContent = "...";
    chatWrap.appendChild(typing);
  }
  div.appendChild(chatWrap);

  const inputRow = el("div", "chat-input-row");
  const micBtn = el("button", "mic-btn" + (state.listening ? " rec" : ""));
  micBtn.textContent = state.listening ? "🔴" : "🎤";
  micBtn.onclick = startMic;
  const inp = el("input", "inp");
  inp.id = "chat-inp";
  inp.placeholder = "Write or speak in English...";
  inp.onkeydown = (e) => { if (e.key === "Enter") sendChatFromInput(); };
  const sendBtn = el("button", "btn blue");
  sendBtn.textContent = "Send";
  sendBtn.disabled = state.busy;
  sendBtn.onclick = sendChatFromInput;
  inputRow.appendChild(micBtn);
  inputRow.appendChild(inp);
  inputRow.appendChild(sendBtn);
  div.appendChild(inputRow);

  if (state.chatMessages.length > 0) {
    const newBtn = el("button", "btn gray sm");
    newBtn.textContent = "New conversation";
    newBtn.style.marginTop = "8px";
    newBtn.onclick = () => { state.chatMessages = []; state.chatContext = ""; state.podcastContext = ""; render(); };
    div.appendChild(newBtn);
  }

  setTimeout(() => {
    const cw = document.getElementById("chat-wrap");
    if (cw) cw.scrollTop = cw.scrollHeight;
  }, 50);

  return div;
}

function sendChatFromInput() {
  const inp = document.getElementById("chat-inp");
  if (!inp) return;
  sendChat(inp.value.trim());
  inp.value = "";
}

async function sendChat(text) {
  if (!text || state.busy) return;
  state.chatMessages.push({ role: "user", content: text });
  state.busy = true;
  render();

  const sys = "You are a warm English conversation tutor for a B2 French speaker." +
    (state.chatContext ? " Context: " + state.chatContext : "") +
    " Use natural conversational English. Keep sentences clear and varied. " +
    "Gently note grammar errors with [correction: ...] at the end of your reply. " +
    "Always end with a follow-up question to keep the conversation going. " +
    "Track grammar mistakes and if you notice a recurring pattern, suggest briefly that a grammar lesson on that topic would help.";

  const reply = await callClaude(state.chatMessages.map(m => ({ role: m.role, content: m.content })), sys);
  state.chatMessages.push({ role: "assistant", content: reply });
  state.busy = false;

  extractGrammarPattern(reply);
  render();
}

function extractGrammarPattern(reply) {
  const patterns = ["present perfect", "conditional", "passive", "reported speech", "modal", "article", "relative clause", "future"];
  patterns.forEach(p => {
    if (reply.toLowerCase().includes(p) && !state.grammarHistory.includes(p)) {
      state.grammarHistory.push(p);
    }
  });
}

function buildGrammar() {
  const div = el("div");
  div.innerHTML = '<h1>Grammar</h1><p class="sub">Lessons adapted to your conversations</p>';

  if (state.grammarHistory.length > 0) {
    const suggest = el("div", "suggest-box");
    const topic = state.grammarHistory[state.grammarHistory.length - 1];
    suggest.innerHTML = '<div class="suggest-label">💡 Suggested from your conversations</div>' +
      '<div class="suggest-topic">' + topic + '</div>';
    const btn = el("button", "btn blue sm");
    btn.textContent = "Learn this now →";
    btn.onclick = () => loadLesson(topic);
    suggest.appendChild(btn);
    div.appendChild(suggest);
  }

  if (state.currentLesson) {
    const lessonDiv = el("div", "lesson-box");
    lessonDiv.innerHTML = '<div class="lesson-topic">' + state.currentLessonTopic + '</div>' +
      formatLesson(state.currentLesson);
    const backBtn = el("button", "btn gray sm");
    backBtn.textContent = "← All topics";
    backBtn.onclick = () => { state.currentLesson = ""; render(); };
    lessonDiv.insertBefore(backBtn, lessonDiv.firstChild);
    div.appendChild(lessonDiv);
    return div;
  }

  const grid = el("div", "gram-grid");
  GRAMMAR_TOPICS.forEach(t => {
    const card = el("div", "gram-card");
    card.innerHTML = '<div class="gram-title">' + t + '</div><div class="gram-arrow">Study →</div>';
    card.onclick = () => loadLesson(t);
    grid.appendChild(card);
  });
  div.appendChild(grid);
  return div;
}

async function loadLesson(topic) {
  state.currentLessonTopic = topic;
  state.currentLesson = "Loading...";
  render();
  const text = await callClaude(
    [{ role: "user", content: 'Teach "' + topic + '" to a B2 French speaker.\n\n## What it is\n[2-sentence explanation]\n\n## Key rules\n- rule 1\n- rule 2\n- rule 3\n\n## Examples (with French)\n[4 examples: English — (French)]\n\n## Quick exercise\n[fill-in-blank sentence]\nAnswer: [answer]' }],
    "Expert English grammar teacher for B2 French speakers. Be clear, practical, encouraging."
  );
  state.currentLesson = text;
  render();
}

function formatLesson(text) {
  return text.split("\n").map(line => {
    if (line.startsWith("## ")) return '<div class="lesson-h2">' + line.slice(3) + '</div>';
    if (line.startsWith("- ") || line.startsWith("* ")) return '<div class="lesson-bullet">• ' + line.slice(2) + '</div>';
    if (line.toLowerCase().startsWith("answer:")) return '<div class="lesson-answer">' + line + '</div>';
    if (!line.trim()) return '<div style="height:6px"></div>';
    return '<div class="lesson-line">' + line + '</div>';
  }).join("");
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "en-GB"; utt.rate = 0.88;
  const go = () => {
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang === "en-GB") || voices.find(v => v.lang.startsWith("en"));
    if (v) utt.voice = v;
    window.speechSynthesis.speak(utt);
  };
  window.speechSynthesis.getVoices().length ? go() : (window.speechSynthesis.onvoiceschanged = go, setTimeout(go, 400));
}

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Microphone not available. Please type your message."); return; }
  const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false;
  state.listening = true; render();
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    state.listening = false;
    sendChat(text);
  };
  rec.onerror = () => { state.listening = false; render(); };
  rec.onend = () => { state.listening = false; render(); };
  rec.start();
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

render();
