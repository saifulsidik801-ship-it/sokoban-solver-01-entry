import f from"node:fs";
let{MAKEFUN_INPUT_DIR:I="/input",MAKEFUN_OUTPUT_DIR:O="/output"}=process.env;
let w,N,K=[-1,1,0,0],WA,GO,HR,b;
let C="lrud";
// walk path from a to z on global WA avoiding boxes in b; null if unreachable
function W(a,z){
  let d=new Map([[a,0]]),q=[a];
  for(let i=0;i<q.length;i++){let x=q[i];for(let k=0;k<4;k++){let n=x+K[k];if(WA[n]&&!b.includes(n)&&!d.has(n)){d.set(n,d.get(x)+1);q.push(n)}}}
  if(!d.has(z))return null;
  let m="";for(let o=z;o!==a;){for(let h=0;h<4;h++){let y=o+K[h];if(d.get(y)===d.get(o)-1){m=C[h^1]+m;o=y;break}}}
  return m;
}
// 0-1 BFS per room over (sorted boxes, player); walk cost 0, push cost 1.
// Two-stack deque: front[] (pop from end) + back[] (push to end).
function S(A,R,d){
  let s0=R.slice().sort((a,b)=>a-b),k0=s0.join()+"."+d;
  let D=new Map([[k0,0]]),P=new Map([[k0,0]]),V=new Map([[k0,[s0,d]]]);
  let fr=[k0],bk=[],ex=0;
  let pop=()=>{if(fr.length)return fr.pop();if(!bk.length)return 0;fr=bk.reverse();bk=[];return fr.pop()};
  for(let k;(k=pop())!==0;){
    let c=D.get(k),st=V.get(k),bx=st[0],p=st[1];ex++;
    if(bx.every(x=>GO[x])){
      let m="";for(let z=k;P.get(z);){let t=P.get(z);m=t[1]+m;z=t[0]}return[m,p,bx,ex];
    }
    let bs=new Set(bx);
    for(let q=0;q<4;q++){
      let np=p+K[q];
      if(!A[np])continue;
      if(bs.has(np)){
        let nb=np+K[q];
        if(!A[nb]||bs.has(nb))continue;
        let nx=bx.slice();nx[nx.indexOf(np)]=nb;nx.sort((a,b)=>a-b);
        let nk=nx.join()+"."+np;
        if(D.has(nk))continue;
        D.set(nk,c+1);P.set(nk,[k,C[q]]);V.set(nk,[nx,np]);bk.push(nk);
      }else{
        let nk=bx.join()+"."+np;
        if(D.has(nk))continue;
        D.set(nk,c);P.set(nk,[k,C[q]]);V.set(nk,[bx,np]);fr.push(nk);
      }
    }
  }
  return 0;
}
function Z(t){
  let s=t.split("\n"),x=s[0].length;w=x+2;N=w*(s.length+2);K=[-1,1,-w,w];
  WA=new Uint8Array(N);GO=new Uint8Array(N);let p=0,m="",ex=0;b=[];
  for(let j in s)for(let i=0;i<x;i++){let n=(+j+1)*w+1+i,c=s[j][i]||"#";WA[n]=c!="#";GO[n]=".*+".includes(c);"$*".includes(c)&&b.push(n);"@+".includes(c)&&(p=n,HR=(n/w)|0)}
  for(let y of[-1,1])for(let X of[0,7]){
    let o=2+X,r=y<0?HR-7:HR+2;
    if(o+5>=w)continue;
    let d=[0,1,2,3,4,5].map(z=>(HR+y)*w+o+z).find(c=>WA[c])??-1;
    if(d<0)continue;
    let A=new Uint8Array(N);
    for(let j=6;j--;)for(let z=6;z--;){let c=(r+j)*w+o+z;A[c]=WA[c]}
    A[d]=1;
    let R=b.filter(c=>A[c]);
    if(R.includes(d)){
      // box on the door: walk to hallway side, push it into the room first
      let h=d+(y<0?w:-w),nb=d+(y<0?-w:w),wk=W(p,h);
      if(wk===null||!WA[nb]||b.includes(nb))return"";
      m+=wk+(y<0?"u":"d");
      b=b.slice();b[b.indexOf(d)]=nb;R=b.filter(c=>A[c]);p=d;
    }else{
      let wk=W(p,d);
      if(wk===null)return"";
      m+=wk;p=d;
    }
    let v=S(A,R,d);
    if(!v)return"";
    m+=v[0];p=v[1];ex+=v[3];b=b.filter(c=>!A[c]).concat(v[2]);
  }
  return m;
}
for(let id of f.readdirSync(I)){let a=I+"/"+id;f.mkdirSync(O+"/"+id,{recursive:true});f.writeFileSync(O+"/"+id+"/solution.txt",Z(f.readFileSync(a+"/level.txt")+""))}
