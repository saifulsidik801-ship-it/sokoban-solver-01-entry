import f from"fs";
let{MAKEFUN_INPUT_DIR:I="/input",MAKEFUN_OUTPUT_DIR:O="/output"}=process.env;
let w,K,WA,HR,b,W,S,Z;
let C="lrud";
W=(a,z)=>{
let d=new Map([[a]]),q=[a];
for(let x of q){for(let k=4;k--;){let n=x+K[k];if(WA[n]&&!b.includes(n)&&!d.has(n)){d.set(n,x);q.push(n)}}}
if(!d.has(z))return;
let m="";for(let o=z,y;o!==a;){y=d.get(o);m=C[K.indexOf(o-y)]+m;o=y}
return m;
};
S=(A,R,d)=>{
let s0=R.sort((a,b)=>a-b),k0=s0+"."+d;
let M=new Map([[k0,[0,0,s0,d]]]),Q=[k0],i=0,j=1;
for(let k;i<j;){
k=Q[i++];
let t=M.get(k),bx=t[2],p=t[3];
if(bx.every(x=>WA[x]>1)){
let m="",u;for(let z=k;u=M.get(z),u[0];){m=u[1]+m;z=u[0]}return[m,p,bx];
}
for(let q=4;q--;){
let np=p+K[q],nb=np+K[q],P=bx.includes(np);
if(!A[np]||P&&(!A[nb]||bx.includes(nb)))continue;
let nx=P?bx.map(x=>x-np?x:nb).sort((a,b)=>a-b):bx,nk=nx+"."+np;
if(M.get(nk))continue;
M.set(nk,[k,C[q],nx,np]);Q[P?j++:--i]=nk;
}
}
return 0;
};
Z=t=>{
let s=t.split("\n"),x=s[0].length;w=x+2;K=[-1,1,-w,w];
WA=new Uint8Array(999);let p=0,m="";b=[];
for(let j in s)for(let i=x;i--;){let n=(+j+1)*w+1+i,c=s[j][i];WA[n]=c=="#"?0:".*+".includes(c)?2:1;"$*".includes(c)&&b.push(n);"@+".includes(c)&&(p=n,HR=+j+1)}
for(let y of[-1,1])for(let X of[0,7]){
let o=2+X,r=HR-7+9*(y>0);
if(o+5>=w)continue;
let d=[0,1,2,3,4,5].map(z=>(HR+y)*w+o+z).find(c=>WA[c]);
if(!d)continue;
let A=new Uint8Array(999);
for(let j=36;j--;){let c=r*w+o+(j/6|0)*w+j%6;A[c]=WA[c]}
A[d]=1;
let R=b.filter(c=>A[c]),T=R.includes(d),h=d-y*w,nb=d+y*w,wk=W(p,T?h:d);
if(wk==null||T&&b.includes(nb))return"";
m+=wk;p=d;
if(T){m+=C[2+(y>0)];R[R.indexOf(d)]=nb}
let v=S(A,R,d);
if(!v)return"";
m+=v[0];p=v[1];b=b.filter(c=>!A[c]).concat(v[2]);
}
return m;
};
for(let id of f.readdirSync(I)){let a=I+"/"+id,d=O+"/"+id;f.mkdirSync(d,{recursive:true});f.writeFileSync(d+"/solution.txt",Z(f.readFileSync(a+"/level.txt")+""))}
