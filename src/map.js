// The understanding map: nodes laid out as a tree by depth, with pan, pinch
// and wheel zoom. Purely presentational; it never mutates the run.

const NODE_WIDTH = 210;
const NODE_HEIGHT = 88;
const COLUMN = 240;
const ROW = 130;
const SVG = "http://www.w3.org/2000/svg";

export class GraphMap {
  constructor(container, { onSelect, onManualMove = () => {} }) {
    this.el = container;
    this.world = container.querySelector("#world");
    this.edges = container.querySelector("#edges");
    this.nodes = container.querySelector("#nodes");
    this.onSelect = onSelect;
    this.onManualMove = onManualMove;
    this.scale = 1;
    this.x = 0;
    this.y = 30;
    this.active = null;
    this.follow = true;
    this.positions = new Map();
    this.buttons = new Map();
    this.pointers = new Map();
    this.moved = false;
    this.bindPointers();
    this.observer = new ResizeObserver(() => {
      if (this.active && this.follow) this.focus(this.active);
    });
    this.observer.observe(container);
  }

  bindPointers() {
    const el = this.el;
    const distance = (points) => (points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0);
    el.addEventListener("pointerdown", (event) => {
      if (event.button && event.button !== 0) return;
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        target: event.target.closest(".graph-node"),
      });
      this.moved = this.pointers.size !== 1;
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const before = distance([...this.pointers.values()]);
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) this.moved = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        const rect = el.getBoundingClientRect();
        const after = distance(points);
        if (before > 0) this.zoom(after / before, (points[0].x + points[1].x) / 2 - rect.left, (points[0].y + points[1].y) / 2 - rect.top);
      } else if (this.moved) {
        this.x += dx;
        this.y += dy;
        this.transform();
      }
      if (this.moved) {
        el.classList.add("dragging");
        this.manualMove();
      }
    });
    const release = (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (pointer && !this.moved && pointer.target) this.onSelect(pointer.target.dataset.id);
      this.pointers.delete(event.pointerId);
      if (!this.pointers.size) el.classList.remove("dragging");
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", (event) => {
      this.pointers.delete(event.pointerId);
      el.classList.remove("dragging");
    });
    el.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = el.getBoundingClientRect();
        this.zoom(Math.exp(-event.deltaY * 0.002), event.clientX - rect.left, event.clientY - rect.top);
        this.manualMove();
      },
      { passive: false },
    );
  }

  manualMove() {
    this.follow = false;
    this.onManualMove();
  }

  transform() {
    this.world.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale})`;
  }

  zoom(factor, cx = this.el.clientWidth / 2, cy = this.el.clientHeight / 2) {
    const next = Math.max(0.2, Math.min(2.4, this.scale * factor));
    this.x = cx - ((cx - this.x) * next) / this.scale;
    this.y = cy - ((cy - this.y) * next) / this.scale;
    this.scale = next;
    this.transform();
  }

  focus(id) {
    const position = this.positions.get(id);
    if (!position) return;
    this.active = id;
    this.x = this.el.clientWidth / 2 - (position.x + NODE_WIDTH / 2) * this.scale;
    this.y = this.el.clientHeight / 2 - (position.y + NODE_HEIGHT / 2) * this.scale;
    this.transform();
  }

  fit() {
    if (!this.positions.size) return;
    const points = [...this.positions.values()];
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x)) + NODE_WIDTH;
    const maxY = Math.max(...points.map((p) => p.y)) + NODE_HEIGHT;
    this.scale = Math.min(1.15, (this.el.clientWidth - 40) / (maxX - minX), (this.el.clientHeight - 40) / maxY);
    this.x = (this.el.clientWidth - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.y = (this.el.clientHeight - maxY * this.scale) / 2;
    this.transform();
  }

  layout(run) {
    let column = 0;
    this.positions.clear();
    const place = (node) => {
      const kids = run.nodes.filter((candidate) => candidate.parent === node.id);
      let x;
      if (kids.length) {
        kids.forEach(place);
        x = kids.reduce((sum, kid) => sum + this.positions.get(kid.id).x, 0) / kids.length;
      } else {
        x = column * COLUMN;
        column++;
      }
      this.positions.set(node.id, { x, y: node.depth * ROW });
    };
    place(run.nodes[0]);
  }

  draw(run, selectedId, focusId) {
    this.layout(run);
    for (const [id, button] of this.buttons) {
      if (!run.nodes.some((node) => node.id === id)) {
        button.remove();
        this.buttons.delete(id);
      }
    }
    for (const node of run.nodes) {
      let button = this.buttons.get(node.id);
      if (!button) {
        button = document.createElement("button");
        button.className = "graph-node";
        button.dataset.id = node.id;
        button.type = "button";
        button.onclick = (event) => {
          if (event.detail === 0) this.onSelect(node.id);
        };
        this.nodes.append(button);
        this.buttons.set(node.id, button);
      }
      const position = this.positions.get(node.id);
      button.style.transform = `translate(${position.x}px,${position.y}px)`;
      button.dataset.status = node.status;
      button.setAttribute("aria-pressed", String(selectedId === node.id));
      button.setAttribute("aria-label", `${node.id}. ${node.question} ${node.status}, ${node.visits} visits.`);
      const top = document.createElement("span");
      top.className = "node-top";
      const label = document.createElement("span");
      label.textContent = node.id + (node.visits > 1 ? " · revisit " + (node.visits - 1) : "");
      const status = document.createElement("span");
      const dot = document.createElement("i");
      dot.className = "dot " + node.status;
      status.append(dot, document.createTextNode(node.status));
      top.append(label, status);
      const question = document.createElement("span");
      question.className = "q";
      question.textContent = node.question;
      button.replaceChildren(top, question);
    }
    this.edges.replaceChildren();
    for (const node of run.nodes.filter((candidate) => candidate.parent)) {
      const from = this.positions.get(node.parent);
      const to = this.positions.get(node.id);
      const path = document.createElementNS(SVG, "path");
      const half = NODE_WIDTH / 2;
      path.setAttribute("d", `M${from.x + half},${from.y + NODE_HEIGHT} C${from.x + half},${from.y + NODE_HEIGHT + 21} ${to.x + half},${to.y - 21} ${to.x + half},${to.y}`);
      this.edges.append(path);
    }
    if (focusId && this.follow) this.focus(focusId);
    else if (!this.active) this.focus("n1");
  }
}
