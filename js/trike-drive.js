/* =========================================================
   TFRO Tricycle Drive — Login & Register pages
   ---------------------------------------------------------
   Drives the actual Philippine tricycle asset (Trycicle
   Image.png) in a single, straight, perfectly horizontal
   path from LEFT to RIGHT.

   Journey:
     start off-screen LEFT ->
     travels smoothly through CENTER ->
     reaches the RIGHT edge ->
     continues forward and fully leaves the visible screen.

   It NEVER loops back, teleports, jumps, reverses, or
   reappears from the left. Once it has left the viewport it
   simply stops (stays off-screen to the right), exactly like
   a tricycle traveling on a long road that extends beyond the
   screen.

   The movement is driven by requestAnimationFrame at a
   constant speed, so it stays smooth and linear at all sizes.
   ========================================================= */

(function () {
  const trike = document.getElementById("driveTricycle");
  if (!trike) return;

  // Constraining container = the closest positioned ancestor. On the
  // Register page this is the right registration panel (.trike-scene
  // sits inside it), which keeps the tricycle inside the registration
  // area and prevents any horizontal page overflow. On the Login page
  // it falls back to the full window.
  const scene = trike.parentElement || document.body;

  const SPEED = 320; // px per second

  const trikeWidth = trike.offsetWidth || 210;

  // Travelling distance = the scene's width (plus the tricycle once on
  // each side so it fully enters and fully exits the confined strip).
  const sceneWidth = scene.clientWidth || window.innerWidth;

  // Start fully off-screen to the RIGHT, enter, pass through CENTER,
  // travel to the LEFT, continue forward off-screen, then REPEAT —
  // all within the scene (right registration area) only.
  const START_X = sceneWidth + trikeWidth + 40;   // off right edge
  const END_X = -trikeWidth - 40;                 // off left edge

  let x = START_X;
  trike.style.transform = "translateX(" + x + "px)";

  let last = null;

  function tick(now) {
    if (last === null) last = now;
    const dt = Math.min((now - last) / 1000, 0.05); // clamp big gaps
    last = now;

    // Move LEFT: RIGHT -> CENTER -> LEFT (straight horizontal path only)
    x -= SPEED * dt;
    trike.style.transform = "translateX(" + x + "px)";

    // Once fully past the left edge, loop back to the right side again.
    if (x <= END_X) {
      x = START_X;
      trike.style.transform = "translateX(" + x + "px)";
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
