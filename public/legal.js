/* 약관·방침 언어 바꾸기: privacy.html(한국어), privacy.en.html … */
(function(){
  var L=[["ko","한국어"],["en","English"],["ja","日本語"],["zh","简体中文"],["ms","Melayu"],["id","Indonesia"]];
  var nav=document.querySelector(".langs");if(!nav)return;
  var doc=nav.getAttribute("data-doc"),cur=document.documentElement.lang.slice(0,2);
  nav.innerHTML=L.map(function(x){var href=doc+(x[0]==="ko"?"":"."+x[0])+".html";
    return '<a href="'+href+'"'+(x[0]===cur?' aria-current="page"':"")+' lang="'+x[0]+'">'+x[1]+"</a>"}).join("");
})();
