// Client behaviour for the audit page, inlined as plain ES2019 (no build step).
export interface ScriptCtx {
  total: number;
  savings: number;
  provider: string;
  patient: string;
}

export function auditScript(token: string, ctx: ScriptCtx): string {
  return /* js */ `(function () {
  "use strict";
  var TOKEN = ${JSON.stringify(token)};
  var CTX = ${JSON.stringify(ctx).replace(/</g, "\\u003c")};
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
        startCallView("dialing");
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

  // ── live call view ─────────────────────────────────────────────────────────
  var callEl = document.getElementById("call");
  var timerEl = document.getElementById("call-timer");
  var transcriptEl = document.getElementById("transcript");
  var resultEl = document.getElementById("call-result");
  var afterEl = document.getElementById("statement-after");
  var STEPS = ["dialing", "ringing", "in_call", "wrapping_up", "done"];
  var shownTurns = 0, startedAt = null, tick = null, pollTimer = null, finished = false;

  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  function setCallPhase(phase) {
    if (!callEl) return;
    callEl.hidden = false;
    callEl.dataset.phase = phase;
    var idx = STEPS.indexOf(phase);
    Array.prototype.forEach.call(callEl.querySelectorAll(".call-steps li"), function (li, i) {
      li.classList.toggle("past", idx >= 0 && i < idx);
      li.classList.toggle("now", i === idx);
      if (i === idx) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    var title = document.getElementById("call-title");
    if (title) title.textContent = phase === "done" ? "Call with " + CTX.provider + " billing" : phase === "failed" ? "The call didn't go through" : "Calling " + CTX.provider + " billing";
  }

  function renderTranscript(turns) {
    if (!transcriptEl) return;
    for (var i = shownTurns; i < turns.length; i++) {
      var t = turns[i];
      var li = document.createElement("li");
      li.className = t.role === "agent" ? "agent" : "user";
      var who = document.createElement("span");
      who.className = "who";
      who.textContent = t.role === "agent" ? "Zerkabill" : "Billing office";
      var said = document.createElement("span");
      said.className = "said";
      said.textContent = t.message;
      li.appendChild(who); li.appendChild(said);
      transcriptEl.appendChild(li);
    }
    if (turns.length > shownTurns) transcriptEl.scrollTop = transcriptEl.scrollHeight;
    shownTurns = Math.max(shownTurns, turns.length);
  }

  function startTimer(iso) {
    if (!iso || tick) return;
    startedAt = Date.parse(iso);
    tick = setInterval(function () { if (timerEl) timerEl.textContent = fmtTime((Date.now() - startedAt) / 1000); }, 1000);
  }

  function showResult(outcome, durationSecs) {
    if (finished) return;
    finished = true;
    if (tick) clearInterval(tick);
    if (timerEl && durationSecs) timerEl.textContent = fmtTime(durationSecs);
    var good = outcome && (outcome.outcome === "agreed_to_review" || outcome.outcome === "corrected_on_call");
    var removed = outcome && outcome.outcome === "corrected_on_call";
    var head = good ? (removed ? "They took the charges off" : "They agreed to review the charges")
      : outcome && outcome.outcome === "needs_patient" ? "They need to hear from " + CTX.patient
      : outcome && outcome.outcome === "refused" ? "They wouldn't review it with an AI"
      : "The call is done";
    resultEl.innerHTML = "";
    var h = document.createElement("div"); h.className = "res-head";
    if (good) { var c = document.createElement("span"); c.className = "res-check"; c.setAttribute("aria-hidden", "true"); c.textContent = "✓"; h.appendChild(c); }
    h.appendChild(document.createTextNode(head));
    resultEl.appendChild(h);
    var bits = [];
    if (outcome && outcome.referenceNumber) bits.push("Reference #" + outcome.referenceNumber);
    if (outcome && outcome.repName) bits.push("with " + outcome.repName);
    if (bits.length) { var r = document.createElement("p"); r.className = "res-ref"; r.textContent = bits.join(" · "); resultEl.appendChild(r); }
    if (outcome && outcome.nextStep) { var n = document.createElement("p"); n.textContent = outcome.nextStep; resultEl.appendChild(n); }
    resultEl.hidden = false;
    if (good) strikeFlagged(removed);
  }

  // Struck-through success: flagged amounts come off one by one, and the bill total re-counts.
  function strikeFlagged(removed) {
    var flagged = Array.prototype.slice.call(document.querySelectorAll(".line-flagged"));
    flagged.forEach(function (row, i) {
      setTimeout(function () {
        row.classList.add("removed");
        var amt = row.querySelector(".line-amount");
        if (amt && !amt.querySelector(".review-tag")) {
          var tag = document.createElement("span"); tag.className = "review-tag"; tag.textContent = removed ? "removed" : "under review";
          amt.appendChild(tag);
        }
      }, reduce ? 0 : 500 + i * 450);
    });
    if (!afterEl) return;
    var target = CTX.total - CTX.savings;
    afterEl.hidden = false;
    afterEl.innerHTML = (removed ? "Your bill is now " : "If corrected, your bill drops to ") + "<strong></strong>";
    var strong = afterEl.querySelector("strong");
    var from = CTX.total, start = performance.now(), ms = reduce ? 0 : 1600;
    (function frame(now) {
      var t = ms ? Math.min(1, (now - start) / ms) : 1;
      strong.textContent = money(from + (target - from) * easeOutQuart(t));
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  function poll() {
    fetch("/audit/" + TOKEN + "/call", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.phase === "none") { pollTimer = setTimeout(poll, 1500); return; }
        setPhase(s.phase === "done" ? "done" : "calling");
        setCallPhase(s.phase);
        startTimer(s.startedAt);
        renderTranscript(s.transcript || []);
        if (s.phase === "done") return showResult(s.outcome, s.durationSecs);
        if (s.phase === "failed") { if (tick) clearInterval(tick); return; }
        pollTimer = setTimeout(poll, 1500);
      })
      .catch(function () { pollTimer = setTimeout(poll, 3000); });
  }

  function startCallView(phase) {
    setCallPhase(phase || "dialing");
    if (!pollTimer) poll();
  }

  // Reload mid-call (or after): pick the call view back up.
  if (callEl && !callEl.hidden) startCallView(callEl.dataset.phase === "none" ? "dialing" : callEl.dataset.phase);

  window.zerkabill = { setPhase: setPhase, countTo: countTo, startCallView: startCallView };
})();`;
}
