// Client behaviour for the audit page, inlined as plain ES2019 (no build step).
export function auditScript(token: string): string {
  return /* js */ `(function () {
  "use strict";
  var TOKEN = ${JSON.stringify(token)};
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var easeOutQuart = function (t) { return 1 - Math.pow(1 - t, 4); };

  // ── savings counter ────────────────────────────────────────────────────────
  var savingsEl = document.getElementById("savings");
  var shown = 0;
  function countTo(target, ms) {
    if (!savingsEl) return;
    var from = shown, start = performance.now();
    shown = target;
    if (reduce) { savingsEl.textContent = money(target); return; }
    (function frame(now) {
      var t = Math.min(1, (now - start) / ms);
      savingsEl.textContent = money(from + (target - from) * easeOutQuart(t));
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  // ── signature move: scan replay ────────────────────────────────────────────
  function scan() {
    var bill = document.querySelector(".bill");
    var rows = Array.prototype.slice.call(document.querySelectorAll(".line"));
    if (!bill || !rows.length) { root.classList.remove("js-scan"); return; }
    var total = savingsEl ? parseFloat(savingsEl.dataset.value || "0") : 0;
    if (savingsEl) savingsEl.textContent = money(0);

    var beam = document.createElement("div");
    beam.className = "beam";
    beam.setAttribute("aria-hidden", "true");
    bill.appendChild(beam);
    var billTop = bill.getBoundingClientRect().top + scrollY;

    var t = 500, running = 0, beamY = 0;
    rows.forEach(function (row) {
      var flagged = row.classList.contains("line-flagged");
      var at = t;
      t += flagged ? 620 : 170;
      setTimeout(function () {
        var r = row.getBoundingClientRect();
        var y = r.top + scrollY - billTop + r.height / 2 - 36;
        beam.animate([{ opacity: 1, transform: "translateY(" + beamY + "px)" }, { opacity: 1, transform: "translateY(" + y + "px)" }],
          { duration: flagged ? 420 : 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
        beamY = y;
        setTimeout(function () {
          row.classList.add("resolved");
          var over = parseFloat(row.dataset.overcharge || "0");
          if (over > 0) { running += over; countTo(running, 520); }
        }, flagged ? 300 : 110);
      }, at);
    });
    setTimeout(function () {
      countTo(total, 400); // land exactly on the audited total (incl. bill-level findings)
      beam.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" });
      setTimeout(function () { root.classList.remove("js-scan"); beam.remove(); }, 450);
    }, t + 350);
  }
  if (root.classList.contains("js-scan")) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scan); else scan();
  }

  // ── approval gate ──────────────────────────────────────────────────────────
  var sheet = document.getElementById("approve-sheet");
  var openBtn = document.getElementById("approve-open");
  var confirmBtn = document.getElementById("approve-confirm");
  var errorEl = document.getElementById("approve-error");
  var action = document.getElementById("action");

  if (openBtn && sheet) openBtn.addEventListener("click", function () { sheet.showModal(); });
  if (confirmBtn) confirmBtn.addEventListener("click", function () {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Approving…";
    errorEl.hidden = true;
    fetch("/audit/" + TOKEN + "/approve", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.message || "Something went wrong."); return j; }); })
      .then(function () {
        sheet.close();
        setPhase("approved");
      })
      .catch(function (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Yes, make the call";
        errorEl.textContent = err.message + " Please try again.";
        errorEl.hidden = false;
      });
  });

  function setPhase(phase) {
    document.body.dataset.phase = phase;
    if (!action) return;
    action.dataset.state = phase;
    var approved = action.querySelector(".action-approved");
    if (approved) approved.hidden = phase === "review";
  }

  // Exposed for the live call view (M4).
  window.zerkabill = { setPhase: setPhase, countTo: countTo };
})();`;
}
