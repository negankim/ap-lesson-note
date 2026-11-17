import re,json,sys,html
from html.parser import HTMLParser
KO=re.compile(r'[가-힣]')
out=[]  # (text, src)
def add(t,src):
    t=html.unescape(re.sub(r'\s+',' ',t)).strip()
    if KO.search(t) and not t.startswith('//'): out.append((t,src))
def split_tags(s,src):
    for piece in re.split(r'<[^<>]*>',s):
        add(piece,src)
    # attributes inside tags
    for m in re.finditer(r'(?:placeholder|title|aria-label|alt|data-tip|data-say)="([^"]*)"',s):
        add(m.group(1),src)
def parse_js(src,name):
    i=0;n=len(src)
    def read_template(i):
        # at char after backtick; returns (text_with_placeholders, new_i)
        buf=[];k=0
        while i<n:
            c=src[i]
            if c=='\\': buf.append(src[i:i+2]);i+=2;continue
            if c=='`': return ''.join(buf),i+1
            if c=='$' and src[i+1:i+2]=='{':
                i=read_code(i+2,True); buf.append('{%d}'%k);k+=1;continue
            buf.append(c);i+=1
        return ''.join(buf),i
    def read_code(i,until_brace):
        depth=0
        while i<n:
            c=src[i]
            if c in '"\'':
                q=c;j=i+1;s=[]
                while j<n and src[j]!=q:
                    if src[j]=='\\': s.append(src[j:j+2]);j+=2;continue
                    s.append(src[j]);j+=1
                split_tags(''.join(s),name);i=j+1;continue
            if c=='`':
                t,i=read_template(i+1);split_tags(t,name);continue
            if c=='/' and src[i+1:i+2]=='*':
                j=src.find('*/',i+2);i=n if j<0 else j+2;continue
            if c=='/' and src[i+1:i+2]=='/':
                j=src.find('\n',i);i=n if j<0 else j;continue
            if c=='/' :
                # regex literal heuristic: previous non-space char
                k=i-1
                while k>=0 and src[k] in ' \t': k-=1
                if k<0 or src[k] in '(,=:[!&|?{};+\n':
                    j=i+1
                    while j<n and src[j]!='/' and src[j]!='\n':
                        if src[j]=='\\': j+=1
                        elif src[j]=='[':
                            while j<n and src[j]!=']': j+=1
                        j+=1
                    i=j+1;continue
            if until_brace:
                if c=='{': depth+=1
                elif c=='}':
                    if depth==0: return i+1
                    depth-=1
            i+=1
        return i
    read_code(0,False)
class H(HTMLParser):
    def __init__(s,name):super().__init__();s.name=name;s.skip=0
    def handle_starttag(s,tag,attrs):
        if tag in('script','style'):s.skip+=1
        for k,v in attrs:
            if k in('placeholder','title','aria-label','alt','content','data-say') and v: add(v,s.name)
    def handle_endtag(s,tag):
        if tag in('script','style'):s.skip-=1
    def handle_data(s,d):
        if not s.skip: add(d,s.name)
for f in sys.argv[1:]:
    t=open(f).read()
    if f.endswith('.html'): H(f).feed(t)
    else: parse_js(t,f)
seen={}
for t,s in out:
    seen.setdefault(t,s)
import os
D=os.path.join(os.path.dirname(__file__),'i18n')
kp=os.path.join(D,'keys.json')
keys=json.load(open(kp)) if os.path.exists(kp) else []
DROP={"일월화수목금토","님"}
def clean(k):
    k=k.strip('<>').strip()
    mp={}
    def rn(m):
        o=m.group(1)
        if o not in mp: mp[o]=len(mp)
        return '{%d}'%mp[o]
    return re.sub(r'\{(\d+)\}',rn,k)
have=set(keys);added=[]
for k in seen:
    c=clean(k)
    if c in DROP or c.startswith('[AP 레슨 노트]') or '\\n' in c or c in have: continue
    have.add(c);keys.append(c);added.append(c)
json.dump(keys,open(kp,'w'),ensure_ascii=False)
print('keys',len(keys),'new',len(added))
for i,c in enumerate(added): print(len(keys)-len(added)+i, c, sep='\t')
