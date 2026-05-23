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
  { name: "Th
