// Executable circuit model. Full adders are composed exclusively from NAND gates.
export const nand=(a,b)=>1-((a&1)&(b&1));
export function fullAdder(a,b,cin){
 const n1=nand(a,b),n2=nand(a,n1),n3=nand(b,n1),xor=nand(n2,n3);
 const n4=nand(xor,cin),n5=nand(xor,n4),n6=nand(cin,n4);
 return {a,b,cin,sum:nand(n5,n6),cout:nand(n1,n4)};
}
export function add8(a,b){
 a&=255;b&=255;let c=0,sum=0;const bits=[];
 for(let i=0;i<8;i++){const bit=fullAdder((a>>i)&1,(b>>i)&1,c);bits.push(bit);sum|=bit.sum<<i;c=bit.cout;}
 return {a,b,sum,carry:c,bits};
}
export function stateAt(day,time){const n=Math.floor(time*2);return {...add8((n*7+day*11)&255,(n*3+day*5)&255),time};}
