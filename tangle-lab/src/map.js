export class NodeMap {
  constructor(element,onSelect){
    this.el=element;this.world=document.getElementById('world');this.edges=document.getElementById('edges');this.nodes=document.getElementById('nodes');
    this.onSelect=onSelect;this.scale=1;this.x=0;this.y=30;this.positions=new Map();this.buttons=new Map();this.pointers=new Map();this.moved=false;
    element.addEventListener('pointerdown',e=>{
      if(e.button&&e.button!==0)return;
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,target:e.target.closest('.graph-node')});
      if(this.pointers.size===1)this.moved=false;else this.moved=true;
      element.setPointerCapture(e.pointerId);
    });
    element.addEventListener('pointermove',e=>{
      const p=this.pointers.get(e.pointerId);if(!p)return;
      const before=[...this.pointers.values()];const dist=a=>a.length===2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;
      const d0=dist(before),dx=e.clientX-p.x,dy=e.clientY-p.y;
      if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>4)this.moved=true;
      p.x=e.clientX;p.y=e.clientY;
      if(this.pointers.size===2){const a=[...this.pointers.values()],rect=this.el.getBoundingClientRect();const d1=dist(a);if(d0>0)this.zoom(d1/d0,(a[0].x+a[1].x)/2-rect.left,(a[0].y+a[1].y)/2-rect.top);}
      else if(this.moved){this.x+=dx;this.y+=dy;this.transform();}
      if(this.moved){element.classList.add('dragging');document.getElementById('follow').checked=false;}
    });
    const end=e=>{const p=this.pointers.get(e.pointerId);if(p&&!this.moved&&p.target)this.onSelect(p.target.dataset.id);this.pointers.delete(e.pointerId);if(!this.pointers.size)element.classList.remove('dragging');};
    element.addEventListener('pointerup',end);element.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);element.classList.remove('dragging');});
    element.addEventListener('wheel',e=>{e.preventDefault();const r=element.getBoundingClientRect();this.zoom(Math.exp(-e.deltaY*.002),e.clientX-r.left,e.clientY-r.top);document.getElementById('follow').checked=false;},{passive:false});
    this.observer=new ResizeObserver(()=>{if(this.active&&document.getElementById('follow').checked)this.focus(this.active);});this.observer.observe(element);
  }
  transform(){this.world.style.transform=`translate(${this.x}px,${this.y}px) scale(${this.scale})`;}
  zoom(factor,cx=this.el.clientWidth/2,cy=this.el.clientHeight/2){const s=Math.max(.2,Math.min(2.4,this.scale*factor));this.x=cx-(cx-this.x)*s/this.scale;this.y=cy-(cy-this.y)*s/this.scale;this.scale=s;this.transform();}
  focus(id){const p=this.positions.get(id);if(!p)return;this.active=id;this.x=this.el.clientWidth/2-(p.x+105)*this.scale;this.y=this.el.clientHeight/2-(p.y+44)*this.scale;this.transform();}
  fit(){if(!this.positions.size)return;const a=[...this.positions.values()];const minX=Math.min(...a.map(p=>p.x)),maxX=Math.max(...a.map(p=>p.x))+210,maxY=Math.max(...a.map(p=>p.y))+88;this.scale=Math.min(1.15,(this.el.clientWidth-40)/(maxX-minX),(this.el.clientHeight-40)/maxY);this.x=(this.el.clientWidth-(maxX-minX)*this.scale)/2-minX*this.scale;this.y=(this.el.clientHeight-maxY*this.scale)/2;this.transform();}
  draw(run,selected,active){
    let col=0;this.positions.clear();
    const place=n=>{const kids=run.nodes.filter(x=>x.parent===n.id);let x;if(kids.length){kids.forEach(place);x=kids.reduce((sum,c)=>sum+this.positions.get(c.id).x,0)/kids.length;}else{x=col*240;col++;}this.positions.set(n.id,{x,y:n.depth*130});};place(run.nodes[0]);
    for(const [id,b] of this.buttons)if(!run.nodes.some(n=>n.id===id)){b.remove();this.buttons.delete(id);}
    for(const n of run.nodes){
      let b=this.buttons.get(n.id);
      if(!b){b=document.createElement('button');b.className='graph-node';b.dataset.id=n.id;b.type='button';b.onclick=e=>{if(e.detail===0)this.onSelect(n.id);};this.nodes.append(b);this.buttons.set(n.id,b);}
      const p=this.positions.get(n.id);b.style.transform=`translate(${p.x}px,${p.y}px)`;b.dataset.status=n.status;b.setAttribute('aria-pressed',String(selected===n.id));b.setAttribute('aria-label',`${n.id}. ${n.question} ${n.status}, ${n.visits} visits.`);
      const top=document.createElement('span');top.className='node-top';const left=document.createElement('span');left.textContent=n.id+(n.visits>1?' · revisit '+(n.visits-1):'');const right=document.createElement('span');const dot=document.createElement('i');dot.className='dot '+n.status;right.append(dot,document.createTextNode(n.status));top.append(left,right);const q=document.createElement('span');q.className='q';q.textContent=n.question;b.replaceChildren(top,q);
    }
    this.edges.replaceChildren();
    for(const n of run.nodes.filter(n=>n.parent)){
      const a=this.positions.get(n.parent),b=this.positions.get(n.id),path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',`M${a.x+105},${a.y+88} C${a.x+105},${a.y+109} ${b.x+105},${b.y-21} ${b.x+105},${b.y}`);this.edges.append(path);
    }
    if(active&&document.getElementById('follow').checked)this.focus(active);
    else if(!this.active)this.focus('n1');
  }
}
