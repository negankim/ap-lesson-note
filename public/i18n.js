/* 화면 번역: 화면에 보이는 한국어 문장을 고른 언어의 문장으로 바꾼다.
   - 문장표: i18n/{lang}.json  { t: {한국어: 번역}, p: [[틀, 번역틀]] }  ({0} 자리에는 숫자·이름이 들어간다)
   - 문장표는 tools/i18n_extract.py 로 뽑은 원문(i18n/source.json)을 옮긴 것이다.
   - 입력값(textarea·input 값)과 data-noi18n 안은 건드리지 않는다. 사용자가 쓴 글·AI 결과는 문장표에 없으므로 그대로 보인다.
   - 언어: localStorage ap-lang → 브라우저 언어 → 한국어 */
(function () {
  var SUP = ["en", "ja", "zh", "ms", "id"];
  var L = null;
  try { L = localStorage.getItem("ap-lang"); } catch (e) {}
  if (!L) L = (navigator.language || "ko").slice(0, 2).toLowerCase();
  if (SUP.indexOf(L) < 0) L = "ko";
  window.AP_LANG = L;
  var HTML_LANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-CN", ms: "ms", id: "id" };
  document.documentElement.lang = HTML_LANG[L];
  window.APT = function (s) { return s; };
  if (L === "ko") return;

  var root = document.documentElement;
  root.classList.add("i18n-wait");
  var reveal = function () { root.classList.remove("i18n-wait"); };
  setTimeout(reveal, 2500);

  var map = {}, pats = [];
  var norm = function (s) { return s.replace(/\s+/g, " ").trim(); };
  var KO = /[가-힣]/;
  function fill(tpl, vals) { return tpl.replace(/\{(\d+)\}/g, function (_, i) { var v = vals[+i]; return v == null ? "" : (v.trim().length > 1 ? T(v) : v); }); }
  function T(s) {
    if (s == null) return s;
    s = String(s);
    if (!KO.test(s)) return s;
    var k = norm(s);
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    if (map[k] != null) return lead + map[k] + trail;
    for (var i = 0; i < pats.length; i++) {
      var m = pats[i][0].exec(k);
      /* 한국어 글자가 적은 짧은 틀({0}명 등)은 자리에 숫자·기호만 들어올 때만 쓴다(사용자 글 오역 방지) */
      if (m && (!pats[i][2] || !m.slice(1).some(function (g) { return KO.test(g) && T(g) === g; }))) return lead + fill(pats[i][1], m.slice(1)) + trail;
    }
    /* "A · B" 처럼 이어 붙인 문장은 조각마다 옮긴다 */
    if (k.indexOf(" · ") > 0) {
      var parts = k.split(" · "), out = parts.map(T), changed = false;
      for (var j = 0; j < parts.length; j++) if (out[j] !== parts[j]) changed = true;
      if (changed) return lead + out.join(" · ") + trail;
    }
    return s;
  }
  window.APT = T;

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.hasAttribute("data-noi18n") || e.isContentEditable) return true;
    }
    return false;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || !KO.test(v) || skipEl(n.parentNode)) return;
    var t = T(v);
    if (t !== v) n.nodeValue = t;
  }
  function doEl(el) {
    if (skipEl(el)) return;
    if (el.tagName === "OPTION" && !el.hasAttribute("value")) el.setAttribute("value", el.textContent);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute(ATTRS[i]);
      if (a && KO.test(a)) { var t = T(a); if (t !== a) el.setAttribute(ATTRS[i], t); }
    }
  }
  function walk(node) {
    if (node.nodeType === 3) return doText(node);
    if (node.nodeType !== 1) return;
    doEl(node);
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var x;
    while ((x = w.nextNode())) { if (x.nodeType === 3) doText(x); else doEl(x); }
  }
  function start() {
    if (document.title) document.title = T(document.title);
    walk(document.body);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doEl(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var c = window.confirm;
    window.confirm = function (s) { return c.call(window, T(s)); };
    reveal();
  }
  var esc = function (s) { return s.replace(/[.*+?^$()|[\]\\]/g, "\\$&"); };
  fetch("i18n/" + L + ".json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (d) {
      map = d.t || {};
      pats = (d.p || []).map(function (x) {
        var re = "^" + esc(x[0]).replace(/\{(\d+)\}/g, "(.*?)") + "$";
        var lit = (x[0].replace(/\{\d+\}/g, "").match(/[가-힣○]/g) || []).length;
        return [new RegExp(re), x[1], lit < 3];
      });
    }
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  }).catch(reveal);
})();
