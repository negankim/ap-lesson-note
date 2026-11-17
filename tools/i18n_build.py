"""화면 번역 문장표 만들기.
   tools/i18n/keys.json(한국어 원문, 번호 순) + tools/i18n/{lang}.tsv(번호<TAB>번역) → public/i18n/{lang}.json
   {0} 같은 자리표는 원문과 번역의 개수가 같아야 한다."""
import json,re,sys,os
D=os.path.dirname(__file__)
keys=json.load(open(os.path.join(D,'i18n','keys.json')))
for lang in sys.argv[1:]:
    tr={}
    for line in open(os.path.join(D,'i18n',f'{lang}.tsv'),encoding='utf-8'):
        line=line.rstrip('\n')
        if not line.strip(): continue
        i,_,t=line.partition('\t'); tr[int(i)]=t
    t,p,bad,miss={},[],[],[]
    for i,k in enumerate(keys):
        if i not in tr: miss.append(i); continue
        v=tr[i]
        if sorted(re.findall(r'\{\d+\}',k))!=sorted(re.findall(r'\{\d+\}',v)): bad.append((i,k,v)); continue
        if re.search(r'\{\d+\}',k): p.append([k,v])
        else: t[k]=v
    extra=json.load(open(os.path.join(D,'i18n','extra.json'),encoding='utf-8'))
    for k,v in extra.items():
        if lang in v: p.append([k,v[lang]])
    json.dump({'lang':lang,'t':t,'p':p},open(os.path.join(D,'..','public','i18n',f'{lang}.json'),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
    print(lang,'ok',len(t),'patterns',len(p),'missing',miss[:10],len(miss),'bad',bad[:5])
