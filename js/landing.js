// =========================================================
// TFRO Landing Page — hero slideshow + navigation toggles
// + formal scroll-reveal animations
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  /* ---------- Hero background slideshow ----------
     Rotate through slides every 6 seconds with a smooth crossfade. */
  const slides = document.querySelectorAll("#slides .slide");
  let current = 0;

  if (slides.length > 1) {
    setInterval(() => {
      // Remove the active class from the current slide (crossfade out)
      slides[current].classList.remove("active");
      // Advance the index
      current = (current + 1) % slides.length;
      // Crossfade in the next slide
      slides[current].classList.add("active");
    }, 6000);
  }

  /* ---------- Mobile navigation toggle ---------- */
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("navLinks");

  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");
      // Swap the hamburger / close icon
      hamburger.querySelector("i").className = isOpen
        ? "ri-close-line"
        : "ri-menu-line";
    });

    // Close the menu when a nav link is clicked (for mobile UX).
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        hamburger.querySelector("i").className = "ri-menu-line";
      });
    });
  }

  /* ---------- Formal scroll-reveal animation ----------
     Subtle fade-up as elements enter the viewport. Uses
     IntersectionObserver for a clean, performant reveal that
     keeps the government office feel professional. */
  const revealEls = document.querySelectorAll(".reveal");

  if (revealEls.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealEls.forEach((el) => io.observe(el));
  } else {
    // Fallback: show everything if IntersectionObserver is unavailable.
    revealEls.forEach((el) => el.classList.add("visible"));
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});
