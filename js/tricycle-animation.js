/* =========================================================
   TFRO Hero — Cinematic 3D Philippine Tricycle Animation
   A stylized 3D-rendered tricycle continuously drives along a
   smooth circular route in the hero, with subtle green/yellow
   digital motion trails (route monitoring / digital tracking).

   Behavior (seamless ~8s loop, no fade-out):
     - The tricycle enters from the left edge.
     - It drives toward the center of the hero.
     - At the center it very briefly slows (~~1s) to suggest a
       regulated stop, then continues driving forward
       autonomously along the circular route.
     - The loop repeats seamlessly.

   The canvas is transparent and sits above the backdrop but
   below the text, so the existing hero design is preserved.
   ========================================================= */

(function () {
  const canvas = document.getElementById("tricycleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let W = 0;
  let H = 0;

  function resize() {
    W = canvas.width = canvas.clientWidth || window.innerWidth;
    H = canvas.height = canvas.clientHeight || window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  // Re-apply sizing with DPR for crisp rendering
  function responsiveResize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.removeEventListener("resize", resize);
  window.addEventListener("resize", responsiveResize);
  responsiveResize();

  /* ---------- Route: a smooth, visible circular loop ---------- */
  const loop = {
    get cx() { return W * 0.5; },
    get cy() { return H * 0.80; },
    get rx() { return Math.min(W * 0.34, 460); },
    get ry() { return Math.min(H * 0.12, 96); },
  };

  /* Global scale so the tricycle stays balanced at all sizes */
  const scale = () => {
    const s = Math.min(W, H) / 720;
    return Math.max(0.72, Math.min(1.5, s));
  };

  /* ---------- Timing: 8s loop with a brief ~1s idle at center ---------- */
  const DURATION = 8000; // ms
  const CENTER_P = 0.25; // loop parameter at the center (top of the loop)
  const PAUSE_DUR = 0.13; // fraction of the loop spent paused (~1s)

  // Map normalized time t in [0,1] -> loop parameter p in [0,1] (seamless).
  function param(t) {
    let p;
    if (t < CENTER_P) {
      p = t;
    } else if (t < CENTER_P + PAUSE_DUR) {
      p = CENTER_P;
    } else {
      p =
        CENTER_P +
        ((t - CENTER_P - PAUSE_DUR) / (1 - CENTER_P - PAUSE_DUR)) *
          (1 - CENTER_P);
    }
    return p;
  }

  // p=0 -> left edge, p=0.25 -> top-center, p=1 -> left edge (closed loop)
  function posAt(p) {
    const theta = Math.PI - 2 * Math.PI * p;
    return {
      x: loop.cx + loop.rx * Math.cos(theta),
      y: loop.cy - loop.ry * Math.sin(theta),
    };
  }

  let wheelAngle = 0;
  let lastTime = null;

  /* ---------- Subtle dashed route path (organized route) ---------- */
  function drawRoute() {
    ctx.save();
    ctx.strokeStyle = "rgba(244,196,48,0.28)";
    ctx.setLineDash([6, 14]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const p = i / 120;
      const pt = posAt(p);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- Drawing helpers ---------- */
  function drawWheel(cx, cy, r, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    // tire
    ctx.fillStyle = "#14181b";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // tire tread
    ctx.strokeStyle = "#2a3136";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2);
    ctx.stroke();
    // rim
    const rim = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
    rim.addColorStop(0, "#1ea86f");
    rim.addColorStop(1, "#0b3d2e");
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // hub
    ctx.fillStyle = "#f4c430";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // rotating spokes
    ctx.save();
    ctx.rotate(angle);
    ctx.strokeStyle = "#e5f5ee";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -r * 0.5);
      ctx.stroke();
    }
    ctx.restore();
    // soft highlight
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, Math.PI * 0.95, Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
  }

  function drawTricycle(x, y, heading, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    const s = scale();
    ctx.scale(s, s);

    // ---- soft ground shadow ----
    ctx.save();
    ctx.scale(1, 0.22);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(6, 28, 54, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- sidecar wheel (far/right side) ----
    drawWheel(30, -13, 11, angle);

    // ---- motorcycle rear & front wheels ----
    drawWheel(-26, 0, 26, angle);
    drawWheel(42, 0, 26, angle);

    // ---- sidecar cabin (behind the motorcycle body) ----
    ctx.fillStyle = "#178a5e";
    ctx.beginPath();
    ctx.moveTo(-6, -15);
    ctx.lineTo(30, -15);
    ctx.lineTo(30, -33);
    ctx.quadraticCurveTo(-6, -33, -6, -15);
    ctx.closePath();
    ctx.fill();
    // yellow roof canopy
    const roof = ctx.createLinearGradient(0, -46, 0, -28);
    roof.addColorStop(0, "#ffd75e");
    roof.addColorStop(1, "#f4c430");
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(-6, -33);
    ctx.quadraticCurveTo(13, -52, 33, -33);
    ctx.lineTo(31, -28);
    ctx.quadraticCurveTo(13, -45, -4, -28);
    ctx.closePath();
    ctx.fill();
    // sidecar window
    ctx.fillStyle = "#cfe8dd";
    ctx.beginPath();
    ctx.moveTo(2, -29);
    ctx.lineTo(26, -29);
    ctx.lineTo(22, -22);
    ctx.lineTo(6, -22);
    ctx.closePath();
    ctx.fill();
    // sidecar accent stripe
    ctx.fillStyle = "#f4c430";
    ctx.fillRect(-6, -20, 36, 3);

    // ---- motorcycle body (green, in front) ----
    const body = ctx.createLinearGradient(0, -52, 0, -22);
    body.addColorStop(0, "#1ea86f");
    body.addColorStop(0.6, "#178a5e");
    body.addColorStop(1, "#0f4d3a");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-34, -30);
    ctx.lineTo(-34, -44);
    ctx.quadraticCurveTo(-20, -50, -6, -46);
    ctx.lineTo(20, -46);
    ctx.lineTo(38, -34);
    ctx.lineTo(38, -26);
    ctx.lineTo(20, -26);
    ctx.lineTo(-20, -26);
    ctx.closePath();
    ctx.fill();
    // body highlight
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-30, -42);
    ctx.quadraticCurveTo(-8, -47, 20, -44);
    ctx.stroke();
    // yellow accent stripe on body
    ctx.fillStyle = "#f4c430";
    ctx.fillRect(20, -33, 14, 3);
    // rider seat
    ctx.fillStyle = "#123328";
    ctx.beginPath();
    ctx.roundRect(-34, -47, 20, 5, 3);
    ctx.fill();
    // handlebars
    ctx.strokeStyle = "#0b3d2e";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(36, -34);
    ctx.lineTo(42, -50);
    ctx.stroke();
    // front steering column
    ctx.strokeStyle = "#0f4d3a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, -30);
    ctx.lineTo(42, -24);
    ctx.stroke();
    // headlight (yellow glow)
    ctx.fillStyle = "#f4c430";
    ctx.beginPath();
    ctx.arc(44, -31, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(244,196,48,0.35)";
    ctx.beginPath();
    ctx.arc(44, -31, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* ---------- Green/yellow digital motion trails ---------- */
  function drawTrails(x, y, heading) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const anchors = [-26, 42, 30];
    anchors.forEach((wx, i) => {
      const len = 26 + 8 * Math.random();
      const grad = ctx.createLinearGradient(-len, 0, 0, 0);
      const color = i === 1 ? "30,168,111" : "244,196,48";
      grad.addColorStop(0, `rgba(${color},0)`);
      grad.addColorStop(1, `rgba(${color},0.30)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-len, wx * 0.5);
      ctx.quadraticCurveTo(-len * 0.5, wx * 0.5 - 4, 0, wx * 0.5);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- Main loop ---------- */
  function frame(now) {
    if (lastTime === null) lastTime = now;
    const dt = now - lastTime;
    lastTime = now;

    ctx.clearRect(0, 0, W, H);

    // seamless continuous loop
    const t = (now % DURATION) / DURATION;
    const p0 = param(t);
    const p1 = param((t + 0.0015) % 1);

    const pos = posAt(p0);
    const pos2 = posAt(p1);
    const heading = Math.atan2(pos2.y - pos.y, pos2.x - pos.x);

    // accumulate wheel rotation from travelled distance
    const seg = Math.hypot(pos2.x - pos.x, pos2.y - pos.y);
    wheelAngle += seg / 26;

    drawRoute();
    drawTrails(pos.x, pos.y, heading);
    drawTricycle(pos.x, pos.y, heading, wheelAngle);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
